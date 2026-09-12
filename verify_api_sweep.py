"""后端 API 全面抽查 v2 —— 全部对齐前端真实调用端点与参数"""
import json, random, string, sqlite3, urllib.request, urllib.error

BASE = 'http://localhost:8000/api'
R = ''.join(random.choices(string.digits, k=6))
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

# ── 账号 ──
con = sqlite3.connect('backend/cervus.db')
rows = [x[0] for x in con.execute("SELECT username FROM users WHERE password IS NOT NULL AND (username LIKE 'grp%' OR username LIKE 'burn%' OR username LIKE 'chk%') ORDER BY id DESC LIMIT 4").fetchall()]
con.close()
st, ra = http('POST', '/users/login', {'username': rows[0], 'password': 'test1234'}); ta = ra['access_token']; A = ra['user']
st, rb = http('POST', '/users/login', {'username': rows[1], 'password': 'test1234'}); tb = rb['access_token']; B = rb['user']
ok('登录A/B', st == 200 or bool(ta))

# ── 登录边界 ──
st, _ = http('POST', '/users/login', {'username': A['username'], 'password': 'wrongpass'})
ok('错误密码被拒', st in (400, 401))

# ── 发帖 ──
st, p = http('POST', '/posts/', {'title': '体检帖' + R, 'content': 'body', 'forum': 'main',
    'category': '综合', 'tags': '体检,测试', 'is_anonymous': False}, ta)
ok('发帖', st == 200); pid = p.get('id')
ok('带标签', '体检' in str(p.get('tags', '')))
st, pd = http('GET', f'/posts/{pid}', t=ta)
ok('帖子详情', st == 200 and pd.get('title') == '体检帖' + R)
st, lst = http('GET', '/posts/?limit=20', t=ta)
ok('列表含新帖', isinstance(lst, list) and any(x.get('id') == pid for x in lst))

# ── 匿名帖 ──
st, p2 = http('POST', '/posts/', {'title': '匿名帖' + R, 'content': 'anon', 'forum': 'main',
    'category': '综合', 'tags': '', 'is_anonymous': True}, tb)
ok('匿名发帖落库', st == 200 and p2.get('is_anonymous') is True)

# ── 评论 + 删评（social 前缀）──
st, cm = http('POST', f'/posts/{pid}/comments', {'content': '体检评论'}, tb)
ok('B 评论', st == 200); cid = cm.get('id')
st, r = http('DELETE', f'/users/me/comments/{cid}', t=tb)
ok('B 删自己评论', st in (200, 204), f'st={st}')

# ── 点赞/收藏（POST 点 / DELETE 取消）──
st, r1 = http('POST', f'/posts/{pid}/like', None, tb)
ok('点赞', st == 200 and r1.get('liked') is True, str(r1)[:60])
st, r2 = http('DELETE', f'/posts/{pid}/like', None, tb)
ok('取消点赞', st == 200, f'st={st} {str(r2)[:50]}')
st, _ = http('POST', f'/posts/{pid}/star', None, tb)
ok('收藏', st == 200)
st, stars = http('GET', '/posts/starred', t=tb)
ok('收藏列表含该帖', st == 200 and isinstance(stars, list) and any(x.get('id') == pid for x in stars))

# ── 通知 ──
st, n = http('GET', '/notifications', t=ta)
ok('通知列表', st == 200)
st, c = http('GET', '/notifications/unread-count', t=ta)
ok('未读计数', st == 200)

# ── 搜索（前端真实端点）──
import urllib.parse
enc = urllib.parse.quote('体检')
st, s1 = http('GET', f'/posts/?search={enc}&limit=20', t=ta)
ok('帖子搜索', st == 200 and any(x.get('id') == pid for x in s1))
st, s2 = http('GET', '/users/search?q=' + enc, t=ta)
ok('用户搜索', st == 200)
st, d = http('GET', '/users/directory?limit=5', t=ta)
ok('用户名录', st == 200 and isinstance(d, list) and len(d) > 0)

# ── 我的资料 ──
st, me = http('GET', '/users/me', t=ta)
ok('users/me', st == 200 and me.get('username') == A['username'])

# ── 关注（social 前缀 + POST/DELETE）──
st, _ = http('POST', f'/social/follow/{B["id"]}', None, ta)
ok('关注B', st in (200, 201), f'st={st}')
st, fs = http('GET', '/social/follow-state', t=ta)
ok('follow-state 查询', st == 200)
st, _ = http('DELETE', f'/social/follow/{B["id"]}', None, ta)
ok('取关B', st == 200, f'st={st}')

# ── founder ──
st, rf = http('POST', '/users/login', {'username': 'founder', 'password': '201006'})
ok('founder 登录', st == 200); tf = rf.get('access_token')
st, ps = http('GET', '/admin/privacy-stats', t=tf)
ok('隐私统计 founder 可读', st == 200, f'st={st}')
st, _ = http('GET', '/admin/privacy-stats', t=ta)
ok('隐私统计 普通用户 403', st == 403, f'st={st}')

print(f"\n=== PASS {len(passed)} / {len(passed)+len(failed)} ===")
if failed: print('FAILED:', ', '.join(failed))
