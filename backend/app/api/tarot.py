import os
import httpx
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional

from sqlalchemy.orm import Session

from app.auth import require_user
from app.models.database import get_db
from app.models.user import User as UserModel
from app.models.tarot_history import TarotHistory
from app.tarot_guide_loader import guide_available, guide_system_block, lookup_card_meaning

# 塔罗 AI 咨询师：用户问题 + 抽到的过去/现在/未来三张牌 → 解读文本
# 设计：可插拔的 OpenAI 兼容接口。配置了 TAROT_LLM_API_KEY 时调用真 LLM；
# 未配置或调用失败时，回退到内置规则式解读，保证无 key 也能端到端跑通。
router = APIRouter(prefix="/api/tarot", tags=["tarot"])


# ── 抽牌历史（跨端同步）──
class HistoryItem(BaseModel):
    date: str
    time: str = ""
    spread: str = "time"
    ts: int = 0
    question: str = ""
    cards: List[dict] = Field(default_factory=list)
    counsel: Optional[dict] = None


class HistoryIn(BaseModel):
    date: str
    time: str = ""
    spread: str = "time"
    ts: int = 0
    question: str = ""
    cards: List[dict] = Field(default_factory=list)
    counsel: Optional[dict] = None


@router.get("/history", response_model=List[HistoryItem])
async def get_history(user: UserModel = Depends(require_user), db: Session = Depends(get_db)):
    """拉取当前用户的抽牌历史（跨端一致的数据源，按 ts 倒序）。"""
    rows = (
        db.query(TarotHistory)
        .filter(TarotHistory.user_id == user.id)
        .order_by(TarotHistory.ts.desc())
        .all()
    )
    return [
        HistoryItem(date=r.date, time=r.time or "", spread=r.spread or "time", ts=r.ts,
                    question=r.question or "", cards=r.cards or [], counsel=r.counsel)
        for r in rows
    ]


