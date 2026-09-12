"""权限矩阵回归：公开端点鉴权、站级管理权收紧、founder school_id=NULL 不再 500。"""
import json, random, string, urllib.request, urllib.error

B = 'http://localhost:8000/api'
P = F = 0


def ok(name, cond, extra=''):
    global P, F
    if cond:
        P += 1; print(f'  ok  {name} {extra}')
    else:
        F += 1; print(f'  FAIL {name} {extra}')


def req(method, path, body=None, tok=None):
    r = urllib.request.Request(B + path, method=method)
    if body is not None:
        r.add_header('Content-Type', 'application/json')
        r.data = json.dumps(body).encode()
    if tok:
        r.add_header('Authorization', 'Bearer ' + tok)
    try:
        with urllib.request.urlopen(r, timeout=40) as x:
            t = x.read().decode(errors='replace')
            try:
                return x.status, json.loads(t or '{}')
            except Exception:
                return x.status, t[:200]
    except urllib.error.HTTPError as e:
        t = e.read().decode(errors='replace')
        try:
            return e.code, json.loads(t or '{}')
        except Exception:
            return e.code, t[:200]
    except Exception as e:
        return 'ERR', str(e)[:120]


def rid():
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))


st, d = req('POST', '/users/login', {'username': 'founder', 'password': '201006'})
ftok = d.get('access_token') if isinstance(d, dict) else None
ok('founder 登录', bool(ftok))

# ── 1. 公开端点必须要求登录（原为无鉴权）─────────────────
for p in ['/users/search?q=a', '/users/directory', '/users/1']:
    st, _ = req('GET', p)
    ok(f'未登录访问 {p} → 401', st == 401, f'[{st}]')
st, _ = req('POST', '/tarot/interpret', {})
ok('未登录 POST /tarot/interpret → 401（原无鉴权）', st == 401, f'[{st}]')

# ── 2. founder school_id=NULL 不再 500 ───────────────────
st, d = req('GET', '/users/1', tok=ftok)
ok('取 founder 公开资料 200（原 500）', st == 200, f'[{st}]')
ok('founder 公开资料 school_id=null', isinstance(d, dict) and d.get('school_id') is None,
   f'school_id={d.get("school_id") if isinstance(d, dict) else "-"}')
st, d = req('GET', '/users/directory', tok=ftok)
ok('用户名录 200 且含 founder 不 500', st == 200 and isinstance(d, list) and len(d) > 0,
   f'[{st}] 条数={len(d) if isinstance(d, list) else "-"}')

# ── 3. 教师：站级管理权必须被拒 ──────────────────────────
tu = 'pm_' + rid()
st, d = req('POST', '/users/', {'username': tu, 'password': 'test1234', 'school_id': 'JSKS',
                                'role': 'teacher', 'nickname': '权限矩阵教师'})
ttok = d.get('access_token') if isinstance(d, dict) else None
ok('注册教师(待审)', st == 200 and bool(ttok), f'[{st}]')
tid = (d.get('user') or {}).get('id') if isinstance(d, dict) else None
st, _ = req('POST', f'/admin/teacher-approvals/{tid}/approve', None, ftok)
ok('founder 批准该教师', st == 200, f'[{st}]')

for method, path, body in [('POST', '/boards', {'key': 'pm' + rid(), 'name': 'X', 'icon': '📝'}),
                           ('POST', '/polls', {'question': 'X?', 'options': ['a', 'b']})]:
    st, _ = req(method, path, body, ttok)
    ok(f'已批准教师 {method} {path} → 403', st == 403, f'[{st}]')

# ── 4. 创始人：站级管理权正常 ────────────────────────────
bkey = 'pm' + rid()
st, d = req('POST', '/boards', {'key': bkey, 'name': '权限验证板块', 'icon': '📝'}, ftok)
ok('创始人可建板块', st == 200, f'[{st}]')
bid = d.get('id') if isinstance(d, dict) else None
if bid:
    st, _ = req('DELETE', f'/boards/{bid}', None, ftok)
    ok('创始人可删板块（清理）', st == 200, f'[{st}]')

# ── 5. 匿名只属于学生：大使/founder/教师 请求匿名也必须被强转实名 ──
def post_anon(token, name):
    st, d = req('POST', '/posts/', {'title': name + rid(), 'content': 'anon-check',
                                    'forum': 'main', 'category': 'general', 'tags': '',
                                    'is_anonymous': True}, token)
    pid = d.get('id') if isinstance(d, dict) else None
    anon = d.get('is_anonymous') if isinstance(d, dict) else None
    if pid:
        req('DELETE', f'/posts/{pid}', None, ftok)
    return st, anon


st, d = req('POST', '/users/login', {'username': 'JSKSambassador', 'password': 'test1234'})
atok = d.get('access_token') if isinstance(d, dict) else None
ok('大使登录', bool(atok))
st, anon = post_anon(atok, '大使匿名尝试')
ok('大使匿名被强转实名', st == 200 and anon is False, f'[{st}] is_anonymous={anon}')

st, anon = post_anon(ftok, 'founder匿名尝试')
ok('founder 匿名被强转实名', st == 200 and anon is False, f'[{st}] is_anonymous={anon}')

st, anon = post_anon(ttok, '教师匿名尝试')
ok('教师匿名被强转实名', st == 200 and anon is False, f'[{st}] is_anonymous={anon}')

print(f'\n=== PASS {P} / {P + F} ===')
