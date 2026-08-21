import websocket, json, threading, time, urllib.request, subprocess, random, string, sqlite3

PORT = 9354
CHROME = r"C:/Users/FXK/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"
BASE = "http://localhost/api"
UD = "/tmp/cdp_flex2_%d" % random.randint(1000, 9999)
RAND = ''.join(random.choices(string.digits, k=6))
USERNAME = "flex2_" + RAND

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

proc = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--remote-allow-origins=*",
    f"--remote-debugging-port={PORT}", f"--user-data-dir={UD}", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)

def get_ws():
    for _ in range(40):
        try:
            with urllib.request.urlopen(f"http://localhost:{PORT}/json/list", timeout=2) as r:
                for t in json.loads(r.read()):
                    if t.get("type") == "page" and t.get("webSocketDebuggerUrl"): return t["webSocketDebuggerUrl"]
        except Exception: time.sleep(0.3)
ws = websocket.create_connection(get_ws(), suppress_origin=True)
mid = 0; pend = {}
def recv():
    while True:
        try:
            d = json.loads(ws.recv())
            if isinstance(d, dict) and "id" in d: pend[d["id"]] = d
        except Exception:
            continue   # 容忍非 JSON 帧，不退出
send_ok = [True]
def send(method, params=None, timeout=25):
    global mid; mid += 1; i = mid
    ws.send(json.dumps({"id": i, "method": method, "params": params or {}}))
    end = time.time() + timeout
    while time.time() < end:
        if i in pend: return pend.pop(i)
        time.sleep(0.05)
    return None

send("Page.enable"); send("Runtime.enable")
send("Page.navigate", {"url": "http://localhost/"}); time.sleep(1.5)
send("Runtime.evaluate", {"expression": """localStorage.setItem('token', %s); localStorage.setItem('user', JSON.stringify(%s)); localStorage.setItem('rules_accepted','true'); location.reload();""" % (json.dumps(token), json.dumps(user))})
time.sleep(2.5)
for _ in range(40):
    if send("Runtime.evaluate", {"expression": "!!document.querySelector('.glass-nav')", "returnByValue": True}):
        if send("Runtime.evaluate", {"expression": "!!document.querySelector('.glass-nav')", "returnByValue": True}).get("result",{}).get("value"): break
    time.sleep(0.3)
send("Runtime.evaluate", {"expression": """[...document.querySelectorAll('.nav-links button')].find(x=>x.textContent.indexOf('我的')>=0).click()""", "returnByValue": True})
time.sleep(1.5)
for _ in range(40):
    if send("Runtime.evaluate", {"expression": "!!document.querySelector('.profile-card')", "returnByValue": True}).get("result",{}).get("value"): break
    time.sleep(0.3)
expr = """(function(){try{var c=document.querySelector('.profile-card');var n=document.querySelector('.profile-info h3');var cs=getComputedStyle(c);var av=document.querySelector('.avatar-upload');return JSON.stringify({flex:cs.flexDirection,cardW:Math.round(c.getBoundingClientRect().width),avW:Math.round(av.getBoundingClientRect().width),infoW:Math.round(document.querySelector('.profile-info').getBoundingClientRect().width),nameLines:n?n.getClientRects().length:0});}catch(e){return 'ERR:'+e.message;}})()"""
r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True})
val = r.get("result",{}).get("value") if r else None
print("FLEX:", val)
ws.close(); proc.terminate()
c = sqlite3.connect("backend/cervus.db"); c.execute("PRAGMA foreign_keys=OFF")
for tbl, col in [("posts","user_id"),("comments","user_id"),("notifications","recipient_id"),("notifications","actor_id"),("user_likes","user_id"),("user_stars","user_id"),("messages","user_id")]:
    c.execute("DELETE FROM %s WHERE %s=?" % (tbl, col), (uid,))
c.execute("DELETE FROM users WHERE id=?", (uid,)); c.commit(); c.close()
print("cleaned", uid)
