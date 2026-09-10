import websocket, json, threading, time, urllib.request, subprocess, sys, random, string

PORT = 9339
CHROME = r"C:/Users/FXK/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"
BASE = "http://localhost:8000/api"
UD = "/tmp/cdp_t10t11_%d" % random.randint(1000, 9999)
RAND = ''.join(random.choices(string.digits, k=6))
USERNAME = "t10t11_" + RAND
POST_TITLE = "T10T11验证帖_" + RAND
COMMENT_TEXT = "原评论内容_" + RAND
NEW_COMMENT = "已编辑内容_" + RAND

passed = []
failed = []
def ok(name, extra=""):
    print("  ok:", name + ((" :: " + extra) if extra else ""))
    passed.append(name)
def bad(name, extra=""):
    print("  BAD:", name + ((" :: " + extra) if extra else ""))
    failed.append(name)

# ── helpers ──────────────────────────────────────────────
def http(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

# ── 1. register user ─────────────────────────────────────
st, reg = http("POST", "/users/", {
    "username": USERNAME, "password": "test1234",
    "nickname": "验证同学", "school_id": "JSKS",
    "enrollment_year": 2024, "class_number": random.randint(1, 55),
    "student_number": random.randint(1000, 9999),
})
if st != 200:
    print("REGISTER FAIL", st, reg); sys.exit(1)
token = reg["access_token"]; user = reg["user"]
print("registered", USERNAME, "uid", user["uid"])

# ── 2. create a post ─────────────────────────────────────
st, post = http("POST", "/posts/", {"title": POST_TITLE, "content": "这是用于 T10/T11 验证的帖子正文。"}, token)
if st != 200:
    print("CREATE POST FAIL", st, post); sys.exit(1)
post_id = post["id"]
print("created post", post_id)

# ── 3. add a comment by this user ────────────────────────
st, comm = http("POST", f"/posts/{post_id}/comments", {"content": COMMENT_TEXT}, token)
if st != 200:
    print("CREATE COMMENT FAIL", st, comm); sys.exit(1)
comment_id = comm["id"]
print("created comment", comment_id)

# ── launch headless chrome w/ CDP ────────────────────────
proc = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
    "--remote-allow-origins=*", f"--remote-debugging-port={PORT}", f"--user-data-dir={UD}",
    "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)

def get_ws():
    for _ in range(40):
        try:
            with urllib.request.urlopen(f"http://localhost:{PORT}/json/list", timeout=2) as r:
                for t in json.loads(r.read()):
                    if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                        return t["webSocketDebuggerUrl"]
        except Exception:
            time.sleep(0.3)
    raise SystemExit("no ws url")

ws = websocket.create_connection(get_ws(), suppress_origin=True)
msg_id = 0
pend = {}
events = []
def reader():
    while True:
        try: raw = ws.recv()
        except Exception: break
        m = json.loads(raw)
        if "id" in m: pend[m["id"]] = m
        else: events.append(m)
threading.Thread(target=reader, daemon=True).start()

def send(method, params=None, timeout=20):
    global msg_id
    msg_id += 1; mid = msg_id
    ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
    deadline = time.time() + timeout
    while time.time() < deadline:
        if mid in pend: return pend.pop(mid)
        time.sleep(0.05)
    raise TimeoutError("no resp " + method)

def ev(expr, timeout=20):
    r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True}, timeout)
    if "error" in r: raise Exception(str(r["error"]))
    res = r.get("result", {})
    if res.get("exceptionDetails"):
        raise Exception("JSX? " + str(res["exceptionDetails"].get("exception", {}).get("description")))
    return res.get("result", {}).get("value")

def wait_for(expr, timeout=15):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if ev(expr, 5): return True
        except Exception: pass
        time.sleep(0.3)
    return False

send("Page.enable"); send("Runtime.enable"); send("Network.enable")