@router.post("/history")
async def upsert_history(
    payload: HistoryIn,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    """按 (user_id, ts) upsert 一条历史；每条抽牌由 ts 唯一标识，故同日可累积多条。

    抽牌时前端用全新 ts 推送（新建一行）；之后「补问/AI 解读」用同一 ts 推送（更新该行）。
    """
    if not payload.date or not payload.ts:
        raise HTTPException(status_code=400, detail="缺少日期或时间戳")
    existing = (
        db.query(TarotHistory)
        .filter(TarotHistory.user_id == user.id, TarotHistory.ts == payload.ts)
        .first()
    )
    if existing:
        existing.question = payload.question
        existing.cards = payload.cards
        existing.counsel = payload.counsel
        existing.date = payload.date
        existing.time = payload.time
        existing.spread = payload.spread
        db.commit()
        return {"ok": True, "updated": True}
    row = TarotHistory(
        user_id=user.id,
        date=payload.date,
        time=payload.time,
        spread=payload.spread,
        ts=payload.ts,
        question=payload.question,
        cards=payload.cards,
        counsel=payload.counsel,
    )
    db.add(row)
    db.commit()
    return {"ok": True, "created": True}


@router.delete("/history/{ts}")
async def delete_history(ts: int, user: UserModel = Depends(require_user), db: Session = Depends(get_db)):
    """删除单条抽牌历史（按 user_id + ts 隔离，只能删自己的）。"""
    row = (
        db.query(TarotHistory)
        .filter(TarotHistory.user_id == user.id, TarotHistory.ts == ts)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="未找到该记录")
    db.delete(row)
    db.commit()
    return {"ok": True, "deleted": 1}


@router.delete("/history")
async def clear_history(user: UserModel = Depends(require_user), db: Session = Depends(get_db)):
    """清空当前用户全部抽牌历史。"""
    n = db.query(TarotHistory).filter(TarotHistory.user_id == user.id).delete()
    db.commit()
    return {"ok": True, "deleted": n}



class CardIn(BaseModel):
    position: str = ""          # 过去 / 现在 / 未来
    name: str
    en: str = ""
    orientation: str = "upright"  # upright | reversed
    upright: str = ""
    reversed: str = ""
    element: str = ""
    keywordsUp: List[str] = Field(default_factory=list)
    keywordsRev: List[str] = Field(default_factory=list)
    love: str = ""
    career: str = ""
    mood: str = ""
    spiritual: str = ""


class InterpretRequest(BaseModel):
    question: str = ""
    cards: List[CardIn] = Field(default_factory=list)
    focus: str = ""  # general | career | love —— 用户当前最关心的切面


SYSTEM_PROMPT = (
    "你是「星语」塔罗咨询师，语气神秘、温柔而有洞察力。"
    "用户会带着一个具体问题（或泛泛的人生困惑）来抽一组牌——可能是「过去·现在·未来」三张，"
    "也可能是「凯尔特十字」十张大局。请依据实际给出的牌阵来解读，不要假设牌数。\n"
    "请务必做到：\n"
    "1. 直接呼应用户的问题——不要回避，要就他面临的选择或困境给出明确态度"
    "（例如是否该换工作、该如何相处、该如何决断），而非只讲牌意。\n"
    "2. 逐张结合牌的正逆位与「爱情/事业/心境/灵性」各维度释义，说明它如何映照他当下处境。\n"
    "3. 把整组牌串成一条连贯的建议：过去/根源给了他什么、现在卡在哪里、未来指向什么行动。\n"
    "4. 用空行分段，约 180–320 字，结尾可加一句诗意收束。\n"
    "避免空泛套话（如「站在新旧临界点」），避免绝对化断言，不做医疗/法律/投资承诺。"
    "只输出纯文本，不要使用任何 Markdown 标记（如 **、#、-> 等）。"
)

# 少样本示例：给 8B 模型一个可直接模仿的「好解读」样本，远胜于负向禁止。
FEWSHOT_USER = (
    "用户的问题：我和男朋友最近总吵架，要不要分手？\n"
    "抽到的牌阵（过去 · 现在 · 未来）：\n"
    "- 过去：恋人（The Lovers）正位 —— 释义：真挚的联结与共同选择；关键词：爱、结合、抉择；"
    "维度：爱情：深刻的情感羁绊与彼此吸引；事业：合作顺遂；心境：甜蜜；灵性：合一\n"
    "- 现在：高塔（The Tower）逆位 —— 释义：剧烈冲突但结构未彻底崩塌；关键词：震荡、延缓；"
    "维度：爱情：矛盾激化却未决裂；事业：危机暂缓；心境：动荡；灵性：释放\n"
    "- 未来：星星（The Star）正位 —— 释义：希望与疗愈；关键词：希望、指引；"
    "维度：爱情：重燃信任的可能；事业：方向渐明；心境：平静；灵性：信念"
)
FEWSHOT_ASSISTANT = (
    "你问的是要不要结束这段关系，我们直接看牌面。\n\n"
    "过去「恋人」正位，说明你们曾有过真挚的联结与共同选择，这段感情有真实的基础，并非凭空而起。"
    "现在「高塔」逆位，提示冲突虽剧烈却尚未彻底崩塌——你正处在情绪的风暴眼，但结构还没碎。"
    "未来「星星」正位带来希望：只要愿意修复，关系有重新清澈的可能。\n\n"
    "如果分手是你的底线保护，牌不替你做决定；但若你仍眷恋，高塔逆位恰恰说「还来得及稳住」。"
    "建议先就一件具体的事沟通，而非在情绪最高点做不可逆的选择。\n\n"
    "夜空里两颗星也会彼此牵引，关键是你们是否还愿意一同抬头。"
)


def _orientation_cn(c: CardIn) -> str:
    return "正位" if c.orientation == "upright" else "逆位"


def _meaning(c: CardIn) -> str:
    return c.upright if c.orientation == "upright" else c.reversed


def _keywords(c: CardIn) -> str:
    kws = c.keywordsUp if c.orientation == "upright" else c.keywordsRev
    return "、".join(kws)


def _build_prompt(req: InterpretRequest, use_guide: bool = False) -> str:
    spread_hint = "celtic" if len(req.cards) == 10 else "time"
    lines = []
    if req.question.strip():
        lines.append(f"用户的问题：{req.question.strip()}")
    else:
        lines.append("用户未提出具体问题，请就牌阵整体给出人生/心态指引。")
    # 侧重切面：把用户当前最在乎的维度往前推，让解读更贴题
    if req.focus == "career":
        lines.append("（用户当前最关心事业 / 学业发展，请侧重结合各牌的「事业」维度与整体趋势给出建议。）")
    elif req.focus == "love":
        lines.append("（用户当前最关心感情 / 人际关系，请侧重结合各牌的「爱情」维度给出建议。）")
    if use_guide and spread_hint == "celtic":
        lines.append("抽到的牌阵（凯尔特十字 · 十张，位置含义见上方系统提示）：")
    else:
        lines.append("抽到的牌阵（过去 · 现在 · 未来）：")
    for i, c in enumerate(req.cards):
        ori = _orientation_cn(c)
        # 指南开启时，用复制来的荣格牌义替换紧凑释义（仅注入抽到的牌，不一次性灌 78 张）
        if use_guide:
            guide_meaning = lookup_card_meaning(c.en)
            if guide_meaning:
                lines.append(f"牌 {i + 1}（{c.position}）：{c.name}（{c.en or ''}）{ori}")
                lines.append("【荣格牌义参考】")
                lines.append(guide_meaning)
                lines.append("")  # 空行分隔
                continue
        # 原紧凑格式（指南未开启，或该牌未在指南中命中时的兜底）
        mean = _meaning(c)
        kws = _keywords(c)
        dims = []
        if c.love:
            dims.append(f"爱情：{c.love}")
        if c.career:
            dims.append(f"事业：{c.career}")
        if c.mood:
            dims.append(f"心境：{c.mood}")
        if c.spiritual:
            dims.append(f"灵性：{c.spiritual}")
        dim_str = "；维度：" + "；".join(dims) if dims else ""
        lines.append(
            f"- {c.position}：{c.name}（{c.en or ''}）{ori} —— 释义：{mean}；关键词：{kws}{dim_str}"
        )
    return "\n".join(lines)


def _builtin_interpret(req: InterpretRequest) -> str:
    parts = []
    for c in req.cards:
        ori = _orientation_cn(c)
        mean = _meaning(c)
        parts.append(f"【{c.position}】「{c.name}」{ori}：{mean}。")
    body = "".join(parts)
    head = (
        f"关于你问的「{req.question.strip()}」，星图这样回应——\n\n"
        if req.question.strip()
        else "星图为你展开——\n\n"
    )
    tail = "\n\n愿你在过去、现在与未来之间，听见自己真正的心声。"
    return head + body + tail


@router.post("/interpret")
async def interpret(req: InterpretRequest):
    if not req.cards:
        raise HTTPException(status_code=400, detail="缺少牌阵")

    # 触发真实 LLM 的条件：配了 API key，或显式配置了自定义基址（本地模型如
    # Ollama/LM Studio 可免 key，仅靠 BASE_URL 即可接入）。两者皆无则走内置解读。
    key = os.environ.get("TAROT_LLM_API_KEY", "")
    has_custom_base = "TAROT_LLM_BASE_URL" in os.environ
    if not (key or has_custom_base):
        return {"text": _builtin_interpret(req), "source": "builtin"}

    # 本地塔罗指南开关：默认关闭，不影响线上行为；开启后把复制来的荣格指南
    # 作为系统提示补充块注入、并用指南牌义替换每牌紧凑释义。qwen3 权重不动。
    use_guide = os.environ.get("TAROT_USE_GUIDE", "").lower() in ("1", "true", "yes", "on") and guide_available()
    spread_hint = "celtic" if len(req.cards) == 10 else "time"

    base = os.environ.get("TAROT_LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = os.environ.get("TAROT_LLM_MODEL", "gpt-4o-mini")
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    # 本地推理模型（如 qwen3）默认会先「思考」，把 token 预算耗在 reasoning 上，
    # 导致正文被截断、或耗时超过超时而被误判失败。对自定义基址（本地端点）关闭思考，
    # 让输出直接是解读正文；云端 OpenAI 不传此参数，避免未知字段报错。
    extra = {"enable_thinking": False} if has_custom_base else {}
    try:
        user_msg = _build_prompt(req, use_guide=use_guide)
        system_content = SYSTEM_PROMPT
        if use_guide:
            system_content = SYSTEM_PROMPT + "\n\n" + guide_system_block(spread_hint)
        messages = [
            {"role": "system", "content": system_content},
            # 少样本：先给一个「好解读」样本，让模型模仿格式与直接回应的语气
            {"role": "user", "content": FEWSHOT_USER},
            {"role": "assistant", "content": FEWSHOT_ASSISTANT},
            {"role": "user", "content": user_msg},
        ]
        # 十张凯尔特十字解读很长，800 token 会在牌5前后被截断；本地模型更慢，
        # 本地端点(自定义基址)放宽到 2000 token + 150s 超时，云端保持 800/30s 即可。
        local = has_custom_base
        async with httpx.AsyncClient(timeout=150 if local else 30) as client:
            resp = await client.post(
                f"{base}/chat/completions",
                headers=headers,
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": 0.6,
                    "max_tokens": 2000 if local else 800,
                    **extra,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            text = data["choices"][0]["message"]["content"].strip()
            return {"text": text, "source": "llm"}
    except Exception:
        # LLM 调用失败（限流 / 网络 / 格式异常）→ 安全回退到内置解读
        return {"text": _builtin_interpret(req), "source": "builtin-fallback"}
