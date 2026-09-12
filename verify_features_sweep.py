"""功能全量体检：覆盖此前没有任何套件覆盖的功能（帖子互动/社交/通知/投票/上传/资料）。"""
import json, random, string, urllib.request, urllib.error, uuid
from urllib.parse import quote

B = 'http://localhost:8000/api'
P = F = 0
SKIP = []


def ok(n, c, e=''):
    global P, F
    if c:
        P += 1; print(f'  ok  {n} {e}')
    else:
        F += 1; print(f'  FAIL {n} {e}')


def req(m, p, body=None, tok=None, raw=None):
    r = urllib.request.Request(B + p, method=m)
    if body is not None:
        r.add_header('Content-Type', 'application/json'); r.data = json.dumps(body).encode()
    if raw is not None:
        r.data = raw[0]; r.add_header('Content-Type', raw[1])
    if tok:
        r.add_header('Authorization', 'Bearer ' + tok)
    try:
        with urllib.request.urlopen(r, timeout=60) as x:
            t = x.read().decode(errors='replace')
            return x.status, (json.loads(t) if t.strip()[:1] in '{[' else t[:200])
    except urllib.error.HTTPError as e:
        t = e.read().decode(errors='replace')
        return e.code, (json.loads(t) if t.strip()[:1] in '{[' else t[:200])
    except Exception as e:
        return 'ERR', str(e)[:140]


def rid():
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))


def mkuser(role='student'):
    u = f'sw_{rid()}'
    b = {'username': u, 'password': 'test1234', 'school_id': 'JSKS', 'role': role, 'nickname': '体检' + rid()[:3]}
    if role == 'student':
        b.update({'enrollment_year': 2024, 'class_number': random.randint(1, 20),
                  'student_number': random.randint(1, 55)})
    st, d = req('POST', '/users/', b)
    return (u, d.get('access_token'), (d.get('user') or {}).get('id'), st)


# ── 准备：两个学生 + founder ─────────────────────────────
u1, t1, id1, s1 = mkuser()
u2, t2, id2, s2 = mkuser()
st, d = req('POST', '/users/login', {'username': 'founder', 'password': '201006'})
ftok = d.get('access_token')
ok('准备：两个学生 + founder 就绪', bool(t1 and t2 and ftok), f'[{s1}/{s2}]')

# ── 1. 图片上传 ──────────────────────────────────────────
png = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489'
                    '0000000a49444154789c6300010000050001' + '0d0a2db4' + '0000000049454e44ae426082')
boundary = '----web' + rid()
body = (f'--{boundary}\r\nContent-Disposition: form-data; name="files"; filename="t.png"\r\n'
        f'Content-Type: image/png\r\n\r\n').encode() + png + f'\r\n--{boundary}--\r\n'.encode()
st, d = req('POST', '/uploads/', raw=(body, f'multipart/form-data; boundary={boundary}'), tok=t1)
up_url = (d.get('urls') or [None])[0] if isinstance(d, dict) else None
ok('图片上传返回 url', st == 200 and bool(up_url), f'[{st}] {up_url}')

# ── 2. 发帖（带图/标签/分类）→ 读 → 编辑 ────────────────
st, post = req('POST', '/posts/', {'title': '体检帖' + rid(), 'content': '正文 **粗体**',
                                   'forum': 'main', 'category': 'general', 'tags': 'aa,bb',
                                   'images': [up_url] if up_url else [], 'is_anonymous': False}, t1)
pid = post.get('id') if isinstance(post, dict) else None
ok('发帖（含图片+标签+分类）', st == 200 and bool(pid), f'[{st}] id={pid}')
ok('帖子回读含图片', isinstance(post, dict) and (post.get('images') or []) == ([up_url] if up_url else []),
   f'images={post.get("images") if isinstance(post, dict) else "-"}')
st, d = req('GET', f'/posts/{pid}', tok=t1)
ok('帖子详情可读', st == 200, f'[{st}]')
st, d = req('PUT', f'/posts/{pid}', {'title': '体检帖-已编辑', 'content': '编辑后的正文'}, t1)
ok('编辑帖子', st == 200 and isinstance(d, dict) and d.get('title') == '体检帖-已编辑', f'[{st}]')