# navigate + inject auth
send("Page.navigate", {"url": "http://localhost:8088/"})
time.sleep(1.2)
ev("""(function(){localStorage.setItem('token', %s); localStorage.setItem('user', JSON.stringify(%s)); localStorage.setItem('rules_accepted','true'); location.reload();})()""" % (json.dumps(token), json.dumps(user)))
if not wait_for("document.querySelector('.nav-title')!=null", 20):
    # diagnostics
    print("DIAG root html len:", ev("document.getElementById('root').innerHTML.length"))
    print("DIAG root text:", ev("document.getElementById('root').innerText.slice(0,400)"))
    print("DIAG ls_user set:", ev("localStorage.getItem('user')!=null"))
    print("DIAG ls_token set:", ev("localStorage.getItem('token')!=null"))
    print("DIAG reg user id:", user.get("id"), type(user.get("id")).__name__)
    print("DIAG events:")
    for e in events[:8]:
        print("  ", e.get("method"), json.dumps(e.get("params", {}))[:200])
    bad("APP_RENDER", "root did not render")
    print("\n".join(passed)); print("\n".join(failed)); sys.exit(1)
ok("APP_RENDER", "app rendered with nav")
print("DIAG post-render: ls_user=", ev("localStorage.getItem('user')!=null"),
      " navNick=", ev("document.querySelector('.user-nickname')!=null"),
      " loggedOut=", ev("document.body.innerText.indexOf('去注册')>=0"),
      " js=", ev("document.querySelector('script[src]').src"))
events.clear()  # only count console errors from interactions AFTER login

# ── T10: open ProfilePage via 我的 nav button ────────────
ev("""(function(){var b=[].slice.call(document.querySelectorAll('nav.glass-nav .nav-links button')).find(x=>x.textContent.indexOf('我的')>=0); if(b)b.click();})()""")
time.sleep(0.8)
if not wait_for("document.querySelector('.my-tabs')!=null", 10):
    print("DIAG after nav click: profile-page=", ev("document.querySelector('.profile-page')!=null"),
          " activeNav=", ev("[...document.querySelectorAll('nav.glass-nav .nav-links button')].find(b=>b.className.indexOf('active')>=0)?.textContent"),
          " mainLen=", ev("(document.querySelector('.main-content')||{innerHTML:''}).innerHTML.length"),
          " bodyText=", ev("document.body.innerText.slice(0,120)"))
    bad4xx = [e for e in events if e.get("method")=="Network.responseReceived" and e.get("params",{}).get("response",{}).get("status",0)>=400]
    for e in bad4xx[-6:]:
        p=e["params"]["response"]
        print("  NET4xx:", p.get("status"), p.get("url"))
    bad("T10_PROFILE_TABS", "my-tabs not found"); 
else:
    txt = ev("document.querySelector('.my-tabs').textContent")
    if "我的帖子（1）" in txt and "我的评论（1）" in txt:
        ok("T10_PROFILE_TABS", txt.strip())
    else:
        bad("T10_PROFILE_TABS", "tabs text=" + txt)

# click 我的评论 tab
ev("""(function(){var t=[].slice.call(document.querySelectorAll('.my-tab')).find(x=>x.textContent.indexOf('我的评论')>=0); if(t)t.click();})()""")
time.sleep(0.8)
if wait_for("document.querySelector('.my-comment-card')!=null", 10):
    ctext = ev("document.querySelector('.my-comment-card').textContent")
    if COMMENT_TEXT in ctext:
        ok("T10_MY_COMMENTS", "comment card shows original text")
    else:
        bad("T10_MY_COMMENTS", "card text=" + ctext[:60])
else:
    bad("T10_MY_COMMENTS", "no my-comment-card")
    print("DIAG stuff card:", ev("document.querySelector('.my-stuff-card')?document.querySelector('.my-stuff-card').innerText.slice(0,200):'none'"))

