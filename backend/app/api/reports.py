from fastapi import APIRouter, Depends

from sqlalchemy.orm import Session

from app.auth import require_user
from app.models.database import get_db
from app.models.report import Report as ReportModel
from app.models.user import User as UserModel
from app.schemas.report import ReportCreate, Report as ReportSchema

router = APIRouter()

# 说明：原先的 GET "/" 与 PUT "/{report_id}/status" 完全无鉴权且前端从未调用，
# 管理端走的是 /api/admin/reports，故此处一并移除，避免留下无人看守的后门。

@router.post("/", response_model=ReportSchema)
def create_report(
    report: ReportCreate,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    db_report = ReportModel(reporter_id=user.id, **report.model_dump())
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    return db_report
