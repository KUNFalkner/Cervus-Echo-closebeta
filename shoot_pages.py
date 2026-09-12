"""全页截图验收：登录 → 首页/消息三tab/我的/塔罗/手记 → 逐页 PNG，控制台错误汇总。"""
import json, random, sqlite3, subprocess, sys, time, urllib.request, websocket, threading

PORT = 9371
CHROME = r"C:/Users/FXK/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"
UD = "/tmp/cdp_shots_%d" % random.randint(1000, 9999)
OUT = r"E:/mimo code 树洞设计/shots"
import os
os.makedirs(OUT, exist_ok=True)

proc = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--remote-allow-origins=*",
    f"--remote-debugging-port={PORT}", f"--user-data-dir={UD}", "--window-size=1280,860", "about:blank"],
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

def shot(name):
    r = send("Page.captureScreenshot", {"format": "png"})
    if r and "result" in r and "data" in r["result"]:
        import base64
        with open(f"{OUT}/{name}.png", "wb") as f:
            f.write(base64.b64decode(r["result"]["data"]))
        print("  shot:", name)

send("Page.navigate", {"url": "http://localhost:8000/"})
time.sleep(3)
js("window.__errs=[];window.addEventListener('error',e=>window.__errs.push(e.message))")
js("localStorage.setItem('rules_accepted','true')")

# 登录页截图（未登录态）
js("localStorage.removeItem('token');localStorage.removeItem('user');location.reload()")
time.sleep(3)
shot("01-login")

# 登录
con = sqlite3.connect(r"E:/mimo code 树洞设计/backend/cervus.db")
row = con.execute("SELECT username FROM users WHERE username LIKE 'grp%' OR username LIKE 'burn%' ORDER BY id DESC LIMIT 1").fetchone()
con.close()
js(f"document.querySelector('.login-input').value='{row[0]}'")
js("document.querySelector('.login-input').dispatchEvent(new Event('input',{bubbles:true}))")
js("document.querySelectorAll('.login-input')[1].value='test1234'")
js("document.querySelectorAll('.login-input')[1].dispatchEvent(new Event('input',{bubbles:true}))")
js("document.querySelector('.login-btn').click()")
time.sleep(2.5)
shot("02-welcome-overlay")
time.sleep(2.5)
js("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('开始使用')||b.textContent.includes('我同意'))?.click()")
time.sleep(1)
shot("03-home")

# 消息三 tab
js("[...document.querySelectorAll('.nav-links button')].find(b=>b.textContent.includes('消息'))?.click()")
time.sleep(1.2)
shot("04-chat-global")
js("[...document.querySelectorAll('.chat-tab')].find(b=>b.textContent.includes('私信'))?.click()")
time.sleep(1)
shot("05-dm")
js("[...document.querySelectorAll('.chat-tab')].find(b=>b.textContent.includes('群聊'))?.click()")
time.sleep(1.2)
# 进第一个群 + 打开焚毁选择器
js("[...document.querySelectorAll('.dm-conv')][0]?.click()")
time.sleep(1.2)
js("[...document.querySelectorAll('.burn-opt')][0]?.click()")
time.sleep(0.6)
shot("06-group-burn-active")
js("[...document.querySelectorAll('.burn-opt')].find(b=>b.textContent.includes('取消'))?.click()")
time.sleep(0.4)

# 我的
js("[...document.querySelectorAll('.nav-links button')].find(b=>b.textContent.trim()==='我的')?.click()")
time.sleep(1.2)
shot("07-profile")

# 树洞手记
js("[...document.querySelectorAll('.settings-item')].find(x=>x.textContent.includes('树洞手记'))?.click()")
time.sleep(1.8)
shot("08-story")
# 翻一页
js("document.querySelector('.cs-page')?.click()")
time.sleep(1)
shot("09-story-flipped")

# 塔罗
js("[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='打开塔罗占卜')?.click()")
time.sleep(2.5)
shot("10-tarot")
# 抽牌
js("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('开始抽牌'))?.click()")
time.sleep(4)
shot("11-tarot-dealt")
# 展开详情
js("[...document.querySelectorAll('.tarot-toggle')][0]?.click()")
time.sleep(0.8)
shot("12-tarot-detail")

errs = js("(window.__errs||[]).join(' | ')") or ""
print("控制台错误:", errs[:300] or "(无)")
print("DONE, shots in", OUT)
