import websocket, json, threading, time, urllib.request, subprocess, sys, random, string, sqlite3

PORT = 9347
CHROME = r"C:/Users/FXK/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"
BASE = "http://localhost:8000/api"
UD = "/tmp/cdp_t15_%d" % random.randint(1000, 9999)
RAND = ''.join(random.choices(string.digits, k=6))
USERNAME = "t15_" + RAND

passed=[]; failed=[]
def ok(n,e=""): print("  ok:",n+(" :: "+e if e else "")); passed.append(n)
def bad(n,e=""): print("  BAD:",n+(" :: "+e if e else "")); failed.append(n)

def http(m,p,b=None,t=None):
    req=urllib.request.Request(BASE+p,data=(json.dumps(b).encode() if b is not None else None),method=m)
    req.add_header("Content-Type","application/json")
    if t: req.add_header("Authorization","Bearer "+t)
    try:
        with urllib.request.urlopen(req,timeout=15) as r: return r.status,json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e: return e.code,json.loads(e.read().decode() or "{}")

st,reg=http("POST","/users/",{"username":USERNAME,"password":"test1234","nickname":"验证同学",
    "school_id":"JSKS","enrollment_year":2024,"class_number":random.randint(1, 20),"student_number":random.randint(1, 55)})
if st!=200: print("REG FAIL",st,reg); sys.exit(1)
token=reg["access_token"]; user=reg["user"]; uid=user["id"]
print("registered",USERNAME,"uid",uid)

