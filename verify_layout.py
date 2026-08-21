import websocket, json, threading, time, urllib.request, subprocess, sys, random, string, sqlite3

PORT = 9352
CHROME = r"C:/Users/FXK/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"
BASE = "http://localhost/api"
UD = "/tmp/cdp_layout_%d" % random.randint(1000, 9999)
RAND = ''.join(random.choices(string.digits, k=6))
USERNAME = "layout_" + RAND

def http(m, p, b=None, t=None):
    req = urllib.request.Request(BASE + p, data=(json.dumps(b).encode() if b is not None else None), method=m)
    req.add_header("Content-Type", "application/json")
    if t: req.add_header("Authorization", "Bearer " + t)
    try:
        with urllib.request.urlopen(req, timeout=15) as r: return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read().decode() or "{}")

st, reg = http("POST", "/users/", {"username": USERNAME, "password": "test1234", "nickname": "Xavier Kun Falkner",
    "school_id": "JSKS", "enrollment_year": 2024, "class_number": random.randint(1,99), "student_number": random.randint(1,99)})
token = reg["access_token"]; user = reg["user"]; uid = user["id"]
print("registered uid", uid, "status", st)

proc = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--remote-allow-origins=*",
    f"--remote-debugging-port={PORT}", f"--user-data-dir={UD}", "about:blank"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)

def get_ws():
    for _ in range(40):
        try:
            with urllib.request.urlopen(f"http://localhost:{PORT}/json/list", timeout=2) as r:
                for t in json.loads(r.read()):
                    if t.get("type") == "page" and t.get("webSocketDebuggerUrl"): return t["webSocketDebuggerUrl"]
        except Exception: time.sleep(0.3)
    raise SystemExit("no ws")

ws = websocket.create_connection(get_ws(), suppress_origin=True)
mid = 0; pend = {}; lock = threading.Lock()
def on_msg(msg):
    d = json.loads(msg)
    if "id" in d:
        with lock: pend[d["id"]] = d
threading.Thread(target=lambda: [on_msg(x) for x in iter(lambda: ws.recv(), None)], daemon=True).start()
def send(method, params=None, timeout=25):
    global mid; mid += 1; i = mid
    ws.send(json.dumps({"id": i, "method": method, "params": params or {}}))
    end = time.time() + timeout
    while time.time() < end:
        with lock:
            if i in pend: return pend.pop(i)
        time.sleep(0.05)
    return None

send("Page.enable"); send("Runtime.enable")
send("Page.navigate", {"url": "http://localhost/"}); time.sleep(1.5)
send("Runtime.evaluate", {"expression": """localStorage.setItem('token', %s); localStorage.setItem('user', JSON.stringify(%s)); localStorage.setItem('rules_accepted','true'); location.reload();""" % (json.dumps(token), json.dumps(user))})
time.sleep(2.5)
def ev(expr, timeout=25):
    r = send("Runtime.evaluate", {"expression": expr, "awaitPromise": False, "returnByValue": True}, timeout=timeout)
    if not r: return {"_err": "no-response"}
    if "exceptionDetails" in r: return {"_err": str(r["exceptionDetails"].get("exception", {}).get("description", r["exceptionDetails"]))}
    return r.get("result", {})

# wait for app mount
for _ in range(40):
    r = ev("!!document.querySelector('.glass-nav')")
    if r.get("value"): break
    time.sleep(0.3)
print("mounted:", r)

# click 我的 (by text)
clk = ev("""(function(){const b=[...document.querySelectorAll('.nav-links button')].find(x=>x.textContent.indexOf('我的')>=0); if(!b) return 'no-button'; b.click(); return b.textContent.trim();})()""")
print("clicked:", clk)
time.sleep(1.5)
# wait for profile card
pc = None
for _ in range(40):
    pc = ev("!!document.querySelector('.profile-card')")
    if pc.get("value"): break
    time.sleep(0.3)
print("profile-card:", pc)
if not pc.get("value"):
    print("DOM hint:", ev("document.body.innerText.slice(0,150)"))
else:
    res = ev("""(()=>{
      const card=document.querySelector('.profile-card');
      const info=document.querySelector('.profile-info');
      const name=document.querySelector('.profile-info h3');
      const cs=getComputedStyle(card);
      const mine=[...document.querySelectorAll('.glass-nav .nav-links button')].find(b=>b.textContent.indexOf('我的')>=0);
      const nb=mine?mine.nextElementSibling:null;
      return JSON.stringify({
        flexDirection: cs.flexDirection,
        cardWidth: Math.round(card.getBoundingClientRect().width),
        infoWidth: Math.round(info.getBoundingClientRect().width),
        nameText: name?name.textContent:null,
        nameLines: name?name.getClientRects().length:0,
        bellAdjacentToMine: nb?nb.className.indexOf('nav-bell')>=0:false,
        hasColorInput: !!document.querySelector('.bg-custom input[type=color]'),
        hasUpload: !!document.querySelector('.bg-upload input[type=file]')
      });
    })()""")
    print("LAYOUT:", res.get("value"))

ws.close(); proc.terminate()
c = sqlite3.connect("backend/cervus.db"); c.execute("PRAGMA foreign_keys=OFF")
for tbl, col in [("posts","user_id"),("comments","user_id"),("notifications","recipient_id"),("notifications","actor_id"),("user_likes","user_id"),("user_stars","user_id"),("messages","user_id")]:
    c.execute("DELETE FROM %s WHERE %s=?" % (tbl, col), (uid,))
c.execute("DELETE FROM users WHERE id=?", (uid,)); c.commit(); c.close()
print("cleaned", uid)
