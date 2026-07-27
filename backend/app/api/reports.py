from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.models.database import get_db
from app.models.report import Report as ReportModel
from app.schemas.report import ReportCreate, Report as ReportSchema

router = APIRouter()

@router.post("/", response_model=ReportSchema)
def create_report(report: ReportCreate, db: Session = Depends(get_db)):
    db_report = ReportModel(**report.model_dump())
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    return db_report

@router.get("/", response_model=List[ReportSchema])
def read_reports(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    reports = db.query(ReportModel).order_by(ReportModel.created_at.desc()).offset(skip).limit(limit).all()
    return reports

@router.put("/{report_id}/status")
def update_report_status(report_id: int, status: str, db: Session = Depends(get_db)):
    report = db.query(ReportModel).filter(ReportModel.id == report_id).first()
    if report is None:
        raise HTTPException(status_code=404, detail="举报不存在")
    report.status = status
    db.commit()
    return {"message": "状态更新成功"}
