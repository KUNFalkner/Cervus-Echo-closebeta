import re
from typing import List, Tuple

# 违禁词库（2026-09-17 扩展版：辱骂/色情/赌博/毒品/诈骗/暴力/危险品/违法交易）。
# 站长要求：命中直接拦截（拒发），不是打码。词库可持续补充。
DEFAULT_SENSITIVE_WORDS = [
    # 辱骂攻击
    "傻逼", "煞笔", "沙比", "操你", "艹你", "日你", "妈的", "他妈的", "你妈",
    "去死", "找死", "废物", "垃圾人", "贱人", "婊", "妓", "滚蛋", "畜生", "杂种",
    "脑残", "弱智", "白痴", "蠢货", "死全家", "拿刀砍你", "打死你",
    # 色情
    "色情", "淫", "卖淫", "嫖娼", "一夜情", "约炮", "援交", "裸聊", "做爱",
    "打飞机", "口交", "肛交", "强奸", "轮奸", "性奴", "援交女",
    # 赌博
    "赌博", "赌场", "博彩", "下注", "六合彩", "时时彩", "百家乐", "网赌", "赌球", "赌钱",
    # 毒品
    "毒品", "吸毒", "冰毒", "海洛因", "大麻", "摇头丸", "k粉", "麻古", "上头电子烟",
    # 诈骗/违法交易
    "诈骗", "骗钱", "传销", "刷单", "兼职点赞", "套路贷", "高利贷", "洗钱",
    "办证", "代开发票", "假钞", "假币", "卖淫女", "包小姐",
    # 暴力/危险
    "自杀教程", "自残", "买凶", "雇凶", "枪", "弹药", "炸药", "雷管", "管制刀具",
    "杀人", "砍人", "血洗", "报复社会",
    # 其他违法
    "翻墙软件代购", "黑产", "木马", "外挂出售", "代考", "作弊器材",
]

class SensitiveWordFilter:
    def __init__(self, words: List[str] = None):
        self.words = words or DEFAULT_SENSITIVE_WORDS
        self._compile()

    def _compile(self):
        # 按长度倒序 + 词边界无关（中文无词界），最长优先避免子串误拦
        ws = sorted(set(w for w in self.words if w), key=len, reverse=True)
        self.pattern = re.compile("|".join(re.escape(w) for w in ws), re.IGNORECASE)

    def contains_sensitive(self, text: str) -> bool:
        return bool(self.pattern.search(text or ""))

    def find_hits(self, text: str) -> List[str]:
        """返回命中的词（去重），用于给用户的提示。"""
        if not text:
            return []
        found = self.pattern.findall(text)
        # 保留原始大小写去重
        return sorted(set(found), key=len, reverse=True)

    def filter_text(self, text: str, replacement: str = "*") -> str:
        return self.pattern.sub(replacement, text or "")

    def update_words(self, words: List[str]):
        self.words = words
        self._compile()

# 全局实例
sensitive_filter = SensitiveWordFilter()
