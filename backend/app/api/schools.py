from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.models.database import get_db
from app.models.school import School as SchoolModel
from app.schemas.school import SchoolCreate, School as SchoolSchema

router = APIRouter()

@router.get("/", response_model=List[SchoolSchema])
def read_schools(db: Session = Depends(get_db)):
    """获取所有启用的学校"""
    schools = db.query(SchoolModel).filter(SchoolModel.is_active == True).order_by(SchoolModel.code).all()
    return schools

@router.get("/all", response_model=List[SchoolSchema])
def read_all_schools(db: Session = Depends(get_db)):
    """获取所有学校（包括禁用的）"""
    schools = db.query(SchoolModel).order_by(SchoolModel.code).all()
    return schools

@router.post("/", response_model=SchoolSchema)
def create_school(school: SchoolCreate, db: Session = Depends(get_db)):
    """创建新学校"""
    existing = db.query(SchoolModel).filter(SchoolModel.code == school.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="学校代码已存在")
    db_school = SchoolModel(**school.model_dump())
    db.add(db_school)
    db.commit()
    db.refresh(db_school)
    return db_school

@router.put("/{school_id}", response_model=SchoolSchema)
def update_school(school_id: int, school: SchoolCreate, db: Session = Depends(get_db)):
    """更新学校信息"""
    db_school = db.query(SchoolModel).filter(SchoolModel.id == school_id).first()
    if not db_school:
        raise HTTPException(status_code=404, detail="学校不存在")
    for key, value in school.model_dump().items():
        setattr(db_school, key, value)
    db.commit()
    db.refresh(db_school)
    return db_school

@router.delete("/{school_id}")
def delete_school(school_id: int, db: Session = Depends(get_db)):
    """软删除学校（设为不启用）"""
    db_school = db.query(SchoolModel).filter(SchoolModel.id == school_id).first()
    if not db_school:
        raise HTTPException(status_code=404, detail="学校不存在")
    db_school.is_active = False
    db.commit()
    return {"message": "学校已禁用"}
