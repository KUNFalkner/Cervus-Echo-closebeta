"""阅后即焚正文的对称加密（Fernet）：正文只以密文落库，仅创始人可解密。

密钥取 TREEHOLE_BURN_KEY；dev 未设置时从 TREEHOLE_SECRET 派生，
prod 缺失直接抛错——与 auth.py:14-20 的 JWT 密钥同一套 fail fast 约定。
"""
import base64
import hashlib
import os

from cryptography.fernet import Fernet

_IS_PROD = os.getenv("TREEHOLE_ENV", "dev").lower() == "prod"


def _load_key() -> bytes:
    raw = os.getenv("TREEHOLE_BURN_KEY")
    if raw:
        return raw.encode()
    if _IS_PROD:
        raise RuntimeError("生产环境必须设置 TREEHOLE_BURN_KEY 环境变量")
    # ponytail: dev 回退从 JWT 密钥派生，少配一个变量；换 SECRET 会解不开旧密文，dev 可接受
    seed = os.getenv("TREEHOLE_SECRET", "cervus-dev-secret-change-in-prod").encode()
    return base64.urlsafe_b64encode(hashlib.sha256(seed).digest())


_FERNET = Fernet(_load_key())


def encrypt_text(plain: str) -> str:
    """明文 -> 密文字符串（URL-safe base64）。"""
    return _FERNET.encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt_text(token: str) -> str:
    """密文 -> 明文。密钥不匹配或密文被篡改时抛 InvalidToken。"""
    return _FERNET.decrypt(token.encode("ascii")).decode("utf-8")
