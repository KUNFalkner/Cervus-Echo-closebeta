"""T4 最终验证 v2：修复全部占位符错位（校方号用正确直插）"""
import json, sqlite3, sys, random, urllib.request, urllib.error
sys.path.insert(0, r'E:/mimo code 树洞设计/backend')
from app.services.password import hash_password

BASE = 'http://localhost:8000/api'
passed, failed = [], []
def ok(name, cond, extra=''):
    (passed if cond else failed).append(name)
    print(('  ok ' if cond else '  BAD') + ' ' + name + (('  | ' + extra) if (extra and not cond) else ''))

def http(m, p, b=None, t=None):
    req = urllib.request.Request(BASE + p, data=(json.dumps(b).encode() if b is not None else None), method=m)
    req.add_header('Content-Type', 'application/json')
    if t: req.add_header('Authorization', 'Bearer ' + t)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read().decode() or '{}')
        except Exception: return e.code, {}

R = str(random.randint(100000, 999999))
con = sqlite3.connect(r'E:/mimo code 树洞设计/backend/cervus.db')
h = hash_password('teach1234')
con.execute("DELETE FROM users WHERE username LIKE 'vso%' OR username LIKE 'vt%' OR username LIKE 'tp%'")
# 教师（approved=1）
con.execute("""INSERT INTO users (uid,username,nickname,password,is_anonymous,role,approved,school_id,star_count,karma,created_at)
VALUES (?,?,?,?,1,'teacher',1,'JSKS',0,0,datetime('now'))""", ('JSKST00' + R[-2:], 'vt' + R, '验证教师', h))
# 校方号：改用 init_db 预注册的 JSKSofficial（自插会撞 UID 唯一约束）
# 未批准教师
con.execute("""INSERT INTO users (uid,username,nickname,password,is_anonymous,role,approved,school_id,star_count,karma,created_at)
VALUES (?,?,?,?,1,'teacher',0,'JSKS',0,0,datetime('now'))""", ('JSKST00' + R[-2:] + '9', 'tp' + R, '待审教师', h))
con.commit()
vt_user = con.execute("SELECT username FROM users WHERE username=?", ('vt' + R,)).fetchone()[0]
so_user = 'JSKSofficial'
tp_user = con.execute("SELECT username FROM users WHERE username=?", ('tp' + R,)).fetchone()[0]
con.close()

# 登录三个角色
st, rt = http('POST', '/users/login', {'username': vt_user, 'password': 'teach1234'})
ok('教师登录(role=teacher,approved=True)', st == 200 and rt['user']['role'] == 'teacher' and rt['user']['approved'] is True, str(rt)[:80])
ttok = rt['access_token']
st, rso = http('POST', '/users/login', {'username': so_user, 'password': 'JSKS001'})
ok('校方登录(role=school_official)', st == 200 and rso['user']['role'] == 'school_official', str(rso)[:80])
sotok = rso['access_token']
stu = None
con = sqlite3.connect(r'E:/mimo code 树洞设计/backend/cervus.db')
stu = con.execute("SELECT username FROM users WHERE role='student' AND password IS NOT NULL "
                  "AND (username LIKE 'grp%' OR username LIKE 'burn%' OR username LIKE 'chk%') LIMIT 1").fetchone()[0]
con.close()
st, rs = http('POST', '/users/login', {'username': stu, 'password': 'test1234'}); stok = rs['access_token']

# 学生发匿名帖 + 实名帖
st, pa = http('POST', '/posts/', {'title': '匿名帖T4' + R, 'content': 'anon', 'forum': 'main',
    'category': 'general', 'tags': '', 'is_anonymous': True}, t=stok)
anon_id = pa['id']
st, pn = http('POST', '/posts/', {'title': '实名帖T4' + R, 'content': 'named', 'forum': 'main',
    'category': 'general', 'tags': '', 'is_anonymous': False}, t=stok)
named_id = pn['id']

# 教师 feed
st, lst = http('GET', '/posts/?limit=50', t=ttok)
ids = [x['id'] for x in lst] if isinstance(lst, list) else []
ok('教师 feed 无匿名帖', anon_id not in ids)
ok('教师 feed 有实名帖', named_id in ids)

# 学生 feed
st, lst = http('GET', '/posts/?limit=50', t=stok)
ids = [x['id'] for x in lst] if isinstance(lst, list) else []
ok('学生 feed 两帖都在', anon_id in ids and named_id in ids)

# 教师直读
st, r = http('GET', f'/posts/{anon_id}', t=ttok)
ok('教师直读匿名帖 404', st == 404, str(st))
st, r = http('GET', f'/posts/{named_id}', t=ttok)
ok('教师读实名帖 200', st == 200)

# 校方 feed
st, lst = http('GET', '/posts/?limit=50', t=sotok)
ids = [x['id'] for x in lst] if isinstance(lst, list) else []
ok('校方 feed 无匿名帖', anon_id not in ids and named_id in ids)

# 教师发帖（不带 is_anonymous → 落库 False）
st, pt = http('POST', '/posts/', {'title': '教师帖T4', 'content': 'by teacher', 'forum': 'main',
    'category': 'general', 'tags': ''}, t=ttok)
ok('教师发帖落库 is_anonymous=False', st == 200 and pt.get('is_anonymous') is False)

# 教师带 is_anonymous=True → 服务端强转 False
st, pf = http('POST', '/posts/', {'title': '教师匿名尝试', 'content': 'x', 'forum': 'main',
    'category': 'general', 'tags': '', 'is_anonymous': True}, t=ttok)
ok('教师匿名发帖被强转 False', st == 200 and pf.get('is_anonymous') is False, f'st={st} anon={pf.get("is_anonymous")}')

# 未批准教师按学生权限
st, rp = http('POST', '/users/login', {'username': tp_user, 'password': 'teach1234'}); ptok = rp['access_token']
st, lst = http('GET', '/posts/?limit=50', t=ptok)
ids = [x['id'] for x in lst] if isinstance(lst, list) else []
ok('未批准教师可见匿名帖', anon_id in ids)

# 清理
con = sqlite3.connect(r'E:/mimo code 树洞设计/backend/cervus.db')
# 只清理本脚本自己创建的教师账号；so_user 是预注册的正式校方号，不能删
con.execute("DELETE FROM users WHERE username IN (?, ?)", (vt_user, tp_user))
con.commit()
con.close()

print(f"\n=== PASS {len(passed)} / {len(passed)+len(failed)} ===")
if failed: print('FAILED:', ', '.join(failed))
