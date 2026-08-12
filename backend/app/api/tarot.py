import os
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List

# 塔罗 AI 咨询师：用户问题 + 抽到的过去/现在/未来三张牌 → 解读文本
# 设计：可插拔的 OpenAI 兼容接口。配置了 TAROT_LLM_API_KEY 时调用真 LLM；
# 未配置或调用失败时，回退到内置规则式解读，保证无 key 也能端到端跑通。
router = APIRouter(prefix="/api/tarot", tags=["tarot"])


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


SYSTEM_PROMPT = (
    "你是「星语」塔罗咨询师，语气神秘、温柔而有洞察力。"
    "结合用户的问题与「过去·现在·未来」三张牌（含正逆位与释义），"
    "用中文给出约 180–260 字的解读：先逐张点出牌意如何映照当下，"
    "再整合三张形成一条连贯的建议。避免绝对化断言，不做医疗/法律/投资承诺。"
    "用空行分段，可加一句诗意的收尾。"
    "只输出纯文本，不要使用任何 Markdown 标记（如 **、#、-、> 等）。"
)


def _orientation_cn(c: CardIn) -> str:
    return "正位" if c.orientation == "upright" else "逆位"


def _meaning(c: CardIn) -> str:
    return c.upright if c.orientation == "upright" else c.reversed


def _keywords(c: CardIn) -> str:
    kws = c.keywordsUp if c.orientation == "upright" else c.keywordsRev
    return "、".join(kws)


def _build_prompt(req: InterpretRequest) -> str:
    lines = []
    if req.question.strip():
        lines.append(f"用户的问题：{req.question.strip()}")
    else:
        lines.append("用户未提出具体问题，请就牌阵整体给出人生/心态指引。")
    lines.append("抽到的牌阵（过去 · 现在 · 未来）：")
    for c in req.cards:
        ori = _orientation_cn(c)
        mean = _meaning(c)
        kws = _keywords(c)
        lines.append(f"- {c.position}：{c.name}（{c.en or ''}）{ori} —— 释义：{mean}；关键词：{kws}")
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
        user_msg = _build_prompt(req)
        async with httpx.AsyncClient(timeout=45) as client:
            resp = await client.post(
                f"{base}/chat/completions",
                headers=headers,
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_msg},
                    ],
                    "temperature": 0.8,
                    "max_tokens": 1100,
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
