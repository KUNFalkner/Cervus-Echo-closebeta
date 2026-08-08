from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.models.database import get_db
from app.models.post import Post as PostModel, Comment as CommentModel
from app.models.user import User as UserModel
from app.models.star import UserStar
from app.schemas.post import PostCreate, Post as PostSchema, CommentCreate, Comment as CommentSchema
from app.services.sensitive_words import sensitive_filter

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

@router.post("/", response_model=PostSchema)
def create_post(post: PostCreate, db: Session = Depends(get_db)):
    # 获取用户信息
    user = db.query(UserModel).filter(UserModel.id == post.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 检查论坛权限
    if not can_post_in_forum(user, post.forum):
        raise HTTPException(status_code=403, detail="无权在此论坛发帖")

    # 检查公告权限
    if post.is_announcement and not can_post_announcement(user, post.forum):
        raise HTTPException(status_code=403, detail="无权发布公告")

    # 敏感词过滤
    post.title = sensitive_filter.filter_text(post.title)
    post.content = sensitive_filter.filter_text(post.content)

    # 保存用户名
    post_data = post.model_dump()
    post_data["username"] = user.username

    db_post = PostModel(**post_data)
    db.add(db_post)
    db.commit()
    db.refresh(db_post)
    return db_post

@router.get("/", response_model=List[PostSchema])
def read_posts(
    skip: int = 0,
    limit: int = 100,
    category: Optional[str] = Query(None, description="按分类筛选"),
    forum: Optional[str] = Query(None, description="按论坛筛选"),
    search: Optional[str] = Query(None, description="搜索标题和内容"),
    sort: Optional[str] = Query(None, description="排序：latest(默认) / hot(按星标数降序，社区自治)"),
    user_id: Optional[int] = Query(None, description="用户ID（用于权限过滤）"),
    db: Session = Depends(get_db)
):
    query = db.query(PostModel)

    # 获取当前用户
    current_user = None
    if user_id:
        current_user = db.query(UserModel).filter(UserModel.id == user_id).first()

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
        query = query.filter(PostModel.category == category)
    if forum:
        query = query.filter(PostModel.forum == forum)
    if search:
        query = query.filter(
            (PostModel.title.contains(search)) | (PostModel.content.contains(search))
        )

    if sort == "hot":
        query = query.order_by(PostModel.is_announcement.desc(), PostModel.star_count.desc(), PostModel.created_at.desc())
    else:
        query = query.order_by(PostModel.is_announcement.desc(), PostModel.created_at.desc())
    posts = query.offset(skip).limit(limit).all()
    return posts

@router.get("/{post_id}", response_model=PostSchema)
def read_post(post_id: int, db: Session = Depends(get_db)):
    post = db.query(PostModel).filter(PostModel.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    return post

@router.post("/{post_id}/like")
def like_post(post_id: int, db: Session = Depends(get_db)):
    post = db.query(PostModel).filter(PostModel.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    post.like_count += 1
    db.commit()
    return {"message": "点赞成功"}

@router.post("/{post_id}/star")
def star_post(post_id: int, user_id: int = None, db: Session = Depends(get_db)):
    if not user_id:
        raise HTTPException(status_code=400, detail="需要用户ID")
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
    return {"message": "加星成功", "star_count": post.star_count, "starred": True}

@router.delete("/{post_id}/star")
def unstar_post(post_id: int, user_id: int = None, db: Session = Depends(get_db)):
    if not user_id:
        raise HTTPException(status_code=400, detail="需要用户ID")
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

@router.post("/{post_id}/comments", response_model=CommentSchema)
def create_comment(post_id: int, comment: CommentCreate, db: Session = Depends(get_db)):
    post = db.query(PostModel).filter(PostModel.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    comment.content = sensitive_filter.filter_text(comment.content)
    db_comment = CommentModel(**comment.model_dump())
    db.add(db_comment)
    post.comment_count += 1
    db.commit()
    db.refresh(db_comment)
    return db_comment

@router.get("/{post_id}/comments", response_model=List[CommentSchema])
def read_comments(post_id: int, db: Session = Depends(get_db)):
    comments = db.query(CommentModel).filter(CommentModel.post_id == post_id).order_by(CommentModel.created_at.asc()).all()
    return comments

@router.delete("/{post_id}")
def delete_post(post_id: int, user_id: int = None, db: Session = Depends(get_db)):
    post = db.query(PostModel).filter(PostModel.id == post_id).first()
    if post is None:
        raise HTTPException(status_code=404, detail="帖子不存在")
    # 检查权限：本人或管理员
    user = db.query(UserModel).filter(UserModel.id == user_id).first() if user_id else None
    is_admin = user and user.role in ["founder", "ambassador"]
    is_owner = post.user_id == user_id
    if not is_admin and not is_owner:
        raise HTTPException(status_code=403, detail="无权删除此帖子")
    db.delete(post)
    db.commit()
    return {"message": "删除成功"}

@router.delete("/{post_id}/comments/{comment_id}")
def delete_comment(post_id: int, comment_id: int, user_id: int = None, db: Session = Depends(get_db)):
    comment = db.query(CommentModel).filter(CommentModel.id == comment_id, CommentModel.post_id == post_id).first()
    if comment is None:
        raise HTTPException(status_code=404, detail="评论不存在")
    # 检查权限：本人或管理员
    user = db.query(UserModel).filter(UserModel.id == user_id).first() if user_id else None
    is_admin = user and user.role in ["founder", "ambassador"]
    is_owner = comment.user_id == user_id
    if not is_admin and not is_owner:
        raise HTTPException(status_code=403, detail="无权删除此评论")
    # 更新帖子评论数
    post = db.query(PostModel).filter(PostModel.id == post_id).first()
    if post and post.comment_count > 0:
        post.comment_count -= 1
    db.delete(comment)
    db.commit()
    return {"message": "删除成功"}
