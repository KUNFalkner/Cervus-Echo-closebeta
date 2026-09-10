"""UI 验证（放宽等待版）：截图关键词与智能两种模式的真实结果。"""
import asyncio, base64, json, os, subprocess, time, urllib.request
import websockets

CHROME = r'C:\Users\FXK\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe'
SHOTS = r'E:\mimo code 树洞设计\shots'
PORT = 9333
TOKEN = None


def login():
    req = urllib.request.Request('http://localhost:8088/api/users/login', method='POST')
    req.data = json.dumps({'username': 'founder', 'password': '201006'}).encode()
    req.add_header('Content-Type', 'application/json')
    d = json.loads(urllib.request.urlopen(req, timeout=60).read().decode())
    return d.get('access_token') or d.get('token')


async def main():
    global TOKEN
    TOKEN = login()
    print('token:', bool(TOKEN))
    proc = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={PORT}',
                             '--window-size=1280,920', '--no-first-run', '--disable-gpu',
                             '--user-data-dir=' + os.path.expandvars(r'%TEMP%\cdp_prof2'), 'about:blank'],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws_url = None
    for _ in range(40):
        try:
            t = json.loads(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=2).read().decode())
            for x in t:
                if x.get('type') == 'page':
                    ws_url = x['webSocketDebuggerUrl']
                    break
            if ws_url:
                break
        except Exception:
            time.sleep(0.5)
    if not ws_url:
        print('CDP 连接失败')
        proc.kill()
        return

    ctr = {'id': 0}
    errs = []

    async with websockets.connect(ws_url, max_size=80 * 1024 * 1024) as ws:
        async def cmd(method, params=None, timeout=120):
            ctr['id'] += 1
            mid = ctr['id']
            await ws.send(json.dumps({'id': mid, 'method': method, 'params': params or {}}))
            end = time.time() + timeout
            while time.time() < end:
                try:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=max(1, end - time.time())))
                except asyncio.TimeoutError:
                    return {}
                if m.get('id') == mid:
                    return m
                if m.get('method') == 'Runtime.exceptionThrown':
                    errs.append(str(m['params']['exceptionDetails'].get('text'))[:160])
                elif m.get('method') == 'Runtime.consoleAPICalled' and m['params'].get('type') == 'error':
                    errs.append(' '.join(str(a.get('value', a.get('description', ''))) for a in m['params'].get('args', []))[:160])
            return {}

        async def js(expr, timeout=120):
            r = await cmd('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}, timeout)
            return r.get('result', {}).get('result', {}).get('value')

        async def shot(name):
            r = await cmd('Page.captureScreenshot', {'format': 'png'}, 60)
            data = r.get('result', {}).get('data')
            if data:
                with open(os.path.join(SHOTS, name), 'wb') as f:
                    f.write(base64.b64decode(data))
                print('  截图:', name)

        await cmd('Runtime.enable')
        await cmd('Page.enable')
        await cmd('Page.navigate', {'url': 'http://localhost:8088'})
        await asyncio.sleep(6)
        await js(f"localStorage.setItem('token', {json.dumps(TOKEN)}); 'ok'")
        await cmd('Page.reload')
        await asyncio.sleep(9)

        ok = await js("!!document.querySelector('.search-go')")
        print('搜索入口存在:', ok)
        await js("document.querySelector('.search-go').click(); 'ok'")
        await asyncio.sleep(1.5)
        print('遮罩打开:', await js("!!document.querySelector('.global-search-panel')"))
        print('模式按钮数:', await js("document.querySelectorAll('.gs-tab').length"))
        await shot('v2-1-empty.png')

        # 输入查询（走 React 原生 setter + input 事件）
        await js("""(() => {
          const el = document.querySelector('.gs-input');
          const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          s.call(el, '测试');
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return 'ok';
        })()""")
        for i in range(30):
            await asyncio.sleep(1.5)
            n = await js("document.querySelectorAll('.gs-post-item').length + document.querySelectorAll('.gs-user-item').length")
            if n:
                break
        print('关键词结果项:', await js("document.querySelectorAll('.gs-post-item').length"), '用户:', await js("document.querySelectorAll('.gs-user-item').length"), '评论:', await js("document.querySelectorAll('.gs-comment-item').length"))
        print('骨架是否仍在:', await js("!!document.querySelector('.gs-skel')"))
        print('结果区文本:', (await js("(document.querySelector('.gs-results')||{}).innerText || ''"))[:160].replace('\n', ' | '))
        await shot('v2-2-keyword.png')

        # 切到智能模式
        await js("document.querySelectorAll('.gs-tab')[1].click(); 'ok'")
        for i in range(40):
            await asyncio.sleep(2)
            n = await js("document.querySelectorAll('.gs-score').length")
            if n:
                break
        print('语义结果项:', await js("document.querySelectorAll('.gs-post-item').length"), '相似度徽章:', await js("document.querySelectorAll('.gs-score').length"))
        print('徽章文本样本:', (await js("Array.from(document.querySelectorAll('.gs-score')).slice(0,3).map(e=>e.innerText).join(' / ')")) or '(无)')
        # 几何断言：徽章必须是「小方块」，不能是「全宽细条」，且文字未被裁
        geo = await js("""(() => {
          const els = Array.from(document.querySelectorAll('.gs-post-item .gs-score'));
          if (!els.length) return {n: 0};
          const item = els[0].closest('.gs-post-item');
          const main = item.querySelector('.gs-post-main');
          const title = item.querySelector('.gs-post-title');
          const meta = item.querySelector('.gs-post-meta');
          const r = els[0].getBoundingClientRect();
          const mr = main ? main.getBoundingClientRect() : null;
          const tr = title ? title.getBoundingClientRect() : null;
          const xr = meta ? meta.getBoundingClientRect() : null;
          return {
            n: els.length,
            w: Math.round(r.width), h: Math.round(r.height),
            itemW: Math.round(item.getBoundingClientRect().width),
            clipped: els[0].scrollHeight > els[0].clientHeight + 1,
            overflow: getComputedStyle(els[0]).overflow,
            txt: els[0].innerText.trim(),
            dir: getComputedStyle(item).flexDirection,
            hasMain: !!main,
            mainW: mr ? Math.round(mr.width) : -1,
            titleTop: tr ? Math.round(tr.top) : -1,
            metaTop: xr ? Math.round(xr.top) : -1,
            badgeLeft: Math.round(r.left), mainRight: mr ? Math.round(mr.right) : -1,
          };
        })()""")
        print('徽章几何:', json.dumps(geo, ensure_ascii=False))
        if geo.get('n'):
            w_ratio = geo['w'] / max(geo['itemW'], 1)
            print('  宽度占比: %.0f%% (应远小于 100%%)' % (w_ratio * 100))
            print('  高度: %dpx (应 > 14px，细条则为 3px)' % geo['h'])
            print('  文字被裁:', geo['clipped'])
            print('  条目方向:', geo['dir'], '(应为 row)')
            print('  标题/作者分行:', geo['metaTop'] > geo['titleTop'] + 6, '(标题 top=%d, 作者 top=%d)' % (geo['titleTop'], geo['metaTop']))
            print('  徽章在文字块右侧:', geo['badgeLeft'] >= geo['mainRight'] - 2, '(徽章 left=%d, 文字块 right=%d)' % (geo['badgeLeft'], geo['mainRight']))
        print('降级提示:', await js("!!document.querySelector('.gs-degraded')"))
        await shot('v2-3-semantic.png')
        print('控制台错误:', len(errs))
        for e in errs[:5]:
            print('  !', e)
    proc.kill()


asyncio.run(main())
