"""违禁内容处置实证：删帖 / 禁言 / 封禁 三条链路是否真的有效。"""
import json, random, string, urllib.request, urllib.error

B = 'http://localhost:8000/api'
P = F = 0


def ok(n, c, e=''):
    global P, F
    if c:
        P += 1; print(f'  ok  {n} {e}')
    else:
        F += 1; print(f'  FAIL {n} {e}')


def req(m, p, body=None, tok=None):
    r = urllib.request.Request(B + p, method=m)
    if body is not None:
        r.add_header('Content-Type', 'application/json')
        r.data = json.dumps(body).encode()
    if tok:
        r.add_header('Authorization', 'Bearer ' + tok)
    try:
        with urllib.request.urlopen(r, timeout=40) as x:
            t = x.read().decode(errors='replace')
            return x.status, (json.loads(t or '{}') if t.strip().startswith(('{', '[')) else t[:160])
    except urllib.error.HTTPError as e:
        t = e.read().decode(errors='replace')
        return e.code, (json.loads(t or '{}') if t.strip().startswith(('{', '[')) else t[:160])
    except Exception as e:
        return 'ERR', str(e)[:120]


def rid():
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))


st, d = req('POST', '/users/login', {'username': 'founder', 'password': '201006'})
ftok = d['access_token']
ok('founder 登录', bool(ftok))

su = 'mod_' + rid()
st, d = req('POST', '/users/', {'username': su, 'password': 'test1234', 'school_id': 'JSKS',
                               'role': 'student', 'nickname': '处置验证学生',
                               'enrollment_year': 2024, 'class_number': random.randint(1, 20),
                               'student_number': random.randint(1, 55)})
stok = d.get('access_token') if isinstance(d, dict) else None
sid = (d.get('user') or {}).get('id') if isinstance(d, dict) else None
ok('注册验证学生', st == 200 and bool(stok), f'[{st}] id={sid}')

# ── 1. 删帖 ──────────────────────────────────────────────
st, p1 = req('POST', '/posts/', {'title': '违规内容待删' + rid(), 'content': '测试违禁处置',
                                 'forum': 'main', 'category': 'general', 'tags': '', 'is_anonymous': False}, stok)
pid1 = p1.get('id') if isinstance(p1, dict) else None
ok('学生发帖', st == 200 and bool(pid1), f'[{st}]')
st, _ = req('GET', f'/posts/{pid1}', tok=stok)
ok('帖子可读', st == 200, f'[{st}]')
st, d = req('DELETE', f'/posts/{pid1}', None, ftok)
ok('founder 删帖 200', st == 200, f'[{st}] {str(d)[:60]}')
st, _ = req('GET', f'/posts/{pid1}', tok=stok)
ok('删后 404', st == 404, f'[{st}]')

# ── 2. 禁言 ──────────────────────────────────────────────
st, fp = req('POST', '/posts/', {'title': '禁言评论验证靶子' + rid(), 'content': 'target',
                                 'forum': 'main', 'category': 'general', 'tags': '',
                                 'is_anonymous': False}, ftok)
fpid = fp.get('id') if isinstance(fp, dict) else None
st, d = req('PUT', f'/admin/users/{sid}/mute?minutes=10', None, ftok)
ok('founder 禁言 10 分钟', st == 200, f'[{st}] muted_until={d.get("muted_until") if isinstance(d, dict) else "-"}')
st, d = req('POST', '/posts/', {'title': '禁言期发帖' + rid(), 'content': 'x', 'forum': 'main',
                                'category': 'general', 'tags': '', 'is_anonymous': False}, stok)
ok('禁言期间发帖被拒', st == 403, f'[{st}] {str(d)[:60]}')
st, d = req('POST', f'/posts/{fpid}/comments', {'content': '禁言期评论'}, stok)
ok('禁言期间评论被拒', st == 403, f'[{st}] {str(d)[:60]}')
st, _ = req('PUT', f'/admin/users/{sid}/unmute', None, ftok)
ok('founder 解禁', st == 200, f'[{st}]')
st, p3 = req('POST', '/posts/', {'title': '解禁后发帖' + rid(), 'content': 'ok', 'forum': 'main',
                                 'category': 'general', 'tags': '', 'is_anonymous': False}, stok)
ok('解禁后恢复发帖', st == 200, f'[{st}]')
pid3 = p3.get('id') if isinstance(p3, dict) else None

# ── 3. 封禁 ──────────────────────────────────────────────
st, d = req('PUT', f'/admin/users/{sid}/ban', None, ftok)
ok('founder 封禁', st == 200, f'[{st}]')
st, d = req('POST', '/posts/', {'title': '封禁期发帖' + rid(), 'content': 'x', 'forum': 'main',
                                'category': 'general', 'tags': '', 'is_anonymous': False}, stok)
ok('封禁后发帖被拒', st == 403, f'[{st}] {str(d)[:60]}')
st, _ = req('PUT', f'/admin/users/{sid}/unban', None, ftok)
ok('founder 解封', st == 200, f'[{st}]')
st, d = req('POST', '/posts/', {'title': '解封后发帖' + rid(), 'content': 'ok', 'forum': 'main',
                                'category': 'general', 'tags': '', 'is_anonymous': False}, stok)
ok('解封后恢复发帖', st == 200, f'[{st}]')

# ── 4. 清理 ──────────────────────────────────────────────
if pid3:
    req('DELETE', f'/posts/{pid3}', None, ftok)
if fpid:
    req('DELETE', f'/posts/{fpid}', None, ftok)
st, _ = req('DELETE', '/users/me', {'password': 'test1234'}, stok)
ok('验证学生自行注销（清理）', st == 200, f'[{st}]')

print(f'\n=== PASS {P} / {P + F} ===')
