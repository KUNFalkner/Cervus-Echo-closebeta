"""T5 验证：教师/校方举报箱扩权 + 审计日志 + 处置权限隔离"""
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
con.execute("DELETE FROM users WHERE username LIKE 'vt%' OR username LIKE 'vso%' OR username LIKE 'tp%' OR username LIKE 'schooloff%'")
con.execute("""INSERT INTO users (uid,username,nickname,password,is_anonymous,role,approved,school_id,star_count,karma,created_at)
VALUES (?,?,?,?,1,'teacher',1,'JSKS',0,0,datetime('now'))""", ('JSKST00' + R[-2:], 'vt' + R, '举报箱验证教师', h))
con.commit()
vt_user = con.execute("SELECT username FROM users WHERE username=?", ('vt' + R,)).fetchone()[0]
stu = con.execute("SELECT username FROM users WHERE role='student' LIMIT 1").fetchone()[0]
con.close()

st, rt = http('POST', '/users/login', {'username': vt_user, 'password': 'teach1234'}); ttok = rt['access_token']
st, rs = http('POST', '/users/login', {'username': stu, 'password': 'test1234'}); stok = rs['access_token']

# 学生发帖（匿名）并举报它
st, pa = http('POST', '/posts/', {'title': 'T5举报目标' + R, 'content': '不当言论', 'forum': 'main',
    'category': 'general', 'tags': '', 'is_anonymous': True}, t=stok)
anon_id = pa['id']
# 教师 feed 应无此帖（T4 规则）
st, lst = http('GET', '/posts/?limit=50', t=ttok)
ids = [x['id'] for x in lst] if isinstance(lst, list) else []
ok('教师 feed 无该匿名帖（T4 规则保持）', anon_id not in ids)

# 学生举报该帖
st, rp = http('POST', '/reports/', {'target_type': 'post', 'target_id': anon_id, 'reason': 'T5 验证举报'}, t=stok)
ok('学生提交举报', st == 200, str(rp)[:80])

# 教师读举报箱（T5 扩权：require_admin 放行已批准教师）
st, reports = http('GET', '/admin/reports', t=ttok)
ok('教师可读举报箱', st == 200, str(reports)[:60])
target = [x for x in reports if x.get('target_id') == anon_id] if isinstance(reports, list) else []
ok('教师可见被举报内容摘要', bool(target) and bool(target[0].get('target_summary')))
ok('教师可见被举报人 UID（追溯）', bool(target) and bool(target[0].get('target_uid')))

# 教师尝试改状态 → 403
rid = target[0]['id'] if target else 0
st, r = http('PUT', f'/admin/reports/{rid}/status?status=reviewed', t=ttok)
ok('教师改状态 403', st == 403, str(st))

# 审计日志：教师查看已留痕（founder 可查）
st, rf = http('POST', '/users/login', {'username': 'founder', 'password': '201006'}); ftok = rf['access_token']
st, logs = http('GET', '/admin/audit-logs', t=ftok)
ok('founder 可读审计日志', st == 200 and isinstance(logs, list))
report_views = [x for x in logs if x.get('action') == 'report_view' and x.get('actor_uid', '').startswith('JSKST')] if isinstance(logs, list) else []
ok('教师查看举报箱已留痕', len(report_views) >= 1)

# 非教师改状态仍正常（ambassador 权限不变——用 founder 快速验证处置路径）
st, r = http('PUT', f'/admin/reports/{rid}/status?status=resolved', t=ftok)
ok('founder 处置举报正常', st == 200, str(r)[:60])

# 清理
con = sqlite3.connect(r'E:/mimo code 树洞设计/backend/cervus.db')
con.execute("DELETE FROM users WHERE username=?", (vt_user,))
con.commit()
con.close()

print(f"\n=== PASS {len(passed)} / {len(passed)+len(failed)} ===")
if failed: print('FAILED:', ', '.join(failed))
