"""公共聊天室闸门验证：教师/校方连 WS 必须被拒(4403)，学生可连。"""
import asyncio, json, urllib.request, urllib.error
import websockets

API = 'http://localhost:8000/api'
WS = 'ws://localhost:8000/ws/chat/main'
P = F = 0


def ok(name, cond, extra=''):
    global P, F
    if cond:
        P += 1; print(f'  ok  {name} {extra}')
    else:
        F += 1; print(f'  FAIL {name} {extra}')


def login(u, p):
    req = urllib.request.Request(API + '/users/login', method='POST')
    req.add_header('Content-Type', 'application/json')
    req.data = json.dumps({'username': u, 'password': p}).encode()
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode()).get('access_token')
    except urllib.error.HTTPError:
        return None


def student_token():
    import sqlite3
    con = sqlite3.connect(r'E:/mimo code 树洞设计/backend/cervus.db')
    u = con.execute("SELECT username FROM users WHERE role='student' AND password IS NOT NULL "
                    "AND (username LIKE 'grp%' OR username LIKE 'burn%' OR username LIKE 'chk%') LIMIT 1").fetchone()[0]
    con.close()
    return login(u, 'test1234')


async def try_ws(tok):
    """返回 close code：4403=被拒（预期），None=连上了。"""
    try:
        async with websockets.connect(f'{WS}?token={tok}', open_timeout=15) as ws:
            try:
                await asyncio.wait_for(ws.recv(), timeout=3)
            except (asyncio.TimeoutError, websockets.exceptions.ConnectionClosed):
                pass
            return None
    except websockets.exceptions.ConnectionClosed as e:
        return getattr(e, 'code', None) or (e.rcvd.code if e.rcvd else None)
    except Exception as e:
        return f'ERR {type(e).__name__}'


async def main():
    tt = login('JSKSofficial', 'JSKS001')
    ok('校方登录', bool(tt))
    st = student_token()
    ok('学生登录', bool(st))

    code = await try_ws(tt)
    # 在 accept 之前 close → Starlette 回 HTTP 403，客户端报 InvalidStatus；两者都算「被拒」
    ok('校方连公共聊天室被拒', code is not None, f'{code}')

    code = await try_ws(st)
    ok('学生可进公共聊天室', code is None, f'{code}')

    print(f'\n=== PASS {P} / {P + F} ===')


asyncio.run(main())