# click the comment card -> opens PostDetail (setSelectedPost)
if ev("document.querySelector('.my-comment-card')!=null"):
    ev("document.querySelector('.my-comment-card').click()")
    time.sleep(1.0)
else:
    bad("T10_OPEN_POST", "cannot click my-comment-card (none)")
if not wait_for("document.querySelector('.post-detail')!=null", 10):
    bad("T10_OPEN_POST", "post detail did not open from my-comment-card")
    p4 = [e for e in events if e.get("method")=="Network.responseReceived" and e.get("params",{}).get("response",{}).get("status",0)>=400 and "posts/" in e["params"]["response"]["url"]]
    for e in p4[-3:]: print("  NET4xx posts:", e["params"]["response"]["status"], e["params"]["response"]["url"])
    print("  DIAG has post-detail:", ev("document.querySelector('.post-detail')!=null"), " selectedPost card:", ev("(document.querySelector('.post-card')||{title:''})&&document.querySelectorAll('.post-card').length"))
else:
    ptitle = ev("document.querySelector('.post-detail h2').textContent")
    if POST_TITLE in ptitle:
        ok("T10_OPEN_POST", "post detail opened with correct title")
    else:
        bad("T10_OPEN_POST", "title=" + ptitle)

# ── T11: edit own comment ────────────────────────────────
if wait_for("document.querySelector('.edit-btn')!=null", 10):
    ev("document.querySelector('.edit-btn').click()")
    time.sleep(0.6)
    if wait_for("document.querySelector('.comment-edit-input')!=null", 8):
        # set new value via native setter + input event
        ev("""(function(){var ta=document.querySelector('.comment-edit-input'); var s=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; s.call(ta, %s); ta.dispatchEvent(new Event('input',{bubbles:true}));})()""" % json.dumps(NEW_COMMENT))
        time.sleep(0.3)
        # click 保存
        ev("""(function(){var b=document.querySelector('.comment-edit-actions button.glass-button.btn-primary'); if(b)b.click();})()""")
        time.sleep(1.0)
        # verify in UI
        ui_text = ev("(document.querySelector('.comment-content')||{}).textContent || ''")
        if NEW_COMMENT in ui_text:
            ok("T11_EDIT_UI", "UI shows edited text")
        else:
            bad("T11_EDIT_UI", "ui text=" + ui_text[:60])
    else:
        bad("T11_EDIT_OPEN", "edit textarea did not appear")
else:
    bad("T11_EDIT_BTN", "no edit-btn on own comment")

# ── verify persistence via backend ───────────────────────
st, mec = http("GET", "/users/me/comments", token=token)
if st == 200:
    found = [c for c in mec if c["id"] == comment_id]
    if found and found[0]["content"] == NEW_COMMENT:
        ok("T11_PERSIST", "backend reflects edited comment")
    else:
        bad("T11_PERSIST", "backend content=" + (found[0]["content"] if found else "missing"))
else:
    bad("T11_PERSIST", "GET me/comments " + str(st))

# ── console error check ──────────────────────────────────
errs = [e for e in events if e.get("method") in ("Runtime.exceptionThrown", "Runtime.consoleAPICalled")
        and (e.get("params", {}).get("type") == "error" or e.get("params", {}).get("level") == "error")]
errs = [e for e in errs if "favicon" not in str(e)]
if errs:
    bad("CONSOLE_ERRORS", str(len(errs)) + " errors")
    for e in errs[:5]:
        p = e.get("params", {})
        msg = p.get("text") or p.get("exceptionDetails", {}).get("exception", {}).get("description") or json.dumps(p)[:200]
        print("  ERR:", msg)
else:
    ok("CONSOLE_CLEAN", "no console errors")

ws.close(); proc.terminate()
print("\n=== PASS ===")
for p in passed: print("  ✓", p)
print("=== FAIL ===")
for f in failed: print("  ✗", f)
print(f"\n{passed.__len__()} passed, {failed.__len__()} failed")
sys.exit(1 if failed else 0)
