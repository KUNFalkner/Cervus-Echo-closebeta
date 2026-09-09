from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func
from app.models.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    uid = Column(String, unique=True, index=True)
    username = Column(String, unique=True, index=True)
    nickname = Column(String)
    avatar = Column(String)
    password = Column(String, nullable=True)
    is_anonymous = Column(Boolean, default=True)
    role = Column(String, default="student")
    # 特权角色审核：student 恒为 True；teacher 注册后默认 False（待 founder 批准，
    # 批准前仅按学生权限运行）；school_official 不开放自注册，founder 创建时即 True。
    approved = Column(Boolean, default=True)
    enrollment_year = Column(Integer, nullable=True)
    class_number = Column(Integer, nullable=True)
    student_number = Column(Integer, nullable=True)
    school_id = Column(String, default="ZC")
    profile_bg = Column(String(512), default="", nullable=True)  # 个人介绍卡片背景（CSS 背景值：预设渐变 / 自定义颜色 / url(图片)）
    wechat_openid = Column(String, nullable=True, unique=True)
    star_count = Column(Integer, default=0)  # 收到的 Star 数
    karma = Column(Integer, default=0)  # 声望值
    muted_until = Column(DateTime(timezone=True), nullable=True)  # 禁言截止时间，NULL=未禁言
    banned = Column(Boolean, default=False)  # 封禁（永久禁用登录），与禁言区分
    created_at = Column(DateTime(timezone=True), server_default=func.now())
