"""通知创建辅助：在评论 / 点赞 / @ 提及时生成通知。

设计取舍：
- 自己触发的不通知自己（点赞自己、评论自己帖子、@ 自己都不发）。
- 重复动作（如反复点赞）会产生多条通知，但前端可折叠；MVP 阶段以简单可靠优先。
- 通知写入失败不应影响主流程，因此这里只负责"尽量写"，异常交由调用方吞掉。
"""
import re
from sqlalchemy.orm import Session
from app.models.notification import Notification
from app.models.user import User as UserModel


def create_notification(db: Session, *, recipient_id: int, actor_id: int = None,
                        actor_name: str = None, ntype: str = "reply",
                        post_id: int = None, comment_id: int = None,
                        post_title: str = None) -> None:
    if recipient_id is None or recipient_id == actor_id:
        return
    db.add(Notification(
        recipient_id=recipient_id,
        actor_id=actor_id,
        actor_name=actor_name,
        type=ntype,
        post_id=post_id,
        comment_id=comment_id,
        post_title=post_title,
    ))
    db.commit()


# 评论里 @用户名 的提取（@ 后跟非空白字符，最长 20）
_MENTION_RE = re.compile(r"@([^\s@]{1,20})")


def notify_from_comment(db: Session, *, post, comment, actor: UserModel) -> None:
    """评论产生两类通知：① 帖子作者的新回复；② 评论中 @ 提及的人。"""
    # ① 通知帖子作者（非自己评论）
    create_notification(
        db, recipient_id=post.user_id, actor_id=actor.id,
        actor_name=comment.display_name or actor.nickname or actor.username,
        ntype="reply", post_id=post.id, comment_id=comment.id,
        post_title=post.title,
    )
    # ② @ 提及：在评论内容里找 @用户名，匹配已注册用户
    mentioned = set(_MENTION_RE.findall(comment.content or ""))
    if mentioned:
        users = db.query(UserModel).filter(UserModel.username.in_(mentioned)).all()
        for u in users:
            create_notification(
                db, recipient_id=u.id, actor_id=actor.id,
                actor_name=comment.display_name or actor.nickname or actor.username,
                ntype="mention", post_id=post.id, comment_id=comment.id,
                post_title=post.title,
            )


def notify_like(db: Session, *, post, actor: UserModel) -> None:
    """点赞通知帖子作者。"""
    create_notification(
        db, recipient_id=post.user_id, actor_id=actor.id,
        actor_name=actor.nickname or actor.username,
        ntype="like", post_id=post.id, post_title=post.title,
    )
