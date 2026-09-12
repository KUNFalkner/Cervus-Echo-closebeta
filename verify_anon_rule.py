import json, time, urllib.request
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
_, d = rq('POST', '/users/login', {'username': 'founder', 'password': '201006'})
ft = d['access_token']
# 1) 官方试图开匿名 -> 403
_, d = rq('POST', '/users/login', {'username': 'JSKSofficial', 'password': 'JSKS001'})
ot, osid = d['access_token'], d['user']['id']
st, d = rq('PUT', '/users/%d' % osid, {'is_anonymous': True}, ot)
ok('校方开启匿名被拒', st == 403, f'[{st}] {d.get("detail")}')
# 2) 大使试图开匿名 -> 403
_, d = rq('POST', '/users/login', {'username': 'JSKSambassador', 'password': 'test1234'})
at, asid = d['access_token'], d['user']['id']
st, d = rq('PUT', '/users/%d' % asid, {'is_anonymous': True}, at)
ok('大使开启匿名被拒', st == 403, f'[{st}] {d.get("detail")}')
# 3) 学生开匿名 -> 200
u = 'anonchk' + str(int(time.time()))[-6:]
st, d = rq('POST', '/users/', {'username': u, 'password': 'test1234', 'school_id': 'JSKS',
                               'role': 'student', 'enrollment_year': 2024, 'class_number': 5, 'student_number': 33})
sid = d['user']['id']
_, d2 = rq('POST', '/users/login', {'username': u, 'password': 'test1234'})
st, d3 = rq('PUT', '/users/%d' % sid, {'is_anonymous': True}, d2['access_token'])
ok('学生开启匿名正常', st == 200, f'[{st}]')
# 4) 全库无非学生 is_anonymous=True
st, d = rq('GET', '/admin/users', t=ft)
bad = [x['username'] for x in d if x['role'] != 'student' and x.get('is_anonymous')]
ok('官方/大使/教师 匿名全为否', not bad, str(bad[:3]))
st, _ = rq('DELETE', '/users/%d' % sid, {'password': 'test1234'}, d2['access_token']) if False else (None, None)
print(f'=== PASS {P} / {P + F} ===')
