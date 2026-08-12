"""轻量级内存滑动窗口限流。

单实例 uvicorn（nginx 反代）场景足够用，无需 Redis。
按 scope + 标识（用户ID 或客户端IP）计数，超限抛 429。
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict
from typing import Optional

from fastapi import HTTPException, Request

# key -> 该窗口内已发生的时间戳列表（秒级浮点）
_buckets: dict[str, list[float]] = defaultdict(list)
_lock = threading.Lock()

# 全量裁剪阈值：桶数量超过此值时，下次写入顺带清掉空桶，避免内存无限增长
_PRUNE_THRESHOLD = 2000


def get_client_ip(request: Request) -> str:
    """取真实客户端 IP。nginx 已在 /api/ 转发 X-Forwarded-For（首段真实 IP）。"""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        ip = xff.split(",")[0].strip()
        if ip:
            return ip
    xri = request.headers.get("x-real-ip")
    if xri:
        return xri.strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def rate_limit(
    scope: str,
    limit: int,
    seconds: int,
    *,
    user_id: Optional[int] = None,
    ip: Optional[str] = None,
) -> None:
    """滑动窗口计数。user_id 优先，否则用 ip。超限抛 429（带 Retry-After）。"""
    if user_id is not None:
        key = f"{scope}:u{user_id}"
    elif ip:
        key = f"{scope}:ip:{ip}"
    else:
        key = f"{scope}:anon"

    now = time.time()
    cutoff = now - seconds

    with _lock:
        win = _buckets[key]
        # 清理窗口外时间戳
        while win and win[0] < cutoff:
            win.pop(0)
        if len(win) >= limit:
            retry = int(seconds - (now - win[0])) + 1
            raise HTTPException(
                status_code=429,
                detail=f"操作过于频繁，请 {retry} 秒后再试",
                headers={"Retry-After": str(retry)},
            )
        win.append(now)
        # 周期性裁剪空桶（原地删除，避免重赋值导致作用域问题）
        if len(_buckets) > _PRUNE_THRESHOLD:
            for _k in [k for k, v in _buckets.items() if not v]:
                del _buckets[_k]
