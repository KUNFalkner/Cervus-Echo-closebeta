from app.models.database import engine, Base, SessionLocal
from app.models.user import User
from app.models.post import Post, Comment
from app.models.message import Message
from app.models.report import Report
from app.models.school import School
from app.models.star import UserStar
import hashlib

Base.metadata.create_all(bind=engine)

db = SessionLocal()
try:
    # 插入学校数据
    existing_schools = db.query(School).count()
    if existing_schools == 0:
        schools = [
            School(code="JSKS", name="江苏省昆山中学", short_name="昆中", level="四星"),
            School(code="KSZC", name="昆山震川高级中学", short_name="震川", level="四星"),
            School(code="KSSY", name="昆山市第一中学", short_name="市一中", level="四星"),
            School(code="KSKF", name="开发区高级中学", short_name="开高", level="四星"),
            School(code="KSLJ", name="陆家高级中学", short_name="陆高", level="四星"),
            School(code="KSBL", name="柏庐高级中学", short_name="柏高", level="四星"),
            School(code="KSZS", name="周市高级中学", short_name="周市", level="三星"),
            School(code="KSBC", name="巴城高级中学", short_name="巴城", level="三星"),
            School(code="KSHQ", name="花桥高级中学", short_name="花桥", level="三星"),
            School(code="KSJX", name="锦溪高级中学", short_name="锦溪", level="三星"),
            School(code="KSPL", name="蓬朗高级中学", short_name="蓬朗", level="三星"),
            School(code="KSTL", name="亭林高级中学", short_name="亭林", level="三星"),
        ]
        db.add_all(schools)
        db.commit()
        print(f"已插入 {len(schools)} 所学校数据")

    # 创建创始人
    founder = db.query(User).filter(User.username == "founder").first()
    if not founder:
        founder = User(
            username="founder",
            nickname="Xavier Kun Falkner",
            uid="AAA00000000",
            role="founder",
            school_id="JSKS",
            password=hashlib.sha256("20100606".encode()).hexdigest(),
            avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=founder"
        )
        db.add(founder)
        db.commit()
        print("已创建创始人账号: founder / 20100606")
    else:
        # 确保创始人数据正确
        founder.uid = "AAA00000000"
        founder.role = "founder"
        founder.school_id = "JSKS"
        founder.nickname = "Xavier Kun Falkner"
        founder.password = hashlib.sha256("20100606".encode()).hexdigest()
        db.commit()
        print("创始人账号已更新")

    # 创建各学校大使
    for school in db.query(School).all():
        amb_username = f"{school.code}ambassador"
        amb_uid = f"{school.code}00000000"
        amb_password = f"{school.code}001"
        amb = db.query(User).filter(User.username == amb_username).first()
        if not amb:
            amb = User(
                username=amb_username,
                nickname=f"{school.short_name}大使",
                uid=amb_uid,
                role="ambassador",
                school_id=school.code,
                password=hashlib.sha256(amb_password.encode()).hexdigest(),
                avatar=f"https://api.dicebear.com/7.x/avataaars/svg?seed={amb_username}"
            )
            db.add(amb)
            print(f"已创建大使: {amb_username} / {amb_password}")
        else:
            amb.uid = amb_uid
            amb.role = "ambassador"
            amb.school_id = school.code
            amb.password = hashlib.sha256(amb_password.encode()).hexdigest()
            print(f"大使已更新: {amb_username}")
    db.commit()

finally:
    db.close()

print("\n数据库初始化完成！")
print("创始人: founder / 20100606")
print("大使格式: [学校代码]ambassador / [学校代码]001")
