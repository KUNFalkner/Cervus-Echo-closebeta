"""真机验证：AI 解读进行中点「重新抽牌」→ 旧请求作废、无错误提示、新抽牌干净。"""
import json, random, sqlite3, subprocess, time, urllib.request, websocket, threading

PORT = 9377
CHROME = r"C:/Users/FXK/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"
UD = "/tmp/cdp_abort_%d" % random.randint(1000, 9999)
proc = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--remote-allow-origins=*",
    f"--remote-debugging-port={PORT}", f"--user-data-dir={UD}", "about:blank"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)

def get_ws():
    for _ in range(40):
        try:
            with urllib.request.urlopen(f"http://localhost:{PORT}/json/list", timeout=2) as r:
                for t in json.loads(r.read()):
                    if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                        return t["webSocketDebuggerUrl"]
        except Exception: time.sleep(0.3)
    raise SystemExit("no ws")

ws = websocket.create_connection(get_ws(), suppress_origin=True)
mid = 0; pend = {}
def reader():
    while True:
        try: raw = ws.recv()
        except Exception: break
        m = json.loads(raw)
        if "id" in m: pend[m["id"]] = m
threading.Thread(target=reader, daemon=True).start()

def send(method, params=None, timeout=20):
    global mid; mid += 1; i = mid
    ws.send(json.dumps({"id": i, "method": method, "params": params or {}}))
    t0 = time.time()
    while time.time() - t0 < timeout:
        if i in pend: return pend.pop(i)
        time.sleep(0.05)
    return {}

def js(expr):
    r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    try: return r["result"]["result"].get("value")
    except Exception: return None

send("Page.navigate", {"url": "http://localhost:8000/"})
time.sleep(3)
js("localStorage.setItem('rules_accepted','true')")
js("window.__errs=[];window.addEventListener('error',e=>window.__errs.push(e.message))")
con = sqlite3.connect(r"E:/mimo code 树洞设计/backend/cervus.db")
row = con.execute("SELECT username FROM users WHERE username LIKE 'grp%' OR username LIKE 'burn%' ORDER BY id DESC LIMIT 1").fetchone()
con.close()
js(f"document.querySelector('.login-input').value='{row[0]}'")
js("document.querySelector('.login-input').dispatchEvent(new Event('input',{bubbles:true}))")
js("document.querySelectorAll('.login-input')[1].value='test1234'")
js("document.querySelectorAll('.login-input')[1].dispatchEvent(new Event('input',{bubbles:true}))")
js("document.querySelector('.login-btn').click()")
time.sleep(3)
js("document.querySelector('.welcome-overlay')?.click()")
time.sleep(0.6)
js("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('开始使用')||b.textContent.includes('我同意'))?.click()")
time.sleep(0.6)

# 打开塔罗 → 抽牌
js("[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='打开塔罗占卜')?.click()")
time.sleep(2.5)
js("[...document.querySelectorAll('.tarot-start')][0]?.click()")
time.sleep(4)
ok1 = js("!!document.querySelector('.tarot-card')")
print("发牌完成:", ok1)

# 点 AI 解读（进行中）：按钮启用有动画竞态，点空就重试；再轮询等等待环
busy = False
for attempt in range(3):
    for _ in range(40):
        if js("[...document.querySelectorAll('.tarot-ask')].some(b=>!b.disabled)"):
            break
        time.sleep(0.5)
    js("[...document.querySelectorAll('.tarot-ask')].find(b=>!b.disabled)?.click()")
    for _ in range(20):
        if js("!!document.querySelector('.tarot-counsel-wait')"):
            busy = True
            break
        time.sleep(0.5)
    if busy:
        break
print("解读进行中(等待环出现):", busy)

# 解读进行中点「重新洗牌」
js("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('重新洗牌')||b.textContent.includes('重新抽牌'))?.click()")
time.sleep(1)
mid_state = js("!document.querySelector('.tarot-counsel-wait') && !document.querySelector('.tarot-toast-error')")
print("重抽后等待态立刻消失、无错误toast:", mid_state)

# 等待足够久（若旧请求未作废会在此期间弹「本地模型正忙」）
time.sleep(6)
no_toast = js("!document.body.textContent.includes('本地模型正忙')")
no_old_counsel = js("!document.querySelector('.tarot-counsel')")
print("6s 后无「本地模型正忙」弹窗:", no_toast)
print("旧解读未写入新牌面:", no_old_counsel)

# 新一抽的 AI 解读应能正常工作：先回到抽牌前（已在重抽后），再抽一次，然后发起新解读
js("document.querySelector('.tarot-start')?.click()")
# 等「询问」按钮真正可用再点（发牌/翻牌动画结束前它是 disabled，盲点会点空）
for _ in range(40):
    if js("[...document.querySelectorAll('.tarot-ask')].some(b=>!b.disabled)"):
        break
    time.sleep(0.5)
dealt2 = js("!!document.querySelector('.tarot-card')")
print("新抽牌发牌完成:", dealt2)
js("[...document.querySelectorAll('.tarot-ask')].find(b=>!b.disabled)?.click()")
# 等待环是异步渲染的；且上一次被取消的请求可能仍在 Ollama 端生成（串行），故重试 + 放宽到 60s
new_wait = False
for attempt in range(3):
    for _ in range(60):
        if js("[...document.querySelectorAll('.tarot-ask')].some(b=>!b.disabled)"):
            break
        time.sleep(0.5)
    js("[...document.querySelectorAll('.tarot-ask')].find(b=>!b.disabled)?.click()")
    for _ in range(40):
        if js("!!document.querySelector('.tarot-counsel-wait')"):
            new_wait = True
            break
        time.sleep(0.5)
    if new_wait:
        break
print("新抽牌可正常发起解读(等待环重现):", new_wait)
# 清理：作废这次测试解读，不留后台请求
js("document.querySelector('.tarot-redraw')?.click()")
time.sleep(0.5)
print("测试后清理(重新洗牌):", js("!document.querySelector('.tarot-counsel-wait')"))

errs = js("(window.__errs||[]).join(' | ')") or ""
print("控制台错误:", errs[:200] or "(无)")
print("VERDICT:", "PASS" if all([ok1, busy, mid_state, no_toast, no_old_counsel, new_wait]) else "FAIL")
