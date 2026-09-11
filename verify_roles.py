"""T3 最终验证（完整读取响应版）"""
import json, sqlite3, sys, random, urllib.request, urllib.error
sys.path.insert(0, r'E:/mimo code 树洞设计/backend')
from app.services.password import hash_password, verify_password

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
st, rf = http('POST', '/users/login', {'username': 'founder', 'password': '201006'})
ok('founder 登录', st == 200); tf = rf['access_token']

# DB 直插两位未审核教师（补齐全部默认字段）
con = sqlite3.connect(r'E:/mimo code 树洞设计/backend/cervus.db')
h = hash_password('teach1234')
con.execute("INSERT INTO users (uid,username,nickname,password,is_anonymous,role,approved,school_id,star_count,karma,created_at) VALUES (?,?,?,?,1,'teacher',0,'JSKS',0,0,datetime('now'))",
    ('JSKST00' + R[-2:], 'teachera' + R, '测试教师A', h))
con.execute("INSERT INTO users (uid,username,nickname,password,is_anonymous,role,approved,school_id,star_count,karma,created_at) VALUES (?,?,?,?,1,'teacher',0,'JSKS',0,0,datetime('now'))",
    ('JSKST00' + R[-2:] + '9', 'teacherb' + R, '驳回测试', h))
con.commit()
ua = con.execute("SELECT id FROM users WHERE username=?", ('teachera' + R,)).fetchone()[0]
ub = con.execute("SELECT id FROM users WHERE username=?", ('teacherb' + R,)).fetchone()[0]
con.close()

st, r = http('POST', '/users/login', {'username': 'teachera' + R, 'password': 'teach1234'})
ok('未审核教师可登录', st == 200, str(r)[:80])
ok('教师 role=teacher', r.get('user', {}).get('role') == 'teacher')
ok('教师 UID JSKST 前缀', r.get('user', {}).get('uid', '').startswith('JSKST'))
ttok = r['access_token']

st, lst = http('GET', '/admin/teacher-approvals', t=tf)
ok('待审列表可查', st == 200 and isinstance(lst, list))
ok('含待审教师', isinstance(lst, list) and any(x['uid'].startswith('JSKST') for x in lst))

st, r = http('POST', f'/admin/teacher-approvals/{ua}/approve', None, t=tf)
ok('批准教师A', st == 200, str(r)[:60])
con = sqlite3.connect(r'E:/mimo code 树洞设计/backend/cervus.db')
row = con.execute("SELECT approved FROM users WHERE id=?", (ua,)).fetchone()
con.close()
ok('DB approved=1', bool(row and row[0]))

st, r = http('POST', f'/admin/teacher-approvals/{ub}/reject', None, t=tf)
ok('驳回教师B', st == 200, str(r)[:60])
st, _ = http('POST', '/users/login', {'username': 'teacherb' + R, 'password': 'teach1234'})
ok('驳回后无法登录', st in (400, 401), str(st))

# 校方账号：12 校已预注册（init_db.py），创建接口对已有校方的学校应拒绝
st, r = http('POST', '/admin/school-officials', {'username': 'schooloff' + R, 'password': 'school1234', 'nickname': '昆山中学官方', 'school_id': 'JSKS'}, t=tf)
ok('校方号已预注册 → 拒绝重复创建', st == 400, str(r)[:80])
st, r = http('POST', '/users/login', {'username': 'JSKSofficial', 'password': 'JSKS001'})
ok('预注册校方号登录 role=school_official', st == 200 and r['user']['role'] == 'school_official', str(st))

con = sqlite3.connect(r'E:/mimo code 树洞设计/backend/cervus.db')
# 必须是「有密码且口令为 test1234」的账号：无密码账号现在会被登录接口拒绝（洞已堵）
u = con.execute("SELECT username FROM users WHERE role='student' AND password IS NOT NULL "
                "AND (username LIKE 'grp%' OR username LIKE 'burn%' OR username LIKE 'chk%') LIMIT 1").fetchone()[0]
con.close()
st, rs = http('POST', '/users/login', {'username': u, 'password': 'test1234'})
st, r = http('GET', '/admin/teacher-approvals', t=rs['access_token'])
ok('非 founder 审批 403', st == 403, str(st))

print(f"\n=== PASS {len(passed)} / {len(passed)+len(failed)} ===")
if failed: print('FAILED:', ', '.join(failed))
