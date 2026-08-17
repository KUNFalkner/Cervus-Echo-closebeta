"""全文搜索索引（FTS5 + trigram 分词器）。

设计要点：
- 用两张 FTS5 虚拟表 `posts_fts` / `comments_fts` 承接标题/正文/评论内容。
- 用 `tokenize='trigram'` 让中文也能做子串匹配（LIKE 的替代，速度更快、可扩展）。
- trigram 的限制：**查询必须 ≥3 个字符**，否则 MATCH 返回空/报错；因此上层在 <3 字时回退 LIKE。
- FTS 表的 rowid 直接复用业务表主键（post.id / comment.id），删除时按 rowid 删。
- 索引写入用 `INSERT OR REPLACE`，因此新建与编辑（reindex）可共用同一函数。
- 启动时幂等建表 + 回填，保证旧库上的存量数据也能被搜到。
"""
from sqlalchemy import text

from app.models.database import engine, SessionLocal

POSTS_FTS = "posts_fts"
COMMENTS_FTS = "comments_fts"


def ensure_fts_tables():
    """幂等创建 FTS 虚拟表（库已存在则跳过）。"""
    try:
        with engine.begin() as conn:
            conn.execute(text(
                f"CREATE VIRTUAL TABLE IF NOT EXISTS {POSTS_FTS} "
                f"USING fts5(title, content, tokenize='trigram')"
            ))
            conn.execute(text(
                f"CREATE VIRTUAL TABLE IF NOT EXISTS {COMMENTS_FTS} "
                f"USING fts5(content, tokenize='trigram')"
            ))
        print("[FTS] 虚拟表已就绪")
    except Exception as e:
        print(f"[FTS] 创建虚拟表失败（搜索将回退 LIKE）: {e}")


def _phrase(q: str) -> str:
    """把查询串包成 FTS5 短语，内部双引号转义（trigram 下短语=子串匹配）。"""
    return '"' + q.replace('"', '""') + '"'


def index_post(db, post) -> None:
    """插入或覆盖一条帖子索引（rowid = post.id）。"""
    db.execute(
        text(f"INSERT OR REPLACE INTO {POSTS_FTS}(rowid, title, content) VALUES(:id, :t, :c)"),
        {"id": post.id, "t": post.title or "", "c": post.content or ""},
    )


def remove_post(db, post_id: int) -> None:
    db.execute(text(f"DELETE FROM {POSTS_FTS} WHERE rowid=:id"), {"id": post_id})


def index_comment(db, comment) -> None:
    db.execute(
        text(f"INSERT OR REPLACE INTO {COMMENTS_FTS}(rowid, content) VALUES(:id, :c)"),
        {"id": comment.id, "c": comment.content or ""},
    )


def remove_comment(db, comment_id: int) -> None:
    db.execute(text(f"DELETE FROM {COMMENTS_FTS} WHERE rowid=:id"), {"id": comment_id})


def search_post_ids(db, q: str):
    """返回匹配帖子的 id 列表；trigram 要求 q ≥ 3 字符。"""
    rows = db.execute(
        text(f"SELECT rowid FROM {POSTS_FTS} WHERE {POSTS_FTS} MATCH :q"),
        {"q": _phrase(q)},
    ).all()
    return [r[0] for r in rows]


def search_comment_ids(db, q: str):
    rows = db.execute(
        text(f"SELECT rowid FROM {COMMENTS_FTS} WHERE {COMMENTS_FTS} MATCH :q"),
        {"q": _phrase(q)},
    ).all()
    return [r[0] for r in rows]


def backfill_fts():
    """把存量帖子/评论补进 FTS（已存在的 rowid 跳过，可重复调用）。"""
    try:
        with SessionLocal() as db:
            db.execute(text(
                f"INSERT INTO {POSTS_FTS}(rowid, title, content) "
                f"SELECT id, COALESCE(title, ''), COALESCE(content, '') FROM posts "
                f"WHERE id NOT IN (SELECT rowid FROM {POSTS_FTS})"
            ))
            db.execute(text(
                f"INSERT INTO {COMMENTS_FTS}(rowid, content) "
                f"SELECT id, COALESCE(content, '') FROM comments "
                f"WHERE id NOT IN (SELECT rowid FROM {COMMENTS_FTS})"
            ))
            db.commit()
        print("[FTS] 存量数据回填完成")
    except Exception as e:
        print(f"[FTS] 存量回填失败（不影响启动，新帖仍会被索引）: {e}")
