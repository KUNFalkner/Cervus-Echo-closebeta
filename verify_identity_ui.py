"""身份改动 UI 验收：注册页标签、中文报错、校方管理面板可见教师审批。"""
import asyncio, base64, json, os, random, string, subprocess, time, urllib.request
import websockets

CHROME = r'C:\Users\FXK\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe'
SHOTS = r'E:\mimo code 树洞设计\shots'
PORT = 9337


def api(path, body=None, token=None):
    req = urllib.request.Request('http://localhost:8088/api' + path, method='POST' if body else 'GET')
    if body is not None:
        req.add_header('Content-Type', 'application/json')
        req.data = json.dumps(body).encode()
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode() or '{}')


async def main():
    so = api('/users/login', {'username': 'JSKSofficial', 'password': 'JSKS001'})
    tok, user = so.get('access_token'), so.get('user')
    print('校方登录:', bool(tok))
    assert tok, so

    proc = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={PORT}',
                             '--window-size=1280,1000', '--no-first-run', '--disable-gpu',
                             '--user-data-dir=' + os.path.expandvars(r'%TEMP%\cdp_id'),
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
    assert ws_url, 'CDP 连接失败'

    ctr = {'id': 0}
    errs = []
    async with websockets.connect(ws_url, max_size=80 * 1024 * 1024) as ws:
        async def cmd(method, params=None, timeout=120):
            ctr['id'] += 1; mid = ctr['id']
            await ws.send(json.dumps({'id': mid, 'method': method, 'params': params or {}}))
            end = time.time() + timeout
            while time.time() < end:
                try:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=max(1, end - time.time())))
                except asyncio.TimeoutError:
                    return {}
                if m.get('id') == mid: return m
                if m.get('method') == 'Runtime.exceptionThrown':
                    errs.append(json.dumps(m.get('params', {}))[:200])
                if m.get('method') == 'Log.entryAdded':
                    e = m.get('params', {}).get('entry', {})
                    if e.get('level') == 'error':
                        errs.append((e.get('text', '')[:120]) + ' <- ' + (e.get('url', '') or '')[:90])
            return {}

        async def js(expr):
            r = await cmd('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': True})
            return (r.get('result', {}).get('result', {}) or {}).get('value')

        async def shot(name):
            r = await cmd('Page.captureScreenshot', {'format': 'png'})
            d = r.get('result', {}).get('data')
            if d:
                p = os.path.join(SHOTS, name)
                open(p, 'wb').write(base64.b64decode(d))
                print('  截图', p)

        await cmd('Runtime.enable'); await cmd('Log.enable'); await cmd('Page.enable')
        await cmd('Emulation.setDeviceMetricsOverride', {'width': 1280, 'height': 1000, 'deviceScaleFactor': 2, 'mobile': False})

        # ── 1) 注册页标签 ──
        await cmd('Page.navigate', {'url': 'http://localhost:8088/'})
        await asyncio.sleep(4)
        await js("localStorage.clear(); location.reload()")
        await asyncio.sleep(4)
        ph = await js("Array.from(document.querySelectorAll('input')).map(i=>i.placeholder).join(' | ')")
        print('登录页输入框:', ph)
        await js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('去注册'))?.click()")
        await asyncio.sleep(2)
        ph2 = await js("Array.from(document.querySelectorAll('input')).map(i=>i.placeholder).join(' | ')")
        print('注册页输入框:', ph2)
        print('  ✓ 无「密码（可选）」:', '密码（可选）' not in (ph or '') + (ph2 or ''))
        print('  ✓ 无「账户名」:', '账户名' not in (ph2 or ''))
        print('  ✓ 密码标签含要求:', '至少 8 位' in (ph2 or ''))
        print('  ✓ 昵称可留空:', '可留空' in (ph2 or ''))
        await shot('id-1-register.png')

        # ── 2) 中文报错（用户名/密码非法 → 422 应显示中文）──
        await js("""(() => {
          const ins = document.querySelectorAll('input');
          const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
            s.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); };
          set(ins[0], '1'); set(ins[1], '1');
          const sn = Array.from(ins).find(i => i.placeholder && i.placeholder.includes('1-55'));
          if (sn) set(sn, '12');
        })()""")
        await asyncio.sleep(1)
        await js("document.querySelector('.login-btn,form button[type=submit]')?.click()")
        await asyncio.sleep(1.5)  # toast 3 秒后自动移除，必须及时读
        toast = await js("document.querySelector('.toast-container')?.innerText || ''")
        print('注册报错文案:', repr(toast))
        print('  ✓ 中文报错:', bool(toast) and ('至少' in toast or '只能包含' in toast) and 'String should' not in toast)
        await shot('id-2-error.png')

        # ── 3) 校方进管理后台应看到「教师审批」 ──
        await js(f"localStorage.setItem('token', {json.dumps(tok)}); localStorage.setItem('user', {json.dumps(json.dumps(user))}); location.reload()")
        await asyncio.sleep(5)
        tabs = await js("Array.from(document.querySelectorAll('button')).map(b=>b.textContent.trim()).join(' | ')")
        print('导航按钮:', (tabs or '')[:220])
        await js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('管理'))?.click()")
        await asyncio.sleep(3)
        admin_tabs = await js("Array.from(document.querySelectorAll('.admin-tab')).map(b=>b.textContent.trim()).join(' | ')")
        print('管理后台标签:', admin_tabs)
        print('  ✓ 校方可见教师审批:', '教师审批' in (admin_tabs or ''))
        print('  ✓ 校方不见创建校方入口:', '创建学校官方账号' not in (await js("document.body.innerText") or ''))
        await shot('id-3-admin-schofficial.png')

        await js("Array.from(document.querySelectorAll('.admin-tab')).find(b=>b.textContent.includes('教师审批'))?.click()")
        await asyncio.sleep(3)
        await shot('id-4-teacher-approvals.png')

    proc.kill()
    print('\n控制台错误:', len(errs))
    for e in errs[:5]:
        print('  ', e)


asyncio.run(main())
