"""塔罗解读指南加载器（独立副本，仅供本地模型参考，不修改模型权重）。

本模块读取 ``app/tarot_guide/`` 下从 ``miyaosk/tarot_guide_skill`` 复制而来的
SKILL.md 与 references/*.md，提供：

1. ``load_card_meanings()`` —— 解析 78 张牌的荣格牌义，按英文牌名建索引。
2. ``lookup_card_meaning(en)`` —— 根据抽到的牌的英文名查表。
3. ``guide_system_block(spread_hint)`` —— 生成「风格 + 牌阵位置含义 + 护栏」的补充提示，
   用于追加到 LLM 系统提示。

所有解析结果模块级缓存；指南目录缺失或解析失败都优雅降级（返回空/None），
不影响 tarot.py 原有（关闭指南时）的行为。
"""

from __future__ import annotations

import os
import re
from pathlib import Path

_GUIDE_DIR = Path(__file__).resolve().parent / "tarot_guide"
_REF_DIR = _GUIDE_DIR / "references"

_cache: dict = {}


def guide_available() -> bool:
    """指南目录与 references 是否就绪。"""
    return _REF_DIR.exists() and any(_REF_DIR.glob("*.md"))


def _norm(name: str) -> str:
    return (name or "").strip().lower()


def _extract_en(heading: str):
    """从牌面标题里取英文牌名，如 '0 - 愚者 The Fool' -> 'The Fool'。"""
    m = re.search(r"([A-Za-z][A-Za-z\s\-]*[A-Za-z])$", heading.strip())
    return m.group(1).strip() if m else None


def load_card_meanings() -> dict:
    """解析所有 reference 文件，返回 {英文牌名(小写): 牌义文本}。"""
    if "cards" in _cache:
        return _cache["cards"]
    cards: dict = {}
    if not _REF_DIR.exists():
        _cache["cards"] = cards
        return cards
    for f in sorted(_REF_DIR.glob("*.md")):
        if f.name == "spreads.md":
            continue
        try:
            text = f.read_text(encoding="utf-8")
        except Exception:
            continue
        for m in re.finditer(r"^##\s+(.+)$", text, re.MULTILINE):
            heading = m.group(1).strip()
            start = m.end()
            nxt = re.search(r"^##\s+", text[start:], re.MULTILINE)
            end = start + nxt.start() if nxt else len(text)
            section = text[start:end].strip()
            en = _extract_en(heading)
            if en:
                cards[_norm(en)] = f"【{heading}】\n{section}"
    _cache["cards"] = cards
    return cards


def lookup_card_meaning(en_name: str):
    """按英文牌名查荣格牌义；查不到返回 None。"""
    return load_card_meanings().get(_norm(en_name))


def guide_system_block(spread_hint: str = "time") -> str:
    """生成追加到系统提示的风格/牌阵/护栏补充块（纯文本，无 Markdown 图片）。"""
    parts = [
        "补充风格指引（荣格心理学视角，来自 tarot_guide 参考指南，仅作风格与视角参考，"
        "不与上方基础要求冲突）：你以荣格分析心理学 + 人本主义心理学视角解读——温暖而深刻，"
        "如一位智慧的朋友；不预言命运，把牌面当作潜意识与内在声音的映射；语言优雅、有意象感、"
        "简洁，每句话都有信息量。",
    ]
    if spread_hint == "celtic":
        parts.append(
            "当前为「凯尔特十字」十张牌阵，十个位置依次是：现状（当下处境）、挑战（横亘眼前的阻碍）、"
            "根源（形塑现状的过去根基）、近因（近来仍起作用的影响）、期许（心之所向的可能）、"
            "潜流（潜意识里的内在驱动）、自处（应对此事的态度）、环境（外部的人与境遇）、"
            "隐忧（心底的希望与恐惧）、终局（事情最终的走向）。请逐位置结合牌意，"
            "再把十张牌整合为一个整体叙事，重点呈现「主题与障碍的张力如何被核心建议化解」。"
        )
    else:  # time（默认）
        parts.append(
            "当前为「过去·现在·未来」三牌阵：过去 = 影响当前处境的根源与模式，"
            "现在 = 当下的核心状态与心理主题，未来 = 若沿当前轨迹发展的趋势与潜力"
            "（不是命定，而是当前能量的自然延伸）。请把三张牌串成一条叙事弧线："
            "过去如何塑造现在，现在的选择如何影响未来走向。"
        )
    parts.append(
        "护栏：不做确定性预测，用「这张牌暗示……」而非「你将会……」；"
        "遇到「塔」「死神」等牌着重转化与重生面向，不制造恐惧；"
        "若用户提到严重健康 / 法律 / 财务问题，一句话自然建议咨询专业人士；"
        "必须结合用户具体问题个性化，不泛泛而谈。"
        "输出保持纯文本（不使用 Markdown 标记与图片），约 180–360 字，用空行分段，"
        "结尾可加一句诗意收束；逐张解读后给出整体串联与一句行动指引。"
    )
    return "\n".join(parts)
