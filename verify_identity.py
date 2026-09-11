"""身份与注册/审核路径回归：闭洞验证 + 注册字段 + 教师审核作用域。

BASE 指向 8000（直连后端）。注册限流已放宽到 10/小时/IP。
"""
import json, random, string, urllib.request, urllib.error

BASE = 'http://localhost:8000/api'
P = F = 0
def ok(name, cond, extra=''):
    global P, F
    if cond: P += 1; print(f'  ok  {name} {extra}')
    else: F += 1; print(f'  FAIL {name} {extra}')

def http(method, path, body=None, token=None, raw=False):
    req = urllib.request.Request(BASE + path, method=method)
    if body is not None:
        req.add_header('Content-Type', 'application/json')
        req.data = json.dumps(body).encode()
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            t = r.read().decode(errors='replace')
            return r.status, (t if raw else json.loads(t or '{}'))
    except urllib.error.HTTPError as e:
        t = e.read().decode(errors='replace')
        try: return e.code, json.loads(t or '{}')
        except Exception: return e.code, {'raw': t}

def rid(n=6):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=n))

# ── 1. 登录：闭洞 ──────────────────────────────────────────
st, d = http('POST', '/users/login', {'username': 'wx_e_abc123', 'password': ''})
ok('无密码账号空密码被拒', st == 401, f'[{st}] {d.get("detail","")}')
st, d = http('POST', '/users/login', {'username': 'wx_e_abc123', 'password': 'anything'})
ok('无密码账号任意密码被拒', st == 401, f'[{st}]')
st, d = http('POST', '/users/login', {'username': 'founder', 'password': 'wrongpass1'})
ok('错误密码被拒', st == 401, f'[{st}]')
ftok = None
st, d = http('POST', '/users/login', {'username': 'founder', 'password': '201006'})
if st == 200: ftok = d['access_token']
ok('创始人正常登录', st == 200 and ftok, f'[{st}]')

# ── 2. 注册字段 ────────────────────────────────────────────
u = 'idt_' + rid()
st, d = http('POST', '/users/', {'username': u, 'password': 'short'})
ok('短密码 422（schema 必填）', st == 422, f'[{st}]')

u2 = 'idt_' + rid()
st, d = http('POST', '/users/', {'username': u2, 'password': 'test1234', 'school_id': 'JSKS',
                                 'role': 'student', 'enrollment_year': 2024, 'class_number': 3})
ok('学生缺学号 → 400 中文', st == 400 and '学号' in str(d.get('detail', '')), f'[{st}] {d.get("detail")}')

u3 = 'idt_' + rid()
st, d = http('POST', '/users/', {'username': u3, 'password': 'test1234', 'role': 'student',
                                 'enrollment_year': 2024, 'class_number': 3, 'student_number': 4242})
ok('缺学校 → 400 中文', st == 400 and '学校' in str(d.get('detail', '')), f'[{st}] {d.get("detail")}')

# 正常学生：昵称留空应自动生成
u4 = 'idt_' + rid()
st, d = http('POST', '/users/', {'username': u4, 'password': 'test1234', 'school_id': 'JSKS',
                                 'role': 'student', 'enrollment_year': 2024,
                                 'class_number': 3, 'student_number': random.randint(1000, 9999)})
nick = (d.get('user') or {}).get('nickname') if st == 200 else None
stok = (d.get('access_token') if st == 200 else None)
ok('昵称留空自动生成', st == 200 and bool(nick), f'[{st}] nick={nick}')
uid_ok = bool((d.get('user') or {}).get('uid', '').startswith('JSKS2024'))
ok('学生 UID = 校码+年+班+号', uid_ok, f'uid={(d.get("user") or {}).get("uid")}')

# ── 3. 校方预注册 + 教师审核作用域 ──────────────────────────
st, d = http('POST', '/users/login', {'username': 'JSKSofficial', 'password': 'JSKS001'})
sotok = d.get('access_token') if st == 200 else None
ok('校方可用预注册口令登录', st == 200 and sotok, f'[{st}]')

st, d = http('GET', '/admin/teacher-approvals', token=sotok)
ok('校方可见待审教师列表', st == 200 and isinstance(d, list), f'[{st}]')
if isinstance(d, list):
    ok('校方列表仅含本校', all(x.get('school_id') == 'JSKS' for x in d), f'学校={[x.get("school_id") for x in d]}')

st, d = http('GET', '/admin/teacher-approvals', token=stok)
ok('学生无权看待审列表(403)', st == 403, f'[{st}]')

st, d = http('GET', '/admin/teacher-approvals', token=ftok)
ok('创始人可见待审列表', st == 200 and isinstance(d, list), f'[{st}]')

# 校方不能审他校：造一个 KSZC 教师申请
tu = 'idtt_' + rid()
st, d = http('POST', '/users/', {'username': tu, 'password': 'test1234', 'school_id': 'KSZC',
                                 'role': 'teacher', 'nickname': '测试震川教师'})
t_id = (d.get('user') or {}).get('id') if st == 200 else None
ok('教师注册(待审)', st == 200 and t_id, f'[{st}] uid={(d.get("user") or {}).get("uid")}')
tid_uid = (d.get('user') or {}).get('uid') if st == 200 else ''
ok('教师 UID = 校码+T+序号', str(tid_uid).startswith('KSZCT'), f'uid={tid_uid}')

if t_id:
    st, d = http('POST', f'/admin/teacher-approvals/{t_id}/approve', token=sotok)
    ok('校方不能批准他校教师(403)', st == 403, f'[{st}] {d.get("detail","")}')
    st, d = http('POST', f'/admin/teacher-approvals/{t_id}/approve', token=ftok)
    ok('创始人可批准(兜底)', st == 200, f'[{st}]')

# ── 4. 创始人 school_id 仍为空（重跑 init_db 后）────────────
st, d = http('GET', '/users/me', token=ftok) if ftok else (0, {})
if st == 404:  # 端点名不同则退回 admin users 查询
    st, d = http('GET', '/admin/users?limit=200', token=ftok)
me_school = None
if isinstance(d, dict):
    me_school = d.get('school_id')
elif isinstance(d, list):
    me = [x for x in d if x.get('username') == 'founder']
    me_school = me[0].get('school_id') if me else 'NOT_FOUND'
ok('创始人无学校(重跑 init_db 后)', me_school in (None, ''), f'school_id={me_school!r}')

# ── 5. 12 校校方齐备（走管理接口核对，避免撞登录限流 10/分钟）─────
codes = ['JSKS','KSZC','KSSY','KSKF','KSLJ','KSBL','KSZS','KSBC','KSHQ','KSJX','KSPL','KSTL']
st, users = http('GET', '/admin/users?limit=400', token=ftok)
if isinstance(users, list):
    offs = [x for x in users if x.get('role') == 'school_official']
    have = {x.get('school_id') for x in offs}
    miss = [c for c in codes if c not in have]
    unapproved = [x.get('username') for x in offs if x.get('approved') is False]
    ok('12 校校方账号齐备且免审', not miss and not unapproved,
       f'共{len(offs)}个 缺={miss} 未审={unapproved}')
else:
    ok('12 校校方账号齐备且免审', False, f'管理接口返回异常 [{st}]')

print(f'\n=== PASS {P} / {P+F} ===')
