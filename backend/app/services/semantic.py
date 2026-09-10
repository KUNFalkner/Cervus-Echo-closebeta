"""语义搜索（本地 Ollama 嵌入 + SQLite 向量表）。

为什么需要它
------------
FTS5/trigram 只能做「字面」匹配：搜「心情不好」找不到写着「emo 了」的帖子。
本模块用嵌入模型把帖子映射成向量，按语义相似度检索，补上这一块。

设计要点
--------
- 模型：bge-m3（Ollama，1024 维，中文强）。**只依赖 Ollama，无新增 Python 依赖**。
- 向量存储：SQLite 表 `post_vectors`，向量以 float32 小端 BLOB 存（struct 打包）。
  当前库规模（百帖级）全量载入 + numpy 余弦相似度仅需毫秒级，无需专用向量库；
  上万帖时再考虑缓存或 FAISS，接口不变。
- 延迟现实：本机实测 Ollama 每次嵌入请求约 1.3s **固定开销**（与模型大小无关，
  换 24M 小模型仅快 0.5s）。因此上层应「关键词结果先出、语义结果后补」，
  而不是让用户干等；本模块只负责给出按相似度排序的 id。
- 缓存：查询向量按 LRU 缓存（重复搜索即时返回）；模型用 keep_alive 常驻，
  避免 20s+ 的冷加载。
- 隐私：本模块**只产出 post_id + 相似度**，可见性过滤一律由调用方
  （posts.py 里同一套可见性查询）负责——规则不重复实现，就不会漂移。
- 降级：Ollama 不可用/模型缺失时，所有函数返回 None/空，调用方静默回退关键词搜索。
"""
import concurrent.futures
import os
import struct
import threading
from collections import OrderedDict
from typing import List, Optional, Sequence, Tuple

import httpx

from app.models.database import SessionLocal, engine
from sqlalchemy import text

# ── 配置（走环境变量，默认指向本机 Ollama）──
BASE_URL = os.environ.get("SEMANTIC_BASE_URL", "http://localhost:11434").rstrip("/")
MODEL = os.environ.get("SEMANTIC_MODEL", "bge-m3")
KEEP_ALIVE = os.environ.get("SEMANTIC_KEEP_ALIVE", "30m")
ENABLED = os.environ.get("SEMANTIC_ENABLED", "1").lower() not in ("0", "false", "no", "off")
TIMEOUT = float(os.environ.get("SEMANTIC_TIMEOUT", "20"))
# 单条帖子参与嵌入的文本上限（标题+正文），过长截断以控延迟
MAX_CHARS = int(os.environ.get("SEMANTIC_MAX_CHARS", "1200"))
# 语义候选池：先按相似度取这么多，再交给调用方做可见性过滤
POOL = int(os.environ.get("SEMANTIC_POOL", "300"))

VECTORS_TABLE = "post_vectors"

_client: Optional[httpx.Client] = None
_query_cache: "OrderedDict[str, List[float]]" = OrderedDict()
_cache_lock = threading.Lock()
_QUERY_CACHE_MAX = 128


def _get_client() -> httpx.Client:
    """惰性建长连接客户端：复用 TCP 连接可省掉每请求约 1s 的握手开销。"""
    global _client
    if _client is None:
        _client = httpx.Client(timeout=TIMEOUT, headers={"Content-Type": "application/json"})
    return _client


# ── 向量序列化 ──
def _pack(vec: Sequence[float]) -> bytes:
    return struct.pack(f"<{len(vec)}f", *vec)


def _unpack(blob: bytes, dim: int) -> List[float]:
    return list(struct.unpack(f"<{dim}f", blob))


def ensure_vector_table() -> None:
    """幂等创建向量表（纯 SQL，不走 ORM 迁移）。"""
    try:
        with engine.begin() as conn:
            conn.execute(text(
                f"CREATE TABLE IF NOT EXISTS {VECTORS_TABLE} ("
                "post_id INTEGER PRIMARY KEY, "
                "dim INTEGER NOT NULL, "
                "vec BLOB NOT NULL, "
                "model TEXT NOT NULL, "
                "updated_at TEXT DEFAULT CURRENT_TIMESTAMP)"
            ))
        print("[语义] 向量表已就绪")
    except Exception as e:
        print(f"[语义] 建向量表失败（语义搜索将不可用）: {e}")


