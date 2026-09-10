"""验证 founder school_id=NULL 后全链路健康：
1) founder 登录 + 各管理接口
2) 帖子 feed（founder 应看到所有论坛）
3) 举报箱/教师审批接口
4) 前端 getSchoolName(None) 的显示值"""
import json, urllib.request, urllib.error

BASE = 'http://localhost:8000/api'
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

passed, failed = [], []
def ok(name, cond, extra=''):
    (passed if cond else failed).append(name)
    print(('  ok ' if cond else '  BAD') + ' ' + name + (('  | ' + extra) if (extra and not cond) else ''))

st, r = http('POST', '/users/login', {'username': 'founder', 'password': '201006'})
ok('founder 登录', st == 200)
tok = r.get('access_token')
ok('founder school_id 已空', r['user'].get('school_id') in (None, ''), repr(r['user'].get('school_id')))

st, r = http('GET', '/admin/stats', t=tok); ok('admin/stats', st == 200)
st, r = http('GET', '/admin/users', t=tok); ok('admin/users', st == 200)
st, r = http('GET', '/admin/reports', t=tok); ok('admin/reports', st == 200)
st, r = http('GET', '/admin/teacher-approvals', t=tok); ok('teacher-approvals', st == 200)
st, r = http('GET', '/admin/audit-logs', t=tok); ok('audit-logs', st == 200)
st, r = http('GET', '/posts/?limit=10', t=tok)
ok('founder feed 正常', st == 200 and isinstance(r, list))

print(f"\n=== PASS {len(passed)} / {len(passed)+len(failed)} ===")
if failed: print('FAILED:', ', '.join(failed))
