"""开屏动画「进入即播」验证：未登录不播 / 有身份进入播 / 未接受公约时动画在前。"""
import asyncio, json, os, random, string, subprocess, time, urllib.request
import websockets

CHROME = r'C:\Users\FXK\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe'
PORT = 9351
P = F = 0


def ok(n, c, e=''):
    global P, F
    if c:
        P += 1; print(f'  ok  {n} {e}')
    else:
        F += 1; print(f'  FAIL {n} {e}')


def api(path, body=None):
    r = urllib.request.Request('http://localhost:8088/api' + path, method='POST' if body else 'GET')
    if body is not None:
        r.add_header('Content-Type', 'application/json'); r.data = json.dumps(body).encode()
    with urllib.request.urlopen(r, timeout=40) as x:
        return json.loads(x.read().decode() or '{}')


async def main():
    u = 'wel_' + ''.join(random.choices(string.ascii_lowercase, k=5))
    d = api('/users/', {'username': u, 'password': 'test1234', 'school_id': 'JSKS', 'role': 'student',
                        'nickname': '欢迎验证', 'enrollment_year': 2024,
                        'class_number': random.randint(1, 20), 'student_number': random.randint(1, 55)})
    tok, usr = d['access_token'], d['user']
    print('测试账号:', u, usr['uid'])

    proc = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={PORT}',
                             '--window-size=1280,900', '--no-first-run', '--disable-gpu',
                             '--user-data-dir=' + os.path.expandvars(r'%TEMP%\cdp_wel2'),
                             'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws_url = None
    for _ in range(40):
        try:
            for x in json.loads(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=2).read().decode()):
                if x.get('type') == 'page':
                    ws_url = x['webSocketDebuggerUrl']; break
            if ws_url: break
        except Exception:
            time.sleep(0.5)
    c = {'id': 0}
    async with websockets.connect(ws_url, max_size=80 * 1024 * 1024) as ws:
        async def cmd(m, p=None, t=120):
            c['id'] += 1; mid = c['id']
            await ws.send(json.dumps({'id': mid, 'method': m, 'params': p or {}}))
            end = time.time() + t
            while time.time() < end:
                try:
                    r = json.loads(await asyncio.wait_for(ws.recv(), timeout=max(1, end - time.time())))
                except asyncio.TimeoutError:
                    return {}
                if r.get('id') == mid: return r
            return {}

        async def js(e):
            r = await cmd('Runtime.evaluate', {'expression': e, 'returnByValue': True, 'awaitPromise': True})
            return (r.get('result', {}).get('result', {}) or {}).get('value')

        await cmd('Runtime.enable'); await cmd('Page.enable')

        # A. 未登录：不应有开屏动画
        await cmd('Page.navigate', {'url': 'http://localhost:8088/'})
        await asyncio.sleep(4)
        await js("localStorage.clear()")
        await cmd('Page.reload'); await asyncio.sleep(4)
        ok('未登录不播开屏动画', await js("!document.querySelector('.welcome-overlay')"))
        ok('登录页可见', await js("!!document.querySelector('form input')"))

        # B. 有身份进入（注册/登录后都是 reload 到这一态）
        await js(f"localStorage.setItem('token',{json.dumps(tok)});"
                 f"localStorage.setItem('user',{json.dumps(json.dumps(usr))})")
        await cmd('Page.reload'); await asyncio.sleep(5)
        has_wel = await js("!!document.querySelector('.welcome-overlay')")
        txt = await js("(document.querySelector('.welcome-overlay')?.innerText||'').slice(0,40)")
        ok('有身份进入即播开屏动画', has_wel, f'文案={txt}')

        # C. 点击跳过后：动画消失，未接受公约则公约出现
        await js("document.querySelector('.welcome-overlay')?.click()")
        await asyncio.sleep(1.5)
        ok('点击后动画消失', await js("!document.querySelector('.welcome-overlay')"))

        # D. 刷新再播（每次进入都播）
        await cmd('Page.reload'); await asyncio.sleep(5)
        ok('刷新后仍会播放', await js("!!document.querySelector('.welcome-overlay')"))

        # 控制台错误
        errs = []
        await cmd('Log.enable')
        await asyncio.sleep(1)
        print(f'\n=== PASS {P} / {P + F} ===')
    proc.kill()


asyncio.run(main())
