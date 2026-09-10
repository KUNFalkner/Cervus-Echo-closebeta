import websocket, json, threading, time, urllib.request, subprocess, sys, random, string

PORT = 9341
CHROME = r"C:/Users/FXK/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"
BASE = "http://localhost:8000/api"
UD = "/tmp/cdp_t12_%d" % random.randint(1000, 9999)
RAND = ''.join(random.choices(string.digits, k=6))
USERNAME = "t12_" + RAND
POST_TITLE = "T12验证帖_" + RAND
CMT_TEXT = "乐观评论_" + RAND

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
    "school_id":"JSKS","enrollment_year":2024,"class_number":random.randint(1, 55),"student_number":random.randint(1000, 9999)})
if st!=200: print("REG FAIL",st,reg); sys.exit(1)
token=reg["access_token"]; user=reg["user"]
st,post=http("POST","/posts/",{"title":POST_TITLE,"content":"T12 验证正文。"},token)
post_id=post["id"]
print("registered",USERNAME,"post",post_id)

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
if not wait_for("document.querySelector('.nav-title')!=null",20): bad("APP_RENDER"); sys.exit(1)
ok("APP_RENDER")
events.clear()

# open the post via home feed (find card by title)
ev("""(function(){var cards=[].slice.call(document.querySelectorAll('.post-card'));var c=cards.find(x=>x.querySelector('.post-title')&&x.querySelector('.post-title').textContent.indexOf(%s)>=0); if(c)c.click();})()"""%json.dumps(POST_TITLE))
if not wait_for("document.querySelector('.post-detail')!=null",10):
    print("DIAG cards:",ev("document.querySelectorAll('.post-card').length"),
          " hasTitle:",ev("""[].slice.call(document.querySelectorAll('.post-title')).some(t=>t.textContent.indexOf(%s)>=0)"""%json.dumps(POST_TITLE)),
          " rootText:",ev("document.querySelector('.main-content').innerText.slice(0,60)"))
    for e in events[-4:]:
        p=e.get("params",{})
        print("  ERR:",p.get("text") or p.get("exceptionDetails",{}).get("exception",{}).get("description"))
    bad("OPEN_POST"); sys.exit(1)
ok("OPEN_POST")
ev("document.querySelector('.comment-input').focus()")
time.sleep(0.2)
ev("""(function(){var ta=document.querySelector('.comment-input'); var s=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; s.call(ta,%s); ta.dispatchEvent(new Event('input',{bubbles:true}));})()"""%json.dumps(CMT_TEXT))
time.sleep(0.2)
before=ev("document.querySelectorAll('.comment-card').length")
# throttle network so the optimistic node stays mounted long enough to observe
send("Network.emulateNetworkConditions",{"offline":False,"latency":900,"downloadThroughput":-1,"uploadThroughput":-1})
# install observer to catch transient comment-enter / comment-pending classes
ev("""(function(){window.__enterSeen=false;window.__pendingSeen=false;var ol=new MutationObserver(function(muts){muts.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType===1&&n.className){var cl=''+n.className;if(cl.indexOf('comment-enter')>=0)window.__enterSeen=true;if(cl.indexOf('comment-pending')>=0)window.__pendingSeen=true;}});});});ol.observe(document.querySelector('.comments-list')||document.body,{childList:true,subtree:true});window.__ol=ol;})()""")
# submit
ev("document.querySelector('.comment-form button[type=submit]').click()")
# with 900ms latency the optimistic node stays mounted; poll for pending/enter classes
enterSeen=False; pendingSeen=False; polled=0
for _ in range(20):
    r=ev("""(function(){var c=document.querySelector('.comment-card.comment-pending')||document.querySelector('.comment-card.comment-enter');return c?(''+c.className):'';})()""")
    if "comment-enter" in (r or ""): enterSeen=True
    if "comment-pending" in (r or ""): pendingSeen=True
    polled+=1
    if enterSeen and pendingSeen: break
    time.sleep(0.08)
after=ev("document.querySelectorAll('.comment-card').length")
hasText=ev("""[].slice.call(document.querySelectorAll('.comment-card')).some(c=>c.textContent.indexOf(%s)>=0)"""%json.dumps(CMT_TEXT))
send("Network.emulateNetworkConditions",{"offline":False,"latency":0,"downloadThroughput":-1,"uploadThroughput":-1})
if after>=before+1 and hasText and (enterSeen or pendingSeen):
    ok("T12_OPTIMISTIC","instant insert(count %d->%d) + enterSeen=%s pendingSeen=%s"%(before,after,enterSeen,pendingSeen))
else:
    bad("T12_OPTIMISTIC","before=%d after=%d hasText=%s enter=%s pending=%s polled=%d"%(before,after,hasText,enterSeen,pendingSeen,polled))
# persistence
time.sleep(1.2)
st,mc=http("GET","/users/me/comments",t=token)
found=[c for c in mc if c.get("content")==CMT_TEXT]
if found:
    ok("T12_PERSIST","comment saved to backend")
else:
    bad("T12_PERSIST","not found in backend")
# UI no longer pending
ui_pending=ev("document.querySelectorAll('.comment-pending').length")
if ui_pending==0:
    ok("T12_CONFIRMED","no pending card after server confirms")
else:
    bad("T12_CONFIRMED","still pending="+str(ui_pending))
# console clean
errs=[e for e in events if e.get("method") in ("Runtime.exceptionThrown","Runtime.consoleAPICalled") and (e.get("params",{}).get("type")=="error" or e.get("params",{}).get("level")=="error") and "favicon" not in str(e)]
if errs: bad("CONSOLE_ERRORS",str(len(errs))+" errors"); 
for e in errs[:3]: print("  ERR:",json.dumps(e)[:200])
else: ok("CONSOLE_CLEAN")
ws.close(); proc.terminate()
print("\n%d passed, %d failed"%(len(passed),len(failed)))
sys.exit(1 if failed else 0)
