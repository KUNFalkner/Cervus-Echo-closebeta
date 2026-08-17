from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.auth import get_current_user, require_user
from app.models.database import get_db
from app.models.post import Post as PostModel, Comment as CommentModel
from app.models.user import User as UserModel
from app.models.star import UserStar
from app.models.like import UserLike
from app.models.follow import Follow
from app.schemas.post import PostCreate, Post as PostSchema, CommentCreate, CommentUpdate, Comment as CommentSchema
from app.schemas.social import PostUpdate
from app.services.perm import assert_can_moderate, can_see_uid
from app.services.sensitive_words import sensitive_filter
from app.services.mute import is_muted, mute_message
from app.services.notif import notify_from_comment, notify_like, notify_star
from app.core.ratelimit import rate_limit
from app.search_index import (
    index_post, remove_post, index_comment, remove_comment,
    search_post_ids, search_comment_ids,
)

router = APIRouter()

# 创始人UID
FOUNDER_UID = "AAA00000000"

def can_see_forum(user: Optional[UserModel], forum_code: str) -> bool:
    """检查用户是否可以看到某个论坛"""
    if not user:
        return forum_code == "main"
    # 创始人和大使可以看到所有论坛
    if user.role in ["founder", "ambassador"]:
        return True
    # 普通用户可以看到主论坛和自己学校的论坛
    return forum_code == "main" or forum_code == user.school_id

def can_post_in_forum(user: Optional[UserModel], forum_code: str) -> bool:
    """检查用户是否可以在某个论坛发帖"""
    if not user:
        return False
    # 创始人可以在任何论坛发帖
    if user.role == "founder":
        return True
    # 大使可以在主论坛和自己学校发帖
    if user.role == "ambassador":
        return forum_code == "main" or forum_code == user.school_id
    # 普通用户可以在主论坛和自己学校发帖
    return forum_code == "main" or forum_code == user.school_id

def can_post_announcement(user: Optional[UserModel], forum_code: str) -> bool:
    """检查用户是否可以在某个论坛发布公告"""
    if not user:
        return False
    # 创始人可以在任何论坛发布公告
    if user.role == "founder":
        return True
    # 大使只能在自己学校发布公告
    if user.role == "ambassador":
        return forum_code == user.school_id
    return False


def _mask_post(post: PostModel, viewer: Optional[UserModel], author_avatar: Optional[str] = None) -> PostSchema:
    """UID 是学生的真实身份，不能无条件下发——按可见性规则在服务端抹掉。
    头像同理：匿名帖（hide_uid）一律不下发真实头像，避免去匿名化。"""
    data = PostSchema.model_validate(post)
    if not can_see_uid(viewer, bool(post.hide_uid), post.user_school):
        data.user_uid = None
    data.author_avatar = author_avatar if not post.hide_uid else None
    return data


def _mask_comment(comment: CommentModel, viewer: Optional[UserModel], author_avatar: Optional[str] = None) -> CommentSchema:
    data = CommentSchema.model_validate(comment)
    if not can_see_uid(viewer, bool(comment.hide_uid)):
        data.user_uid = None
    data.author_avatar = author_avatar if not comment.hide_uid else None
    return data


def _avatar_map(db: Session, user_ids) -> dict:
    if not user_ids:
        return {}
    rows = db.query(UserModel.id, UserModel.avatar).filter(UserModel.id.in_(user_ids)).all()
    return {r.id: r.avatar for r in rows}


