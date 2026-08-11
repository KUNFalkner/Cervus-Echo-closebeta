"""密码哈希：bcrypt（带盐），并兼容历史遗留的无盐 sha256。"""
import hashlib

import bcrypt

# bcrypt 只取前 72 字节，超长部分会被静默丢弃（4.x 直接报错），这里统一截断
_MAX_BYTES = 72


def _to_bytes(raw: str) -> bytes:
    return raw.encode("utf-8")[:_MAX_BYTES]


def is_legacy_hash(stored: str) -> bool:
    """旧格式：64 位十六进制的裸 sha256。"""
    return len(stored) == 64 and all(c in "0123456789abcdef" for c in stored.lower())


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(_to_bytes(raw), bcrypt.gensalt()).decode("utf-8")


def verify_password(raw: str, stored: str) -> bool:
    if not stored:
        return False
    if is_legacy_hash(stored):
        return hashlib.sha256(raw.encode("utf-8")).hexdigest() == stored
    try:
        return bcrypt.checkpw(_to_bytes(raw), stored.encode("utf-8"))
    except ValueError:
        return False
