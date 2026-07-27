import re
from typing import List

# 基础敏感词列表（可从 GitHub 同步更新）
DEFAULT_SENSITIVE_WORDS = [
    "傻逼", "操你", "妈的", "去死", "废物", "垃圾",
    "色情", "赌博", "诈骗", "暴力", "威胁",
]

class SensitiveWordFilter:
    def __init__(self, words: List[str] = None):
        self.words = words or DEFAULT_SENSITIVE_WORDS
        self.pattern = re.compile("|".join(re.escape(w) for w in self.words), re.IGNORECASE)

    def contains_sensitive(self, text: str) -> bool:
        return bool(self.pattern.search(text))

    def filter_text(self, text: str, replacement: str = "*") -> str:
        return self.pattern.sub(replacement, text)

    def update_words(self, words: List[str]):
        self.words = words
        self.pattern = re.compile("|".join(re.escape(w) for w in self.words), re.IGNORECASE)

# 全局实例
sensitive_filter = SensitiveWordFilter()
