import websocket, json, threading, time, urllib.request, subprocess, sys, random, string

PORT = 9345
CHROME = r"C:/Users/FXK/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"
BASE = "http://localhost/api"
UD = "/tmp/cdp_t14_%d" % random.randint(1000, 9999)
RAND = ''.join(random.choices(string.digits, k=6))
USERNAME = "t14_" + RAND

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
    "school_id":"JSKS","enrollment_year":2024,"class_number":random.randint(1,99),"student_number":random.randint(1,99)})
if st!=200: print("REG FAIL",st,reg); sys.exit(1)
token=reg["access_token"]; user=reg["user"]
print("registered",USERNAME)

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
send("Page.navigate",{"url":"http://localhost/"}); time.sleep(1.2)
ev("""(function(){localStorage.setItem('token', %s); localStorage.setItem('user', JSON.stringify(%s)); localStorage.setItem('rules_accepted','true'); location.reload();})()"""%(json.dumps(token),json.dumps(user)))
if not wait_for("document.querySelector('.nav-theme')!=null",20): bad("APP_RENDER"); sys.exit(1)
ok("APP_RENDER")

# clear any prior theme pref so we start from 'auto'
ev("localStorage.removeItem('treehole_theme')")
time.sleep(0.3)

def theme_state():
    return ev("""(function(){return {lt:document.body.dataset.time, pref:localStorage.getItem('treehole_theme')};})()""")
def click_theme():
    ev("document.querySelector('.nav-theme').click()")
    time.sleep(0.4)

s0=theme_state()
ok("T14_THEME_BTN","nav-theme present; initial data-time=%s pref=%s"%(s0["lt"],s0["pref"]))

# toggle 1
click_theme()
s1=theme_state()
if s1["pref"] in ("light","dark") and ((s1["pref"]=="light" and s1["lt"]=="day") or (s1["pref"]=="dark" and s1["lt"]=="night")):
    ok("T14_TOGGLE_1","pref=%s data-time=%s"%(s1["pref"],s1["lt"]))
else:
    bad("T14_TOGGLE_1","pref=%s data-time=%s"%(s1["pref"],s1["lt"]))

# toggle 2 (should flip)
click_theme()
s2=theme_state()
if s2["pref"]!=s1["pref"] and ((s2["pref"]=="light" and s2["lt"]=="day") or (s2["pref"]=="dark" and s2["lt"]=="night")):
    ok("T14_TOGGLE_2","pref=%s data-time=%s (flipped from %s)"%(s2["pref"],s2["lt"],s1["pref"]))
else:
    bad("T14_TOGGLE_2","pref=%s data-time=%s prev=%s"%(s2["pref"],s2["lt"],s1["pref"]))

# persistence across reload
ev("location.reload()")
if not wait_for("document.querySelector('.nav-theme')!=null",20): bad("T14_RELOAD"); 
else:
    time.sleep(0.5)
    s3=theme_state()
    if s3["pref"]==s2["pref"] and ((s3["pref"]=="light" and s3["lt"]=="day") or (s3["pref"]=="dark" and s3["lt"]=="night")):
        ok("T14_PERSIST","after reload pref=%s data-time=%s"%(s3["pref"],s3["lt"]))
    else:
        bad("T14_PERSIST","after reload pref=%s data-time=%s expected pref=%s"%(s3["pref"],s3["lt"],s2["pref"]))

# console clean
errs=[e for e in events if e.get("method") in ("Runtime.exceptionThrown","Runtime.consoleAPICalled") and (e.get("params",{}).get("type")=="error" or e.get("params",{}).get("level")=="error") and "favicon" not in str(e)]
if errs:
    bad("CONSOLE_ERRORS",str(len(errs))+" errors")
    for e in errs[:3]: print("  ERR:",json.dumps(e)[:200])
else: ok("CONSOLE_CLEAN")

ws.close(); proc.terminate()
print("\n%d passed, %d failed"%(len(passed),len(failed)))
sys.exit(1 if failed else 0)
