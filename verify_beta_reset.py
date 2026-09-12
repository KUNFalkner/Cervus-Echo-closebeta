"""出厂态验证：官方账号可登录、无帖子/测试号、学生注册可用、塔罗历史为空。"""
import json, time, urllib.request, urllib.error
B = 'http://localhost:8000/api'
P = F = 0
def ok(n, c, e=''):
    global P, F
    if c: P += 1; print('  ok  ' + n, e)
    else: F += 1; print('  BAD ' + n, e)
def rq(m, p, b=None, t=None):
    d = json.dumps(b).encode() if b is not None else None
    q = urllib.request.Request(B + p, data=d, method=m, headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + t} if t else {})})
    try:
        r = urllib.request.urlopen(q, timeout=30); return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')
for i in range(30):
    try: urllib.request.urlopen(B + '/boards', timeout=2); break
    except Exception: time.sleep(1)
# 1) 官方三件套登录
st, d = rq('POST', '/users/login', {'username': 'founder', 'password': '201006'})
ok('founder 可登录', st == 200, f'[{st}]')
ft = d.get('access_token')
st, d = rq('POST', '/users/login', {'username': 'JSKSambassador', 'password': 'test1234'})
ok('大使可登录', st == 200, f'[{st}]')
st, d = rq('POST', '/users/login', {'username': 'JSKSofficial', 'password': 'JSKS001'})
ok('校方可登录', st == 200, f'[{st}]')
# 2) 出厂态：无帖子、无测试号、无塔罗记录
st, d = rq('GET', '/admin/stats', t=ft)
ok('帖子=0', d.get('total_posts') == 0, f"posts={d.get('total_posts')}")
ok('用户=27', d.get('total_users') == 27, f"users={d.get('total_users')}")
st, d = rq('GET', '/admin/users', t=ft)
bad = [u['username'] for u in d if u['role'] not in ('founder', 'ambassador', 'school_official')]
ok('无非官方账号残留', not bad, str(bad[:3]))
# 3) 学生注册链路在空库上可用
u = 'betachk' + str(int(time.time()))[-6:]
st, d = rq('POST', '/users/', {'username': u, 'password': 'test1234', 'school_id': 'JSKS',
                               'role': 'student', 'enrollment_year': 2026, 'class_number': 1, 'student_number': 1})
ok('学生可注册（学号1/班1未被占）', st == 200, f'[{st}] uid={d.get("user", {}).get("uid")}')
# 4) 塔罗历史为空
_, d2 = rq('POST', '/users/login', {'username': u, 'password': 'test1234'})
st, d3 = rq('GET', '/tarot/history', t=d2['access_token'])
ok('塔罗历史为空', st == 200 and len(d3 if isinstance(d3, list) else d3.get('items', [])) == 0, f'[{st}]')
print(f'=== PASS {P} / {P + F} ===')