# ── 嵌入调用 ──
def embed(texts: List[str]) -> Optional[List[List[float]]]:
    """调 Ollama 批量嵌入。失败返回 None（调用方回退）。"""
    if not ENABLED or not texts:
        return None
    try:
        r = _get_client().post(
            f"{BASE_URL}/api/embed",
            json={"model": MODEL, "input": texts, "keep_alive": KEEP_ALIVE},
        )
        r.raise_for_status()
        embs = r.json().get("embeddings")
        if embs and len(embs) == len(texts):
            return embs
        return None
    except Exception as e:
        print(f"[语义] 嵌入失败（回退关键词）: {e}")
        return None


def embed_query(q: str) -> Optional[List[float]]:
    """查询向量（带 LRU 缓存：学生反复搜同一句不必重复算）。"""
    key = q.strip()
    if not key:
        return None
    with _cache_lock:
        if key in _query_cache:
            _query_cache.move_to_end(key)
            return _query_cache[key]
    out = embed([key])
    if not out:
        return None
    vec = out[0]
    with _cache_lock:
        _query_cache[key] = vec
        _query_cache.move_to_end(key)
        while len(_query_cache) > _QUERY_CACHE_MAX:
            _query_cache.popitem(last=False)
    return vec


def post_text(post) -> str:
    """帖子参与嵌入的文本：标题 + 正文（+标签），截断到上限。"""
    parts = [post.title or "", post.content or "", post.tags or ""]
    return (" ".join(p for p in parts if p).strip())[:MAX_CHARS]


_MIN_INDEX_CHARS = 4


def indexable(txt: str) -> bool:
    """无意义内容不建向量。

    太短（如正文只有「1」）或纯数字/符号的文本，嵌入向量缺乏区分度，
    会在**任何**查询下都拿到偏高的余弦分并浮到结果顶部，污染搜索。
    实测：正文为「1」的测试帖在查询「测试」下拿到 0.83 分。"""
    t = (txt or "").strip()
    if len(t) < _MIN_INDEX_CHARS:
        return False
    return any(("\u4e00" <= ch <= "\u9fff") or ch.isalpha() for ch in t)


# ── 索引写入 ──
def index_post_vector(db, post) -> bool:
    """为一条帖子写向量（插入/更新共用）。失败静默（不阻塞发帖）。"""
    txt = post_text(post)
    if not indexable(txt):
        # 内容无效/被编辑成无意义：清掉可能存在的旧向量，避免陈旧向量残留
        remove_post_vector(db, post.id)
        return False
    out = embed([txt])
    if not out:
        return False
    vec = out[0]
    try:
        db.execute(
            text(f"INSERT OR REPLACE INTO {VECTORS_TABLE}(post_id, dim, vec, model, updated_at) "
                 "VALUES(:pid, :dim, :vec, :model, CURRENT_TIMESTAMP)"),
            {"pid": post.id, "dim": len(vec), "vec": _pack(vec), "model": MODEL},
        )
        return True
    except Exception as e:
        print(f"[语义] 写向量失败 post={getattr(post, 'id', '?')}: {e}")
        return False


def remove_post_vector(db, post_id: int) -> None:
    try:
        db.execute(text(f"DELETE FROM {VECTORS_TABLE} WHERE post_id=:pid"), {"pid": post_id})
    except Exception as e:
        print(f"[语义] 删向量失败 post={post_id}: {e}")


# 发帖不能让用户等 1.3s 的嵌入：后台单线程排队算向量（串行，避免打爆 Ollama）
_executor = concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix="semantic")


def index_post_async(post_id: int) -> None:
    """提交后台索引任务（发帖/编辑后调用，立即返回）。"""
    if not ENABLED:
        return
    _executor.submit(_index_post_worker, post_id)


def _index_post_worker(post_id: int) -> None:
    from app.models.post import Post as _Post
    try:
        with SessionLocal() as db:
            p = db.query(_Post).filter(_Post.id == post_id).first()
            if p and index_post_vector(db, p):
                db.commit()
    except Exception as e:
        print(f"[语义] 后台索引失败 post={post_id}: {e}")