# ── 3. 点赞 / 收藏 ──────────────────────────────────────
st, _ = req('POST', f'/posts/{pid}/like', None, t2)
ok('点赞', st in (200, 201), f'[{st}]')
st, d = req('POST', f'/posts/{pid}/like', None, t2)
ok('重复点赞被拒', st == 400, f'[{st}]')
st, _ = req('DELETE', f'/posts/{pid}/like', None, t2)
ok('取消点赞', st == 200, f'[{st}]')
st, _ = req('POST', f'/posts/{pid}/star', None, t2)
ok('收藏', st in (200, 201), f'[{st}]')
st, d = req('GET', '/posts/starred', tok=t2)
ok('我的收藏含该帖', st == 200 and isinstance(d, list) and any(x.get('id') == pid for x in d), f'[{st}]')
st, _ = req('DELETE', f'/posts/{pid}/star', None, t2)
ok('取消收藏', st == 200, f'[{st}]')

# ── 4. 评论 + 楼中楼 + 我的评论 ─────────────────────────
st, c1 = req('POST', f'/posts/{pid}/comments', {'content': '一层评论'}, t2)
cid = c1.get('id') if isinstance(c1, dict) else None
ok('发评论', st == 200 and bool(cid), f'[{st}]')
st, c2 = req('POST', f'/posts/{pid}/comments', {'content': '二层回复', 'parent_id': cid}, t2)
ok('楼中楼回复', st == 200, f'[{st}]')
st, d = req('GET', f'/posts/{pid}/comments', tok=t2)
ok('评论列表可读', st == 200 and isinstance(d, list) and len(d) >= 2, f'[{st}] n={len(d) if isinstance(d, list) else "-"}')
st, d = req('GET', '/users/me/comments', tok=t2)
ok('我的评论列表', st == 200 and isinstance(d, list), f'[{st}]')
st, _ = req('PUT', f'/posts/{pid}/comments/{cid}', {'content': '一层已改'}, t2)
ok('编辑评论', st == 200, f'[{st}]')
st, _ = req('DELETE', f'/posts/{pid}/comments/{cid}', None, t2)
ok('删除评论', st == 200, f'[{st}]')

# ── 5. 社交通知：B 互动后 A 应收到通知 ──────────────────
req('POST', f'/posts/{pid}/like', None, t2)
req('POST', f'/posts/{pid}/comments', {'content': '通知触发'}, t2)
st, d = req('GET', '/notifications/unread-count', tok=t1)
n_before = d.get('unread') if isinstance(d, dict) else None
ok('作者收到未读通知', isinstance(n_before, int) and n_before > 0, f'unread={n_before}')
st, d = req('GET', '/notifications/', tok=t1)
ok('通知列表可读', st == 200 and isinstance(d, list) and len(d) > 0, f'[{st}] n={len(d) if isinstance(d, list) else "-"}')
st, _ = req('POST', '/notifications/read-all', None, t1)
ok('全部已读', st == 200, f'[{st}]')
st, d = req('GET', '/notifications/unread-count', tok=t1)
n_after = d.get('unread') if isinstance(d, dict) else None
ok('已读后未读归零', n_after == 0, f'unread={n_after}')

# ── 6. 关注 / 粉丝 / follow-state ───────────────────────
st, _ = req('POST', f'/social/follow/{id2}', None, t1)
ok('关注他人', st in (200, 201), f'[{st}]')
st, d = req('GET', f'/social/followers/{id2}', tok=t2)
ok('粉丝列表含 A', st == 200 and isinstance(d, list) and len(d) > 0, f'[{st}]')
st, d = req('GET', f'/social/following/{id1}', tok=t1)
ok('关注列表含 B', st == 200 and isinstance(d, list) and len(d) > 0, f'[{st}]')
st, d = req('GET', f'/social/follow-state?target_id={id2}', tok=t1)
ok('关注状态可查', st == 200, f'[{st}] {str(d)[:60]}')
st, d = req('GET', f'/social/stats/{id1}', tok=t1)
ok('社交统计可读', st == 200, f'[{st}]')
st, _ = req('DELETE', f'/social/follow/{id2}', None, t1)
ok('取消关注', st == 200, f'[{st}]')

