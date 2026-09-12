import asyncio, json, os, subprocess, time, urllib.request
import websockets

CHROME = r'C:\Users\FXK\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe'
SHOTS = r'E:\mimo code 树洞设计\shots'
P = F = 0


def ok(n, c, e=''):
    global P, F
    if c:
        P += 1; print('  ok  ' + n, str(e)[:90])
    else:
        F += 1; print('  BAD ' + n, str(e)[:90])


def login(u, p):
    q = urllib.request.Request('http://localhost:8000/api/users/login',
                               data=json.dumps({'username': u, 'password': p}).encode(),
                               headers={'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(q, timeout=20).read())


async def main():
    prof = os.environ['LOCALAPPDATA'] + r'/Temp/cdp_sch_%d' % int(time.time())
    pr = subprocess.Popen([CHROME, '--headless=new', '--remote-debugging-port=9336',
                           '--user-data-dir=' + prof, '--window-size=1440,1000', 'about:blank'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(4)
    try:
        tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9336/json', timeout=10).read())
        ws_url = [t for t in tabs if t['type'] == 'page'][0]['webSocketDebuggerUrl']
    except Exception as e:
        print('CDP 启动失败', e); pr.kill(); return
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
        tok = json.dumps(d['access_token']); usr = json.dumps(d['user'])
        await send('Page.navigate', {'url': 'http://localhost:8088/'})
        await asyncio.sleep(3)
        await js(f"localStorage.setItem('token',{tok});localStorage.setItem('user',JSON.stringify({usr}));"
                 f"localStorage.setItem('rules_accepted','1');location.reload()")
        await asyncio.sleep(5)
        await js("document.querySelector('.welcome-overlay')?.click()")
        await asyncio.sleep(1)
        await js("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='管理')?.click()")
        await asyncio.sleep(3)
        await js("[...document.querySelectorAll('.admin-tab')].find(b=>b.textContent.trim()==='用户')?.click()")
        await asyncio.sleep(2)
        sels = await js("JSON.stringify([...document.querySelectorAll('.mute-bar select')].map(s=>({n:s.textContent,v:s.value})))")
        sels = json.loads(sels or '[]')
        role_opts = await js("[...document.querySelectorAll('.mute-bar select')][0] ? [...document.querySelectorAll('.mute-bar select')][0].textContent : ''")
        ok('用户页出现「角色筛选」下拉', '角色筛选' in (await js("document.querySelector('.mute-bar')?.textContent||''") or ''), role_opts)
        ok('角色下拉含 学生/教师/学校官方', all(x in (role_opts or '') for x in ['学生', '教师', '学校官方']), role_opts)
        n_all = await js("(document.querySelector('.mute-bar')?.textContent.match(/共 (\\d+) 人/)||[])[1]")
        await js("[...document.querySelectorAll('.mute-bar select')][0].selectedIndex=2;"
                 "[...document.querySelectorAll('.mute-bar select')][0].dispatchEvent(new Event('change',{bubbles:true}))")
        await asyncio.sleep(2)
        n_teacher = await js("(document.querySelector('.mute-bar')?.textContent.match(/共 (\\d+) 人/)||[])[1]")
        ok('切换到「教师」后人数变化', n_all != n_teacher, f'全部={n_all} 教师={n_teacher}')
        await send('Page.captureScreenshot')
        p1 = SHOTS + '/admin-users-role-filter.png'
        r = await send('Page.captureScreenshot')
        import base64
        open(p1, 'wb').write(base64.b64decode(r['data']))
        await js("[...document.querySelectorAll('.admin-tab')].find(b=>b.textContent.includes('教师审批'))?.click()")
        await asyncio.sleep(2)
        has = await js("document.body.innerText.includes('新增学校')")
        ok('教师审批页出现「新增学校」入口', bool(has))
        r = await send('Page.captureScreenshot')
        open(SHOTS + '/admin-add-school.png', 'wb').write(base64.b64decode(r['data']))
        txt = await js("document.body.innerText.slice(0,600)")
        print('  [页面片段]', (txt or '').replace(chr(10), ' / ')[:260])
    pr.kill()
    print(f'\n=== PASS {P} / {P + F} ===')


asyncio.run(main())
