from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from app.models.database import Base


class UidGrant(Base):
    """UID 追溯授权（隐私体系 v2，站长 2026-09-17 钦定）。

    大使/教师/校方要看某用户的 UID，必须先向 founder 申请：
    - status=pending  等待 founder 审批（此时无任何查看权）
    - status=approved founder 已批准，可查看【这一个目标用户】的 UID
    - status=used     看过即锁（一次性），再看需重新申请
    - status=rejected founder 拒绝
    founder 是唯一无条件可见者，不需要授权。
    """
    __tablename__ = "uid_grants"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, nullable=False, index=True)      # 申请追溯的管理员
    target_user_id = Column(Integer, nullable=False, index=True)  # 被追溯的用户
    reason = Column(Text, nullable=False)                        # 申请理由
    status = Column(String(10), nullable=False, default="pending", index=True)
    granted_by = Column(Integer, nullable=True)                  # 批准的 founder
    granted_at = Column(DateTime(timezone=True), nullable=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