proc=subprocess.Popen([CHROME,"--headless=new","--disable-gpu","--no-sandbox","--remote-allow-origins=*",
    f"--remote-debugging-port={PORT}",f"--user-data-dir={UD}","about:blank"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1.5)
def get_ws():
    for _ in range(40):
        try:
            with urllib.request.urlopen(f"http://localhost:{PORT}/json/list",timeout=2) as r:
                for t in json.loads(r.read()):
                    if t.get("type")=="page" and t.get("webSocketDebuggerUrl"): return t["webSocketDebuggerUrl"]
        except Exception: time.sleep(0.3)
    raise SystemExit("no ws")
ws=websocket.create_connection(get_ws(),suppress_origin=True)
mid=0; pend={}; events=[]
def reader():
    while True:
        try: raw=ws.recv()
        except Exception: break
        m=json.loads(raw)
        if "id" in m: pend[m["id"]]=m
        else: events.append(m)
threading.Thread(target=reader,daemon=True).start()
def send(method,params=None,timeout=20):
    global mid; mid+=1; i=mid
    ws.send(json.dumps({"id":i,"method":method,"params":params or {}}))
    d=time.time()+timeout
    while time.time()<d:
        if i in pend: return pend.pop(i)
        time.sleep(0.05)
    raise TimeoutError(method)
def ev(expr,timeout=20):
    r=send("Runtime.evaluate",{"expression":expr,"returnByValue":True,"awaitPromise":True},timeout)
    if "error" in r: raise Exception(str(r["error"]))
    res=r.get("result",{})
    if res.get("exceptionDetails"): raise Exception(str(res.get("exceptionDetails",{}).get("exception",{}).get("description")))
    return res.get("result",{}).get("value")
def wait_for(expr,timeout=15):
    d=time.time()+timeout
    while time.time()<d:
        try:
            if ev(expr,5): return True
        except Exception: pass
        time.sleep(0.3)
    return False
send("Page.enable"); send("Runtime.enable"); send("Network.enable")
send("Page.navigate",{"url":"http://localhost:8088/"}); time.sleep(1.2)
ev("""(function(){localStorage.setItem('token', %s); localStorage.setItem('user', JSON.stringify(%s)); localStorage.setItem('rules_accepted','true'); location.reload();})()"""%(json.dumps(token),json.dumps(user)))
if not wait_for("document.querySelector('.glass-nav')!=null",20): bad("APP_RENDER"); sys.exit(1)
ok("APP_RENDER")

# go to profile
ev("""[...document.querySelectorAll('.glass-nav .nav-links button')].find(b=>b.textContent.indexOf('我的')>=0).click()""")
if not wait_for("document.querySelector('.profile-bg-row')!=null",15): bad("PROFILE_OPEN"); sys.exit(1)
ok("PROFILE_OPEN")

# B: settings sits directly under intro (profile-card -> settings-card -> my-stuff-card)
order=ev("""(function(){var pg=document.querySelector('.profile-page');var ch=[].slice.call(pg.children);var i=ch.findIndex(c=>c.classList.contains('profile-card'));var s=ch.findIndex(c=>c.classList.contains('settings-card'));var m=ch.findIndex(c=>c.classList.contains('my-stuff-card'));return {i,s,m};})()""")
if order["i"]==0 and order["s"]==order["i"]+1 and order["s"]<order["m"]:
    ok("T15_SETTINGS_UNDER_INTRO","order profile=%d settings=%d stuff=%d"%(order["i"],order["s"],order["m"]))
else:
    bad("T15_SETTINGS_UNDER_INTRO","order=%s"%order)

# D: pick a background and confirm it applies + persists
ev("""[...document.querySelectorAll('.bg-swatch')].find(b=>b.title==='极光').click()""")
time.sleep(0.6)
bg_now=ev("document.querySelector('.profile-card').style.background")
st,me=http("GET","/users/me",t=token)
if "gradient" in (bg_now or "") and me.get("profile_bg")=="aurora":
    ok("T15_BG_APPLIED","inline=%r server=%r"%(bg_now,me.get("profile_bg")))
else:
    bad("T15_BG_APPLIED","inline=%r server=%r"%(bg_now,me.get("profile_bg")))

# persistence across reload (app returns to home, so re-open profile)
ev("location.reload()")
if not wait_for("document.querySelector('.glass-nav')!=null",20): bad("T15_RELOAD")
else:
    ev("""[...document.querySelectorAll('.glass-nav .nav-links button')].find(b=>b.textContent.indexOf('我的')>=0).click()""")
    if wait_for("document.querySelector('.profile-bg-picker')!=null",15):
        time.sleep(0.5)
        bg_after=ev("document.querySelector('.profile-card').style.background")
        if "gradient" in (bg_after or ""):
            ok("T15_BG_PERSIST","after reload inline=%r"%bg_after)
        else:
            bad("T15_BG_PERSIST","after reload inline=%r"%bg_after)
    else:
        bad("T15_RELOAD","profile did not reopen after reload")

# C: nav-msg is immediately next to nav-theme
adj=ev("""(function(){var t=document.querySelector('.nav-theme');return !!t&&!!t.nextElementSibling&&t.nextElementSibling.classList.contains('nav-msg');})()""")
if adj: ok("T15_MSG_NEXT_TO_THEME")
else: bad("T15_MSG_NEXT_TO_THEME","nav-msg not adjacent to nav-theme")

# console clean
errs=[e for e in events if e.get("method") in ("Runtime.exceptionThrown","Runtime.consoleAPICalled") and (e.get("params",{}).get("type")=="error" or e.get("params",{}).get("level")=="error") and "favicon" not in str(e)]
if errs:
    bad("CONSOLE_ERRORS",str(len(errs))+" errors")
    for e in errs[:3]: print("  ERR:",json.dumps(e)[:200])
else: ok("CONSOLE_CLEAN")

# cleanup test user
try:
    c=sqlite3.connect("backend/cervus.db"); c.execute("PRAGMA foreign_keys=OFF")
    for tbl,col in [("posts","user_id"),("comments","user_id"),("notifications","recipient_id"),("notifications","actor_id"),("user_likes","user_id"),("user_stars","user_id"),("messages","user_id")]:
        c.execute("DELETE FROM %s WHERE %s=?"%(tbl,col),(uid,))
    c.execute("DELETE FROM users WHERE id=?",(uid,)); c.commit(); c.close()
    print("cleaned test user",uid)
except Exception as e: print("cleanup err",e)

ws.close(); proc.terminate()
print("\n%d passed, %d failed"%(len(passed),len(failed)))
sys.exit(1 if failed else 0)