# ── 检索 ──
def semantic_ids(db, q: str, limit: int = POOL) -> Optional[List[Tuple[int, float]]]:
    """返回 [(post_id, 相似度)]，按相似度降序；不可用时 None。"""
    qv = embed_query(q)
    if qv is None:
        return None
    rows = db.execute(text(f"SELECT post_id, dim, vec FROM {VECTORS_TABLE}")).all()
    if not rows:
        return []
    try:
        import numpy as np
        qa = np.asarray(qv, dtype="float32")
        qn = qa / (np.linalg.norm(qa) + 1e-9)
        ids, mats = [], []
        for pid, dim, blob in rows:
            if dim != len(qv):
                continue  # 换模型后的旧向量，跳过（回填会补）
            ids.append(pid)
            mats.append(np.frombuffer(blob, dtype="<f4", count=dim))
        if not ids:
            return []
        m = np.vstack(mats)
        norms = np.linalg.norm(m, axis=1) + 1e-9
        sims = (m @ qn) / norms
        order = np.argsort(-sims)[:limit]
        return [(ids[i], float(sims[i])) for i in order]
    except Exception as e:
        # numpy 缺失时退化为纯 Python（慢但可用）
        print(f"[语义] numpy 路径失败，退化为纯 Python: {e}")
        import math
        qn = math.sqrt(sum(x * x for x in qv)) + 1e-9
        scored = []
        for pid, dim, blob in rows:
            if dim != len(qv):
                continue
            v = _unpack(blob, dim)
            dot = sum(a * b for a, b in zip(v, qv))
            vn = math.sqrt(sum(x * x for x in v)) + 1e-9
            scored.append((pid, dot / (vn * qn)))
        scored.sort(key=lambda t: -t[1])
        return scored[:limit]


# ── 启动回填 + 预热（后台线程，不阻塞服务启动）──
def _purge_vectors(db) -> int:
    """清掉不该存在的向量：帖子已删（孤儿）或内容已不合格（过短/无意义）。

    没有这一步，早期索引进去的垃圾帖会一直以高分污染搜索。"""
    n = 0
    r = db.execute(text(
        f"DELETE FROM {VECTORS_TABLE} WHERE post_id NOT IN (SELECT id FROM posts)"
    ))
    n += r.rowcount or 0
    rows = db.execute(text(
        f"SELECT v.post_id, p.title, p.content, p.tags FROM {VECTORS_TABLE} v "
        f"JOIN posts p ON p.id = v.post_id"
    )).all()
    for pid, title, content, tags in rows:
        txt = " ".join(x for x in [title or "", content or "", tags or ""] if x).strip()
        if not indexable(txt):
            remove_post_vector(db, pid)
            n += 1
    return n


def _backfill_worker():
    try:
        with SessionLocal() as db:
            purged = _purge_vectors(db)
            db.commit()
            if purged:
                print(f"[语义] 已清除不合格向量：{purged} 条")
            rows = db.execute(text(
                f"SELECT p.id, p.title, p.content, p.tags FROM posts p "
                f"WHERE p.id NOT IN (SELECT post_id FROM {VECTORS_TABLE}) "
                f"ORDER BY p.id DESC"
            )).all()
            if not rows:
                print("[语义] 回填：无待索引帖子")
                return
            print(f"[语义] 回填开始：{len(rows)} 条")
            done = 0
            for pid, title, content, tags in rows:
                class _P:  # 轻量壳，避免把 ORM 对象跨会话传递
                    pass
                p = _P()
                p.id, p.title, p.content, p.tags = pid, title, content, tags
                if index_post_vector(db, p):
                    done += 1
                    if done % 10 == 0:
                        db.commit()
            db.commit()
            print(f"[语义] 回填完成：{done}/{len(rows)}")
    except Exception as e:
        print(f"[语义] 回填失败（不影响启动）: {e}")


def warmup():
    """预热模型：把 20s+ 的冷加载挪到启动时，用户首次搜索就快。"""
    try:
        embed(["预热"])
        print("[语义] 模型预热完成")
    except Exception as e:
        print(f"[语义] 预热失败: {e}")


def start_background_setup():
    """启动后台线程：预热 + 回填（幂等，失败不影响服务）。"""
    if not ENABLED:
        print("[语义] 已禁用（SEMANTIC_ENABLED=0）")
        return
    def _run():
        warmup()
        _backfill_worker()
    threading.Thread(target=_run, name="semantic-setup", daemon=True).start()


def status() -> dict:
    """诊断用：模型是否可用、已索引多少帖。"""
    info = {"enabled": ENABLED, "model": MODEL, "base": BASE_URL}
    try:
        with engine.begin() as conn:
            info["indexed"] = conn.execute(text(f"SELECT COUNT(*) FROM {VECTORS_TABLE}")).scalar()
        info["reachable"] = embed(["ping"]) is not None
    except Exception as e:
        info["error"] = str(e)
    return info
