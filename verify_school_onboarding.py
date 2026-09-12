import json, urllib.request, urllib.error

B = 'http://localhost:8000/api'
P = F = 0
CODE = 'KSTST'


def ok(n, c, e=''):
    global P, F
    if c:
        P += 1; print('  ok  ' + n, e)
    else:
        F += 1; print('  BAD ' + n, e)


def rq(m, p, b=None, t=None):
    d = json.dumps(b).encode() if b is not None else None
    q = urllib.request.Request(B + p, data=d, method=m)
    q.add_header('Content-Type', 'application/json')
    if t:
        q.add_header('Authorization', 'Bearer ' + t)
    try:
        with urllib.request.urlopen(q, timeout=30) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b'{}')
        except Exception:
            return e.code, {}


st, d = rq('POST', '/users/login', {'username': 'founder', 'password': '201006'})
ft = d.get('access_token')
ok('创始人登录', st == 200 and bool(ft), f'[{st}]')

st, d = rq('POST', '/schools/', {'code': CODE, 'name': '测试学校', 'short_name': '测校'}, ft)
sid = d.get('id')
ok('新增学校', st == 200 and bool(sid), f'[{st}] id={sid}')

st, lst = rq('GET', '/schools/')
codes = [s['code'] for s in lst] if isinstance(lst, list) else []
ok('新学校出现在列表中（下拉会自动有它）', CODE in codes, f'共{len(codes)}所')

st, d = rq('POST', '/admin/school-officials', {'school_id': CODE}, ft)
ok('一键开通校方账号', st == 200, f'[{st}] {str(d)[:70]}')
pw = d.get('password') or (CODE + '001')
un = d.get('username') or (CODE + 'official')

st, d = rq('POST', '/users/login', {'username': un, 'password': pw})
ot = d.get('access_token')
ok('新校方号可登录', st == 200 and d.get('user', {}).get('role') == 'school_official', f'[{st}] {un}')

st, d = rq('GET', '/admin/teacher-approvals', t=ot)
ok('新校方号可审本校教师', st == 200, f'[{st}]')

st, d = rq('POST', '/admin/school-officials', {'school_id': CODE}, ft)
ok('重复开通被拒', st == 400, f'[{st}]')

st, d = rq('POST', '/admin/school-officials', {'school_id': CODE, 'role': 'ambassador'}, ft)
ok('一键开通大使账号', st == 200, f'[{st}] {str(d)[:60]}')
apw = d.get('password') or (CODE + '001'); aun = d.get('username') or (CODE + 'ambassador')
st, d = rq('POST', '/users/login', {'username': aun, 'password': apw})
at = d.get('access_token')
ok('新大使号可登录 role=ambassador', st == 200 and d.get('user', {}).get('role') == 'ambassador', f'[{st}] {aun}')
st, d = rq('GET', '/admin/users?limit=5', t=at)
ok('新大使号可进管理后台', st == 200, f'[{st}]')
st, d = rq('POST', '/admin/school-officials', {'school_id': CODE, 'role': 'ambassador'}, ft)
ok('大使账号重复开通被拒', st == 400, f'[{st}]')

if at:
    st, d = rq('DELETE', '/users/me', {'password': apw}, at)
    ok('清理：大使号自行注销', st == 200, f'[{st}]')

if ot:
    st, d = rq('DELETE', '/users/me', {'password': pw}, ot)
    ok('清理：校方号自行注销', st == 200, f'[{st}]')
if sid:
    st, d = rq('DELETE', f'/schools/{sid}', None, ft)
    ok('清理：禁用测试学校', st == 200, f'[{st}]')
st, lst = rq('GET', '/schools/')
ok('清理后列表不再含测试校', CODE not in [s['code'] for s in lst] if isinstance(lst, list) else False)

print(f'\n=== PASS {P} / {P + F} ===')
