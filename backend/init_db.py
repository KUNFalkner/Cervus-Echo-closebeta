from app.models.database import engine, Base, SessionLocal
from app.models.user import User
from app.models.post import Post, Comment
from app.models.message import Message
from app.models.report import Report
from app.models.school import School
from app.models.star import UserStar
from app.models.like import UserLike
from app.models.notification import Notification
from app.models.follow import Follow
from app.models.conversation import Conversation, DirectMessage
from app.models.tarot_history import TarotHistory
from app.models.board import Board
from app.models.poll import Poll, Vote
from app.services.password import hash_password

Base.metadata.create_all(bind=engine)

# 既有库可能缺少新增列（SQLAlchemy create_all 不会给已存在的表加列），做一次补齐迁移
import sqlalchemy as _sa
from sqlalchemy import inspect as _inspect
_alembic_conn = engine.connect()
try:
    _cols = [c["name"] for c in _inspect(engine).get_columns("users")]
    if "banned" not in _cols:
        _alembic_conn.execute(_sa.text("ALTER TABLE users ADD COLUMN banned BOOLEAN DEFAULT 0"))
        _alembic_conn.commit()
        print("已为 users 表补齐 banned 列")

    _tcols = [c["name"] for c in _inspect(engine).get_columns("tarot_history")]
    if "time" not in _tcols:
        _alembic_conn.execute(_sa.text("ALTER TABLE tarot_history ADD COLUMN time VARCHAR(8)"))
        print("已为 tarot_history 表补齐 time 列")
    if "spread" not in _tcols:
        _alembic_conn.execute(_sa.text("ALTER TABLE tarot_history ADD COLUMN spread VARCHAR(16)"))
        print("已为 tarot_history 表补齐 spread 列")
finally:
    _alembic_conn.close()

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
            password=hash_password("20100606"),
            avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=founder"
        )
        db.add(founder)
        db.commit()
        print("已创建创始人账号: founder / 20100606")
    else:
        # 只补齐角色相关字段；密码与昵称属于用户资产，绝不在初始化时覆盖
        founder.uid = "AAA00000000"
        founder.role = "founder"
        founder.school_id = "JSKS"
        db.commit()
        print("创始人账号已存在，仅校正角色字段（密码/昵称保持不变）")

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
                password=hash_password(amb_password),
                avatar=f"https://api.dicebear.com/7.x/avataaars/svg?seed={amb_username}"
            )
            db.add(amb)
            print(f"已创建大使: {amb_username} / {amb_password}")
        else:
            # 同上：不覆盖已有大使的密码
            amb.uid = amb_uid
            amb.role = "ambassador"
            amb.school_id = school.code
            print(f"大使已存在，仅校正角色字段: {amb_username}")
    db.commit()

    # 种子板块（话题目录）：复用原 Post.category 的 key，故存量帖子无需迁移
    # 注意：板块名均为中性校园词，绝不含「表白」类词汇
    if db.query(Board).count() == 0:
        seeds = [
            ("general", "综合", "📝", "什么都可以聊", 0),
            ("study", "学习", "📚", "课业、备考、资料", 1),
            ("chat", "闲聊", "💬", "日常碎碎念", 2),
            ("game", "游戏", "🎮", "开黑、安利、攻略", 3),
            ("feedback", "意见箱", "📮", "给鹿鸣回音的建议", 4),
            ("secondhand", "二手", "💰", "闲置转让", 5),
            ("help", "求助", "🆘", "找人帮忙", 6),
            ("emotion", "情感", "💗", "心情与关系", 7),
        ]
        for key, name, icon, desc, order in seeds:
            db.add(Board(key=key, name=name, icon=icon, description=desc, sort_order=order, active=True))
        db.commit()
        print(f"已插入 {len(seeds)} 个默认板块")

finally:
    db.close()

print("\n数据库初始化完成！")
print("首次创建时的默认口令 —— 创始人: founder / 20100606")
print("首次创建时的默认口令 —— 大使: [学校代码]ambassador / [学校代码]001")
print("提示：已存在的账号密码不会被本脚本覆盖")
