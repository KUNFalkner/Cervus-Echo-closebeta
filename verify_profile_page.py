"""个人页（我的）可用性检查：卡片/头像/标签页渲染 + 控制台错误。"""
import asyncio, json, os, subprocess, time, urllib.request
import websockets

CHROME = r'C:\Users\FXK\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe'
SHOT = r'E:\mimo code 树洞设计\shots\profile-check.png'


def login(u, p):
    q = urllib.request.Request('http://localhost:8000/api/users/login',
                               data=json.dumps({'username': u, 'password': p}).encode(),
                               headers={'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(q, timeout=20).read())


async def main():
    prof = os.environ['LOCALAPPDATA'] + r'/Temp/cdp_prof_%d' % int(time.time())
    pr = subprocess.Popen([CHROME, '--headless=new', '--remote-debugging-port=9337',
                           '--user-data-dir=' + prof, '--window-size=1440,1000', 'about:blank'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(4)
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9337/json', timeout=10).read())
    ws_url = [t for t in tabs if t['type'] == 'page'][0]['webSocketDebuggerUrl']
    d = login('founder', '201006')
    async with websockets.connect(ws_url, max_size=40 * 1024 * 1024) as ws:
        i = [0]

        async def send(m, params=None):
            i[0] += 1
            await ws.send(json.dumps({'id': i[0], 'method': m, 'params': params or {}}))
            while True:
                r = json.loads(await asyncio.wait_for(ws.recv(), 60))
                if r.get('id') == i[0]:
                    return r.get('result', {})

        async def js(e):
            r = await send('Runtime.evaluate', {'expression': e, 'returnByValue': True, 'awaitPromise': True})
            return r.get('result', {}).get('value')

        await send('Page.enable'); await send('Runtime.enable')
        tok = json.dumps(d['access_token'])
        await send('Page.navigate', {'url': 'http://localhost:8088/'})
        await asyncio.sleep(3)
        await js(f"localStorage.setItem('token',{tok});localStorage.setItem('user',{json.dumps(d['user'])});"
                 f"localStorage.setItem('rules_accepted','1');location.reload()")
        await asyncio.sleep(5)
        await js("document.querySelector('.welcome-overlay')?.click()")
        await asyncio.sleep(1)
        await js("[...document.querySelectorAll('.nav-links button')].find(b=>b.textContent.indexOf('我的')>=0)?.click()")
        await asyncio.sleep(2.5)
        pc = await js("!!document.querySelector('.profile-card')")
        av = await js("!!document.querySelector('.avatar-upload')")
        info = await js("document.querySelector('.profile-info')?.innerText?.slice(0,60)||''")
        tabs = await js("[...document.querySelectorAll('.profile-tabs button, .profile-tab')].map(b=>b.textContent.trim()).join('|')")
        print('profile-card 存在:', pc)
        print('avatar-upload 存在:', av)
        print('资料区文字:', (info or '').replace('\n', ' / ')[:80])
        print('个人页标签:', tabs)
        errs = await js("window.__errs||0")
        r = await send('Page.captureScreenshot')
        import base64
        open(SHOT, 'wb').write(base64.b64decode(r['data']))
        print('截图:', SHOT, '| 页面错误计数:', errs)
        bad = (not pc) or (not av)
        print('VERDICT:', 'FAIL' if bad else 'PASS')
    pr.kill()


asyncio.run(main())