@router.post("/", response_model=PostSchema)
def create_post(
    post: PostCreate,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    # 频率限制：发帖 5 条/分钟
    rate_limit("post", 5, 60, user_id=user.id)
    # 禁言拦截
    if is_muted(user):
        raise HTTPException(status_code=403, detail=mute_message(user))

    # 检查论坛权限
    if not can_post_in_forum(user, post.forum):
        raise HTTPException(status_code=403, detail="无权在此论坛发帖")

    # 检查公告权限
    if post.is_announcement and not can_post_announcement(user, post.forum):
        raise HTTPException(status_code=403, detail="无权发布公告")

    # 敏感词过滤
    post.title = sensitive_filter.filter_text(post.title)
    post.content = sensitive_filter.filter_text(post.content)

    # 身份字段一律以服务端认证结果为准，不接受客户端自报
    post_data = post.model_dump()
    post_data["user_id"] = user.id
    post_data["username"] = user.username
    post_data["user_uid"] = user.uid
    post_data["user_school"] = user.school_id
    # 图片 URL 列表落库为逗号分隔字符串
    post_data["images"] = ",".join(post.images) if post.images else None

    db_post = PostModel(**post_data)
    db.add(db_post)
    db.commit()
    db.refresh(db_post)
    # 同步全文索引
    try:
        index_post(db, db_post)
        db.commit()
    except Exception as _e:
        print(f"[FTS] 索引帖子失败: {_e}")
    return _mask_post(db_post, user, author_avatar=user.avatar)

@router.get("/", response_model=List[PostSchema])
def read_posts(
    skip: int = 0,
    limit: int = 100,
    user_id: Optional[int] = Query(None, description="按作者筛选（他人主页/我的帖子）"),
    category: Optional[str] = Query(None, description="按分类筛选"),
    forum: Optional[str] = Query(None, description="按论坛筛选"),
    search: Optional[str] = Query(None, description="搜索标题和内容"),
    tag: Optional[str] = Query(None, description="按标签筛选（精确匹配某个标签）"),
    sort: Optional[str] = Query(None, description="排序：latest(默认) / hot(按点赞+评论+收藏加权降序)"),
    following: bool = Query(False, description="只看我关注的人发的帖"),
    current_user: Optional[UserModel] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(PostModel)

    # 论坛权限过滤
    if current_user:
        visible_forums = ["main"]
        if current_user.school_id:
            visible_forums.append(current_user.school_id)
        if current_user.role in ["founder", "ambassador"]:
            visible_forums = None
    else:
        visible_forums = ["main"]

    if visible_forums is not None:
        query = query.filter(PostModel.forum.in_(visible_forums))

    # 意见箱隐私：只有本人、本校大使、创始人能看到
    if current_user:
        if current_user.role == "founder":
            pass  # 创始人看所有
        elif current_user.role == "ambassador":
            query = query.filter(
                (~PostModel.category.contains("feedback")) |
                (PostModel.user_school == current_user.school_id) |
                (PostModel.user_id == current_user.id)
            )
        else:
            query = query.filter(
                (~PostModel.category.contains("feedback")) |
                (PostModel.user_id == current_user.id)
            )

    if category:
        # 分类以逗号分隔存储(如 "general,study")，需按分隔符匹配，避免多分类帖子在筛选时漏掉
        query = query.filter(
            (PostModel.category == category) |
            PostModel.category.like(f"%,{category},%") |
            PostModel.category.like(f"{category},%") |
            PostModel.category.like(f"%,{category}")
        )
    if forum:
        query = query.filter(PostModel.forum == forum)
    if user_id:
        query = query.filter(PostModel.user_id == user_id)
    # 关注流：只看我关注的用户发的帖
    if following and current_user:
        fids = [r[0] for r in db.query(Follow.followee_id).filter(Follow.follower_id == current_user.id).all()]
        if fids:
            query = query.filter(PostModel.user_id.in_(fids))
        else:
            # 没关注任何人，直接返回空结果（避免全量泄露）
            query = query.filter(PostModel.id == -1)
    if search:
        # ≥3 字走 FTS5 全文索引（trigram 子串匹配），更准更快；<3 字回退 LIKE
        if len(search) >= 3:
            try:
                ids = search_post_ids(db, search)
                query = query.filter(PostModel.id.in_(ids)) if ids else query.filter(PostModel.id == -1)
            except Exception as _e:
                print(f"[FTS] 帖子搜索回退 LIKE: {_e}")
                query = query.filter(
                    (PostModel.title.contains(search)) | (PostModel.content.contains(search))
                )
        else:
            query = query.filter(
                (PostModel.title.contains(search)) | (PostModel.content.contains(search))
            )
    if tag:
        # 标签以逗号分隔存储，需按分隔符匹配，避免多标签帖子在筛选时漏掉
        query = query.filter(
            (PostModel.tags == tag) |
            PostModel.tags.like(f"%,{tag},%") |
            PostModel.tags.like(f"{tag},%") |
            PostModel.tags.like(f"%,{tag}")
        )

    # 热度分 = 点赞*2 + 评论*3 + 收藏*2（评论权重更高，鼓励讨论）；
    # 公告恒定置顶，发布时间作为同分兜底。
    _hot = (PostModel.like_count * 2 + PostModel.comment_count * 3 + PostModel.star_count * 2)
    if sort == "hot":
        query = query.order_by(PostModel.is_announcement.desc(), _hot.desc(), PostModel.created_at.desc())
    else:
        query = query.order_by(PostModel.is_announcement.desc(), PostModel.created_at.desc())
    posts = query.offset(skip).limit(limit).all()
    avatar_map = _avatar_map(db, [p.user_id for p in posts])
    return [_mask_post(p, current_user, avatar_map.get(p.user_id)) for p in posts]

@router.get("/comments/search")
def search_comments(
    q: str = Query(..., min_length=1, max_length=40, description="搜索评论内容"),
    limit: int = Query(20, le=100),
    current_user: Optional[UserModel] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """全局搜索评论内容，返回匹配评论及其所属帖子信息（带论坛可见性过滤）。"""
    if current_user and current_user.role in ["founder", "ambassador"]:
        visible_forums = None
    else:
        visible_forums = ["main"]
        if current_user and current_user.school_id:
            visible_forums.append(current_user.school_id)
    query = (
        db.query(CommentModel, PostModel)
        .join(PostModel, PostModel.id == CommentModel.post_id)
    )
    if visible_forums is not None:
        query = query.filter(PostModel.forum.in_(visible_forums))
    # ≥3 字走 FTS5 全文索引，<3 字回退 LIKE
    if len(q) >= 3:
        try:
            ids = search_comment_ids(db, q)
            query = query.filter(CommentModel.id.in_(ids)) if ids else query.filter(CommentModel.id == -1)
        except Exception as _e:
            print(f"[FTS] 评论搜索回退 LIKE: {_e}")
            query = query.filter(CommentModel.content.contains(q))
    else:
        query = query.filter(CommentModel.content.contains(q))
    query = query.order_by(CommentModel.created_at.desc()).limit(limit)
    out = []
    for c, post in query.all():
        out.append({
            "id": c.id,
            "post_id": c.post_id,
            "user_id": c.user_id,
            "content": c.content,
            "display_name": c.display_name,
            "parent_id": c.parent_id,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "post_title": post.title,
            "post_forum": post.forum,
        })
    return out


@router.get("/tags/trending")
def trending_tags(
    limit: int = 20,
    current_user: Optional[UserModel] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """热门标签：统计可见帖子里的标签出现频次，返回 Top N。"""
    # 复用 read_posts 的论坛可见性规则
    if current_user:
        visible_forums = ["main"]
        if current_user.school_id:
            visible_forums.append(current_user.school_id)
        if current_user.role in ["founder", "ambassador"]:
            visible_forums = None
    else:
        visible_forums = ["main"]
    q = db.query(PostModel.tags)
    if visible_forums is not None:
        q = q.filter(PostModel.forum.in_(visible_forums))
    rows = q.filter(PostModel.tags.isnot(None), PostModel.tags != "").all()
    counts = {}
    for (tags,) in rows:
        for t in str(tags).split(","):
            t = t.strip()
            if t:
                counts[t] = counts.get(t, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    return [{"tag": t, "count": c} for t, c in ranked]

@router.get("/tags/{tag}")
def tag_detail(
    tag: str,
    sort: Optional[str] = Query("latest", description="排序：latest(默认) / hot(按点赞+评论+收藏加权降序)"),
    limit: int = Query(50, le=200),
    current_user: Optional[UserModel] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """话题标签聚合页：返回该标签下的帖子（最新/热度）、参与人数、参与人头像等（带论坛可见性过滤）。"""
    tag = (tag or "").strip()
    if not tag:
        raise HTTPException(status_code=400, detail="标签不能为空")
    # 论坛可见性（与 read_posts 一致）
    if current_user:
        visible_forums = ["main"]
        if current_user.school_id:
            visible_forums.append(current_user.school_id)
        if current_user.role in ["founder", "ambassador"]:
            visible_forums = None
    else:
        visible_forums = ["main"]
    query = db.query(PostModel)
    if visible_forums is not None:
        query = query.filter(PostModel.forum.in_(visible_forums))
    # 意见箱隐私：只有本人、本校大使、创始人能看到
    if current_user:
        if current_user.role == "founder":
            pass
        elif current_user.role == "ambassador":
            query = query.filter(
                (~PostModel.category.contains("feedback")) |
                (PostModel.user_school == current_user.school_id) |
                (PostModel.user_id == current_user.id)
            )
        else:
            query = query.filter(
                (~PostModel.category.contains("feedback")) |
                (PostModel.user_id == current_user.id)
            )
    # 标签以逗号分隔存储，需按分隔符匹配
    query = query.filter(
        (PostModel.tags == tag) |
        PostModel.tags.like(f"%,{tag},%") |
        PostModel.tags.like(f"{tag},%") |
        PostModel.tags.like(f"%,{tag}")
    )
    _hot = (PostModel.like_count * 2 + PostModel.comment_count * 3 + PostModel.star_count * 2)
    if sort == "hot":
        query = query.order_by(PostModel.is_announcement.desc(), _hot.desc(), PostModel.created_at.desc())
    else:
        query = query.order_by(PostModel.is_announcement.desc(), PostModel.created_at.desc())
    posts = query.limit(limit).all()
    post_count = len(posts)
    # 参与人（去重）+ 头像
    seen = set()
    participant_ids = []
    for p in posts:
        if p.user_id not in seen:
            seen.add(p.user_id)
            participant_ids.append(p.user_id)
    participant_count = len(participant_ids)
    participants = []
    if participant_ids:
        users = db.query(UserModel).filter(UserModel.id.in_(participant_ids)).all()
        umap = {u.id: u for u in users}
        # 保持与帖子出现顺序一致
        for uid in participant_ids:
            u = umap.get(uid)
            if u:
                participants.append({
                    "id": u.id,
                    "display_name": u.nickname,
                    "avatar": u.avatar,
                    "school_id": u.school_id,
                })
    avatar_map = _avatar_map(db, [p.user_id for p in posts])
    return {
        "tag": tag,
        "post_count": post_count,
        "participant_count": participant_count,
        "participants": participants,
        "posts": [_mask_post(p, current_user, avatar_map.get(p.user_id)) for p in posts],
    }

@router.get("/starred", response_model=List[PostSchema])
def list_my_stars(
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
    limit: int = Query(50, le=200),
):
    """当前用户收藏（星标）的帖子列表，按收藏时间倒序。"""
    starred = (
        db.query(PostModel)
        .join(UserStar, UserStar.post_id == PostModel.id)
        .filter(UserStar.user_id == user.id)
        .order_by(UserStar.created_at.desc())
        .limit(limit)
        .all()
    )
    author_ids = [p.user_id for p in starred]
    authors = {u.id: u for u in db.query(UserModel).filter(UserModel.id.in_(author_ids)).all()} if author_ids else {}
    return [
        _mask_post(p, user, authors.get(p.user_id).avatar if authors.get(p.user_id) else None)
        for p in starred
    ]


@router.get("/{post_id}", response_model=PostSchema)
def read_post(
    post_id: int,
    current_user: Optional[UserModel] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    post = db.query(PostModel).filter(PostModel.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    author = db.query(UserModel).filter(UserModel.id == post.user_id).first()
    return _mask_post(post, current_user, author.avatar if author else None)

@router.put("/{post_id}", response_model=PostSchema)
def update_post(
    post_id: int,
    body: PostUpdate,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    """作者（或管理员）编辑自己的帖子，仅更新提供的字段。"""
    post = db.query(PostModel).filter(PostModel.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    is_admin = user.role in ["founder", "ambassador"]
    if not is_admin and post.user_id != user.id:
        raise HTTPException(status_code=403, detail="无权编辑此帖子")
    if is_admin and post.user_id != user.id:
        assert_can_moderate(user, post.user_school)

    if body.title is not None:
        post.title = sensitive_filter.filter_text(body.title)
    if body.content is not None:
        post.content = sensitive_filter.filter_text(body.content)
    if body.category is not None:
        post.category = body.category
    if body.tags is not None:
        post.tags = body.tags
    if body.hide_uid is not None:
        post.hide_uid = body.hide_uid
    db.commit()
    db.refresh(post)
    # 重新索引（标题/正文可能被改）
    try:
        index_post(db, post)
        db.commit()
    except Exception as _e:
        print(f"[FTS] 重索引帖子失败: {_e}")
    author = db.query(UserModel).filter(UserModel.id == post.user_id).first()
    return _mask_post(post, user, author.avatar if author else None)

@router.post("/{post_id}/star")
def star_post(
    post_id: int,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db)
):
    user_id = user.id
    post = db.query(PostModel).filter(PostModel.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    # 不能给自己加星
    if post.user_id == user_id:
        raise HTTPException(status_code=400, detail="不能给自己加星")
    # 检查是否已经加过星
    existing_star = db.query(UserStar).filter(
        UserStar.user_id == user_id,
        UserStar.post_id == post_id
    ).first()
    if existing_star:
        raise HTTPException(status_code=400, detail="已经加过星了")
    # 记录加星
    star = UserStar(user_id=user_id, post_id=post_id)
    db.add(star)
    post.star_count += 1
    # 给作者加 karma
    author = db.query(UserModel).filter(UserModel.id == post.user_id).first()
    if author:
        author.karma += 1
        author.star_count += 1
    db.commit()
    # 通知帖子作者被收藏（自己收藏自己的帖子已在上面拦截）
    try:
        notify_star(db, post=post, actor=user)
    except Exception:
        pass
    return {"message": "加星成功", "star_count": post.star_count, "starred": True}

@router.delete("/{post_id}/star")
def unstar_post(
    post_id: int,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db)
):
    user_id = user.id
    post = db.query(PostModel).filter(PostModel.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    # 查找并移除自己的星标
    star = db.query(UserStar).filter(
        UserStar.user_id == user_id,
        UserStar.post_id == post_id
    ).first()
    if not star:
        raise HTTPException(status_code=400, detail="你还没有给这个帖子加星")
    db.delete(star)
    if post.star_count > 0:
        post.star_count -= 1
    # 回退作者 karma 与 star_count
    author = db.query(UserModel).filter(UserModel.id == post.user_id).first()
    if author:
        if author.karma > 0:
            author.karma -= 1
        if author.star_count > 0:
            author.star_count -= 1
    db.commit()
    return {"message": "已取消星标", "star_count": post.star_count, "starred": False}

@router.post("/{post_id}/like")
def like_post(
    post_id: int,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db)
):
    user_id = user.id
    post = db.query(PostModel).filter(PostModel.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    if post.user_id == user_id:
        raise HTTPException(status_code=400, detail="不能给自己点赞")
    existing = db.query(UserLike).filter(
        UserLike.user_id == user_id, UserLike.post_id == post_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="已经点过赞了")
    db.add(UserLike(user_id=user_id, post_id=post_id))
    post.like_count = (post.like_count or 0) + 1
    db.commit()
    # 通知帖子作者被点赞
    try:
        notify_like(db, post=post, actor=user)
    except Exception:
        pass
    return {"message": "点赞成功", "like_count": post.like_count, "liked": True}

@router.delete("/{post_id}/like")
def unlike_post(
    post_id: int,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db)
):
    user_id = user.id
    post = db.query(PostModel).filter(PostModel.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    like = db.query(UserLike).filter(
        UserLike.user_id == user_id, UserLike.post_id == post_id
    ).first()
    if not like:
        raise HTTPException(status_code=400, detail="你还没有给这个帖子点赞")
    db.delete(like)
    if post.like_count and post.like_count > 0:
        post.like_count -= 1
    db.commit()
    return {"message": "已取消点赞", "like_count": post.like_count, "liked": False}

@router.post("/{post_id}/comments", response_model=CommentSchema)
def create_comment(
    post_id: int,
    comment: CommentCreate,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db)
):
    # 频率限制：评论 10 条/分钟
    rate_limit("comment", 10, 60, user_id=user.id)
    post = db.query(PostModel).filter(PostModel.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    if is_muted(user):
        raise HTTPException(status_code=403, detail=mute_message(user))

    # 楼中楼：校验父评论存在且同属本帖，并限制嵌套深度（最多 5 层）
    parent_comment = None
    if comment.parent_id is not None:
        parent_comment = db.query(CommentModel).filter(
            CommentModel.id == comment.parent_id,
            CommentModel.post_id == post_id,
        ).first()
        if parent_comment is None:
            raise HTTPException(status_code=400, detail="回复的评论不存在")
        # 向上追溯父链统计深度
        depth = 1
        cur = parent_comment
        seen = {cur.id}
        while cur.parent_id is not None:
            if depth >= 5:
                raise HTTPException(status_code=400, detail="评论层级过深，最多嵌套 5 层")
            cur = db.query(CommentModel).filter(CommentModel.id == cur.parent_id).first()
            if cur is None or cur.id in seen:
                break
            seen.add(cur.id)
            depth += 1

    comment.content = sensitive_filter.filter_text(comment.content)
    data = comment.model_dump()
    data["post_id"] = post_id
    data["user_id"] = user.id
    data["user_uid"] = user.uid
    data["images"] = ",".join(comment.images) if comment.images else None
    db_comment = CommentModel(**data)
    db.add(db_comment)
    post.comment_count += 1
    db.commit()
    db.refresh(db_comment)
    # 同步全文索引
    try:
        index_comment(db, db_comment)
        db.commit()
    except Exception as _e:
        print(f"[FTS] 索引评论失败: {_e}")
    # 生成通知：帖子作者的新回复 + 评论中的 @ 提及 + 被回复评论的作者
    try:
        notify_from_comment(db, post=post, comment=db_comment, actor=user, parent_comment=parent_comment)
    except Exception:
        pass
    return _mask_comment(db_comment, user, author_avatar=user.avatar)

@router.get("/{post_id}/comments", response_model=List[CommentSchema])
def read_comments(
    post_id: int,
    current_user: Optional[UserModel] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    comments = db.query(CommentModel).filter(CommentModel.post_id == post_id).order_by(CommentModel.created_at.asc()).all()
    avatar_map = _avatar_map(db, [c.user_id for c in comments])
    return [_mask_comment(c, current_user, avatar_map.get(c.user_id)) for c in comments]

@router.delete("/{post_id}")
def delete_post(
    post_id: int,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db)
):
    post = db.query(PostModel).filter(PostModel.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    # 检查权限：本人或管理员
    is_admin = user.role in ["founder", "ambassador"]
    is_owner = post.user_id == user.id
    if not is_admin and not is_owner:
        raise HTTPException(status_code=403, detail="无权删除此帖子")
    if is_admin and not is_owner:
        assert_can_moderate(user, post.user_school)
    db.delete(post)
    db.commit()
    # 同步删除全文索引
    try:
        remove_post(db, post_id)
        db.commit()
    except Exception as _e:
        print(f"[FTS] 删除帖子索引失败: {_e}")
    return {"message": "删除成功"}

@router.delete("/{post_id}/comments/{comment_id}")
def delete_comment(
    post_id: int,
    comment_id: int,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db)
):
    comment = db.query(CommentModel).filter(CommentModel.id == comment_id, CommentModel.post_id == post_id).first()
    if comment is None:
        raise HTTPException(status_code=404, detail="评论不存在")
    post = db.query(PostModel).filter(PostModel.id == post_id).first()
    # 检查权限：本人或管理员
    is_admin = user.role in ["founder", "ambassador"]
    is_owner = comment.user_id == user.id
    if not is_admin and not is_owner:
        raise HTTPException(status_code=403, detail="无权删除此评论")
    if is_admin and not is_owner:
        assert_can_moderate(user, post.user_school if post else None)
    # 更新帖子评论数
    if post and post.comment_count > 0:
        post.comment_count -= 1
    db.delete(comment)
    db.commit()
    # 同步删除全文索引
    try:
        remove_comment(db, comment_id)
        db.commit()
    except Exception as _e:
        print(f"[FTS] 删除评论索引失败: {_e}")
    return {"message": "删除成功"}

@router.put("/{post_id}/comments/{comment_id}", response_model=CommentSchema)
def update_comment(
    post_id: int,
    comment_id: int,
    body: CommentUpdate,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    comment = db.query(CommentModel).filter(CommentModel.id == comment_id, CommentModel.post_id == post_id).first()
    if comment is None:
        raise HTTPException(status_code=404, detail="评论不存在")
    is_admin = user.role in ["founder", "ambassador"]
    if not is_admin and comment.user_id != user.id:
        raise HTTPException(status_code=403, detail="无权编辑此评论")
    body.content = sensitive_filter.filter_text(body.content)
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="评论内容不能为空")
    comment.content = body.content
    if body.images is not None:
        comment.images = ",".join(body.images) if body.images else None
    comment.edited = True
    from datetime import datetime, timezone
    comment.edited_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(comment)
    # 重新索引
    try:
        index_comment(db, comment)
        db.commit()
    except Exception as _e:
        print(f"[FTS] 重索引评论失败: {_e}")
    return _mask_comment(comment, user, comment.user_id and user.avatar)
