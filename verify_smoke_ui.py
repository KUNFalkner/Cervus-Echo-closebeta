"""真机 CDP 冒烟 v2（阶段 8）：真实表单登录 -> 欢迎/规则遮罩 -> 群聊 tab -> 我的内容 -> 控制台零报错。"""
import json, os, random, sqlite3, subprocess, sys, time, urllib.request, websocket, threading

PORT = 9353
CHROME = r"C:/Users/FXK/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"
UD = "/tmp/cdp_smoke2_%d" % random.randint(1000, 9999)
passed = []; failed = []
def ok(n, e=""):
    if isinstance(e, bool):
        if e: print("  ok:", n); passed.append(n)
        else: print("  BAD:", n); failed.append(n)
        return
    print("  ok:", n + (" :: " + e if e else "")); passed.append(n)

# 取一个测试号
DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend", "cervus.db")
con = sqlite3.connect(DB)
row = con.execute("SELECT username FROM users WHERE username LIKE 'grp%' OR username LIKE 'burn%' ORDER BY id DESC LIMIT 1").fetchone()
con.close()
USERNAME = row[0]

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
def send(method, params=None, timeout=15):
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

# 访问 + 注入错误收集
send("Page.navigate", {"url": "http://localhost:8001/"})
time.sleep(3)
js("window.__errs=[]; window.addEventListener('error',e=>window.__errs.push(e.message))")

# 真实登录：用户名 input + 密码 input（.login-input）→ 点 .login-btn
js(f"""
(() => {{
  const inputs = document.querySelectorAll('.login-input');
  if(!inputs.length) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  setter.call(inputs[0], '{USERNAME}'); inputs[0].dispatchEvent(new Event('input',{{bubbles:true}}));
  if(inputs[1]){{ setter.call(inputs[1], 'test1234'); inputs[1].dispatchEvent(new Event('input',{{bubbles:true}})); }}
  return true;
}})()
""")
time.sleep(0.3)
js("document.querySelector('.login-btn')?.click()")
time.sleep(3.5)

# 登录后：可能弹规则 modal 或欢迎遮罩
logged_in = js("!!document.querySelector('.glass-nav') || !!document.querySelector('.mobile-nav') || !!document.querySelector('.welcome-overlay')")
ok("登录成功进入主界面", logged_in)

# 若规则 modal 弹着，点掉
js("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('开始使用')||b.textContent.includes('已知晓')||b.textContent.includes('我同意'))?.click()")
time.sleep(1)
# 若欢迎遮罩在，等它消失或点掉
time.sleep(2)
js("[...document.querySelectorAll('.welcome-overlay, button')].find(el=>el.className==='welcome-overlay')?.click()")
time.sleep(0.8)

nav = js("[...document.querySelectorAll('button')].map(b=>b.textContent).join('|')") or ""
ok("导航含消息/我的", ("消息" in nav or "私信" in nav) and "我的" in nav)
ok("聊天室 tab 存在", "聊天室" in nav or "群聊" in nav)

# 切到消息页（chat）
js("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('消息')||b.textContent.includes('聊天'))?.click()")
time.sleep(1.5)
nav2 = js("[...document.querySelectorAll('button')].map(b=>b.textContent).join('|')") or ""
ok("群聊 tab 在消息页", "群聊" in nav2)
ok("私信 tab 在消息页", "私信" in nav2)

# 切群聊 tab
js("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('群聊'))?.click()")
time.sleep(1.5)
grp_ui = js("[...document.querySelectorAll('button')].map(b=>b.textContent).join('|')") or ""
ok("群聊页可打开(建群按钮)", "建群" in grp_ui)

# 去「我的」页
js("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('我的'))?.click()")
time.sleep(1.5)
my_ui = js("document.body.innerText") or ""
ok("我的页含我的内容", "我的帖子" in my_ui or "我的评论" in my_ui or "我的收藏" in my_ui)
ok("我的页含社区公约入口", "社区公约" in my_ui)

errs = js("(window.__errs||[]).join(' | ')") or ""
print("  控制台错误:", errs[:250] or "(无)")
ok("控制台零错误", not errs)

print(f"\n=== PASS {len(passed)} / {len(passed)+len(failed)} ===")
if failed: print("FAILED:", ", ".join(failed)); sys.exit(1)