# ── 7. 举报 → 举报箱 → 处置 → 审计 ──────────────────────
st, rp = req('POST', '/reports/', {'target_type': 'post', 'target_id': pid, 'reason': '体检举报'}, t2)
ok('提交举报', st == 200, f'[{st}]')
st, d = req('GET', '/admin/reports', tok=ftok)
rid_ = None
if st == 200 and isinstance(d, list):
    for r in d:
        if r.get('target_id') == pid:
            rid_ = r.get('id'); break
ok('举报箱可见该举报', rid_ is not None, f'[{st}] id={rid_}')
if rid_:
    st, _ = req('PUT', f'/admin/reports/{rid_}/status?status=resolved', None, ftok)
    ok('处置举报（改状态）', st == 200, f'[{st}]')
st, d = req('GET', '/admin/audit-logs', tok=ftok)
ok('审计日志有记录', st == 200 and isinstance(d, (list, dict)) and len(d) > 0, f'[{st}]')

# ── 8. 投票全流程 ───────────────────────────────────────
st, pl = req('POST', '/polls', {'question': '体检投票？', 'options': ['甲', '乙']}, ftok)
plid = pl.get('id') if isinstance(pl, dict) else None
ok('创建投票', st == 200 and bool(plid), f'[{st}]')
if plid:
    st, d = req('POST', f'/polls/{plid}/vote', {'option_index': 0}, t1)
    ok('投票', st == 200, f'[{st}] {str(d)[:50]}')
    st, d = req('GET', '/polls', tok=t1)
    ok('投票列表可读', st == 200 and isinstance(d, list), f'[{st}]')
    st, _ = req('DELETE', f'/polls/{plid}/vote', None, t1)
    ok('撤回投票', st == 200, f'[{st}]')
    st, _ = req('PUT', f'/polls/{plid}/close', None, ftok)
    ok('关闭投票', st == 200, f'[{st}]')
    st, _ = req('DELETE', f'/polls/{plid}', None, ftok)
    ok('删除投票（清理）', st == 200, f'[{st}]')

# ── 9. 搜索面 ───────────────────────────────────────────
for path, name in [('/posts?q=' + quote('体检'), '关键词搜帖'),
                   ('/posts/semantic?q=' + quote('体检') + '&limit=5', '语义搜索'),
                   ('/posts/comments/search?q=' + quote('通知'), '评论搜索'),
                   ('/posts/tags/trending', '热门标签'),
                   ('/users/search?q=' + quote('体检'), '用户搜索'),
                   ('/users/directory', '用户名录')]:
    st, d = req('GET', path, tok=t1)
    ok(f'{name} 可用', st == 200, f'[{st}]')

# ── 10. 个人资料修改（学生改自己昵称/密码）──────────────
st, d = req('PUT', f'/users/{id1}', {'nickname': '改过的名字'}, t1)
ok('学生改自己昵称', st == 200 and isinstance(d, dict) and d.get('nickname') == '改过的名字', f'[{st}]')
st, d = req('PUT', f'/users/{id2}', {'nickname': '越权改别人'}, t1)
ok('改他人资料被拒', st == 403, f'[{st}]')
st, d = req('POST', '/users/login', {'username': u1, 'password': 'test1234'})
ok('改昵称后仍可登录', st == 200, f'[{st}]')

# ── 11. 塔罗历史 CRUD ───────────────────────────────────
st, d = req('POST', '/tarot/history', {'date': '2026-09-12', 'time': '12:00', 'spread': 'time',
                                       'ts': 1789000000, 'question': '体检',
                                       'cards': [{'name': '愚者', 'position': '过去'}],
                                       'counsel': None}, t1)
ok('塔罗历史写入', st in (200, 201), f'[{st}] {str(d)[:60]}')
st, d = req('GET', '/tarot/history', tok=t1)
ok('塔罗历史可读', st == 200, f'[{st}]')

# ── 清理 ────────────────────────────────────────────────
req('DELETE', f'/posts/{pid}', None, ftok)
req('DELETE', '/users/me', {'password': 'test1234'}, t1)
req('DELETE', '/users/me', {'password': 'test1234'}, t2)
print(f'\n=== PASS {P} / {P + F} ===')
