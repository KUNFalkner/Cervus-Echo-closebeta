"""CDP 真机验证：登录 → 打开搜索 → 关键词/智能两种模式截图 + 控制台零报错检查。

不依赖 playwright，直接用 chromium 的 DevTools 协议。
"""
import asyncio, base64, json, os, subprocess, time, urllib.request
import websockets

CHROME = r'C:\Users\FXK\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe'
SHOTS = r'E:\mimo code 树洞设计\shots'
PORT = 9333
APP = 'http://localhost:8088'

os.makedirs(SHOTS, exist_ok=True)


def login():
    """先用 API 拿 token/user，注入 localStorage——比驱动登录表单可靠得多。"""
    req = urllib.request.Request(
        'http://localhost:8000/api/users/login',
        data=json.dumps({'username': 'founder', 'password': '201006'}).encode(),
        headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


class CDP:
    def __init__(self, ws):
        self.ws = ws
        self.i = 0
        self.events = []

    async def send(self, method, **params):
        self.i += 1
        mid = self.i
        await self.ws.send(json.dumps({'id': mid, 'method': method, 'params': params}))
        while True:
            msg = json.loads(await self.ws.recv())
            if msg.get('id') == mid:
                if 'error' in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get('result', {})
            elif 'method' in msg:
                self.events.append(msg)

    async def js(self, expr):
        r = await self.send('Runtime.evaluate', expression=expr,
                            returnByValue=True, awaitPromise=True)
        return r.get('result', {}).get('value')

    async def shot(self, name):
        r = await self.send('Page.captureScreenshot', format='png')
        p = os.path.join(SHOTS, name)
        with open(p, 'wb') as f:
            f.write(base64.b64decode(r['data']))
        return p

    async def wait_for(self, expr, timeout=25, label=''):
        t0 = time.time()
        while time.time() - t0 < timeout:
            try:
                if await self.js(expr):
                    return True
            except Exception:
                pass
            await asyncio.sleep(0.4)
        print(f'  [超时] 等待 {label or expr}')
        return False


async def main():
    auth = login()
    token = auth.get('access_token') or auth.get('token')
    user = auth.get('user') or {}
    print(f'登录: token={"有" if token else "无"} user={user.get("nickname")}')

    proc = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={PORT}',
                             '--window-size=1280,900', '--no-first-run', '--no-default-browser-check',
                             '--user-data-dir=' + os.path.join(os.environ['TEMP'], 'cdp_prof'),
                             'about:blank'],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        # 等 DevTools 就绪
        for _ in range(40):
            try:
                v = json.loads(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/version', timeout=1).read())
                break
            except Exception:
                await asyncio.sleep(0.5)
        tabs = json.loads(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=5).read())
        page = next(t for t in tabs if t['type'] == 'page')

        async with websockets.connect(page['webSocketDebuggerUrl'], max_size=30 * 1024 * 1024) as ws:
            c = CDP(ws)
            await c.send('Page.enable')
            await c.send('Runtime.enable')
            await c.send('Log.enable')

            await c.send('Page.navigate', url=APP)
            await asyncio.sleep(3)
            # 注入凭证 → 重载，让 App 以登录态启动
            await c.js(f"localStorage.setItem('token', {json.dumps(token)});"
                       f"localStorage.setItem('user', {json.dumps(json.dumps(user))}); 'ok'")
            await c.send('Page.navigate', url=APP)
            await c.wait_for("document.querySelector('.search-go') !== null", 30, '页面就绪')

            # ── 1. 打开搜索（空态）──
            await c.js("document.querySelector('.search-go').click(); 'ok'")
            await c.wait_for("document.querySelector('.gs-input') !== null", 10, '搜索面板')
            await asyncio.sleep(0.7)
            print('  空态截图:', await c.shot('search-1-empty.png'))

            # ── 2. 关键词模式 ──
            await c.js("""(() => {
              const el = document.querySelector('.gs-input');
              const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
              set.call(el, '测试'); el.dispatchEvent(new Event('input', { bubbles: true })); return 'ok';
            })()""")
            await c.wait_for("document.querySelector('.gs-post-item,.gs-user-item,.gs-empty,.gs-skel') !== null", 20, '关键词结果')
            await asyncio.sleep(1.6)
            n_kw = await c.js("document.querySelectorAll('.gs-post-item').length + document.querySelectorAll('.gs-user-item').length + document.querySelectorAll('.gs-comment-item').length")
            print(f'  关键词结果数: {n_kw}')
            print('  关键词截图:', await c.shot('search-2-keyword.png'))

            # ── 3. 智能（语义）模式 ──
            tabs = await c.js("document.querySelectorAll('.gs-tab').length")
            print(f'  模式切换按钮数: {tabs}')
            await c.js("document.querySelectorAll('.gs-tab')[1].click(); 'ok'")
            await asyncio.sleep(0.5)
            skel = await c.js("document.querySelector('.gs-skel') !== null")
            print(f'  语义模式骨架屏出现: {skel}')
            await c.wait_for("document.querySelector('.gs-skel') === null && document.querySelector('.gs-results,.gs-empty') !== null", 40, '语义结果')
            await asyncio.sleep(1.2)
            n_sem = await c.js("document.querySelectorAll('.gs-post-item').length")
            bars = await c.js("document.querySelectorAll('.gs-score-bar').length")
            print(f'  语义结果数: {n_sem} | 相似度条: {bars}')
            print('  语义截图:', await c.shot('search-3-semantic.png'))

            # ── 4. 控制台报错 ──
            errs = []
            for e in c.events:
                m = e.get('method')
                if m == 'Runtime.exceptionThrown':
                    errs.append(e['params']['exceptionDetails'].get('text', '?'))
                elif m == 'Log.entryAdded' and e['params']['entry'].get('level') == 'error':
                    errs.append(e['params']['entry'].get('text', '?'))
            print(f'\n控制台错误: {len(errs)}')
            for x in errs[:6]:
                print('   !', str(x)[:140])
    finally:
        proc.terminate()

asyncio.run(main())