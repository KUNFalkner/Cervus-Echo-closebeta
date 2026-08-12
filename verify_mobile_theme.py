import websocket, json, threading, time, urllib.request, subprocess, sys, random, string, sqlite3

PORT = 9355
CHROME = r"C:/Users/FXK/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"
BASE = "http://localhost/api"
UD = "/tmp/cdp_mtheme_%d" % random.randint(1000, 9999)
RAND = ''.join(random.choices(string.digits, k=6))
USERNAME = "mtheme_" + RAND

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

st,reg=http("POST","/users/",{"username":USERNAME,"password":"test1234","nickname":"MTester",
    "school_id":"JSKS","enrollment_year":2024,"class_number":random.randint(1,99),"student_number":random.randint(1,99)})
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
        if isinstance(m,dict):
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
# 模拟移动端视口 375x812
send("Emulation.setDeviceMetricsOverride", {"width":375,"height":812,"deviceScaleFactor":2,"mobile":True,"touch":True})
send("Page.navigate",{"url":"http://localhost/"}); time.sleep(1.2)
ev("""(function(){localStorage.setItem('token', %s); localStorage.setItem('user', JSON.stringify(%s)); localStorage.setItem('rules_accepted','true'); localStorage.setItem('treehole_theme','dark'); location.reload();})()"""%(json.dumps(token),json.dumps(user)))

# 等待移动端导航渲染
if not wait_for("document.querySelector('.mobile-nav')!=null",20):
    bad("MOBILE_NAV_RENDER")
    # dump diagnostic
    diag=ev("""(function(){return JSON.stringify({hasMobileNav:!!document.querySelector('.mobile-nav'),hasGlassNav:!!document.querySelector('.glass-nav'),bodyTime:document.body.dataset.time,winW:window.innerWidth});})()""",10)
    print("  DIAG:",diag)
    sys.exit(1)
ok("MOBILE_NAV_RENDER")

def theme_state():
    return ev("""(function(){var m=document.querySelector('.mobile-nav');var items=[].slice.call(m.querySelectorAll('.mobile-nav-item'));var btn=items[items.length-1];return JSON.stringify({text:btn.textContent.trim(), bodyTime:document.body.dataset.time});})()""",10)

# 当前 dark -> 按钮应显示「夜间」
s=theme_state()
print("MOBILE_THEME:",s)
try:
    o=json.loads(s)
    if o.get("text")=="夜间" and o.get("bodyTime")=="night": ok("DARK_SHOWS_NIGHT","btn=%s body=%s"%(o["text"],o["bodyTime"]))
    else: bad("DARK_SHOWS_NIGHT","btn=%s body=%s"%(o.get("text"),o.get("bodyTime")))
except Exception as e: bad("DARK_PARSE",str(e))

# 完整三态循环校验：起点为 dark
# 循环顺序：auto -> light -> dark -> auto
# 从 dark 点击一次应进入 auto（按钮显示「自动」），再点进入 light（「白天」），再点回到 dark（「夜间」）
cycle=[]
for step in range(3):
    ev("""(function(){var m=document.querySelector('.mobile-nav');var items=[].slice.call(m.querySelectorAll('.mobile-nav-item'));items[items.length-1].click();})()""")
    time.sleep(0.8)
    cycle.append(theme_state())
print("CYCLE:",cycle)
# 期望顺序：auto(自动), light(白天), dark(夜间)
expect=[("自动",None),("白天","day"),("夜间","night")]
allok=True
for i,(s,exp) in enumerate(zip(cycle,expect)):
    try:
        o=json.loads(s)
        txt=o.get("text"); bt=o.get("bodyTime")
        if txt==exp[0] and (exp[1] is None or bt==exp[1]): ok("CYCLE_STEP_%d"%(i+1),"btn=%s body=%s"%(txt,bt))
        else: bad("CYCLE_STEP_%d"%(i+1),"btn=%s body=%s (expected %s/%s)"%(txt,bt,exp[0],exp[1])); allok=False
    except Exception as e: bad("CYCLE_PARSE_%d"%i,str(e)); allok=False
if allok: ok("THREE_STATE_CYCLE")

# 控制台错误检查
errs=[e for e in events if e.get("method") in ("Runtime.exceptionThrown","Runtime.consoleAPICalled") and (e.get("params",{}).get("type")=="error" or e.get("params",{}).get("level")=="error") and "favicon" not in str(e)]
if errs: bad("CONSOLE_ERRORS",str(len(errs))+" errors")
else: ok("CONSOLE_CLEAN")

try:
    c=sqlite3.connect("backend/treehole.db"); c.execute("PRAGMA foreign_keys=OFF")
    for tbl,col in [("posts","user_id"),("comments","user_id"),("notifications","recipient_id"),("notifications","actor_id"),("user_likes","user_id"),("user_stars","user_id"),("messages","user_id")]:
        c.execute("DELETE FROM %s WHERE %s=?"%(tbl,col),(uid,))
    c.execute("DELETE FROM users WHERE id=?",(uid,)); c.commit(); c.close()
    print("cleaned test user",uid)
except Exception as e: print("cleanup err",e)

ws.close(); proc.terminate()
print("\n%d passed, %d failed"%(len(passed),len(failed)))
sys.exit(1 if failed else 0)
