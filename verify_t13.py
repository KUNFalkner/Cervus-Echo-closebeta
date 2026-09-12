import websocket, json, threading, time, urllib.request, subprocess, sys, random, string

PORT = 9343
CHROME = r"C:/Users/FXK/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"
BASE = "http://localhost:8000/api"
UD = "/tmp/cdp_t13_%d" % random.randint(1000, 9999)
RAND = ''.join(random.choices(string.digits, k=6))
USERNAME = "t13_" + RAND
POST_TITLE = "T13验证帖_" + RAND
POST_CONTENT = "T13 发帖成功反馈验证正文 " + RAND

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
send("Page.navigate",{"url":"http://localhost:8088/"}); time.sleep(1.2)
ev("""(function(){localStorage.setItem('token', %s); localStorage.setItem('user', JSON.stringify(%s)); localStorage.setItem('rules_accepted','true'); location.reload();})()"""%(json.dumps(token),json.dumps(user)))
if not wait_for("document.querySelector('.create-post-card')!=null",20): bad("APP_RENDER"); sys.exit(1)
ok("APP_RENDER")
events.clear()

# fill title + content
ev("""(function(){var inp=document.querySelector('.create-post-form input.glass-input'); var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(inp,%s); inp.dispatchEvent(new Event('input',{bubbles:true}));})()"""%json.dumps(POST_TITLE))
ev("""(function(){var ta=document.querySelector('.create-post-form textarea.glass-textarea'); var s=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; s.call(ta,%s); ta.dispatchEvent(new Event('input',{bubbles:true}));})()"""%json.dumps(POST_CONTENT))
time.sleep(0.2)
titleOK=ev("""(function(){var i=document.querySelector('.create-post-form input.glass-input');return i&&i.value.indexOf(%s)>=0;})()"""%json.dumps(POST_TITLE))
if titleOK: ok("FORM_FILLED")
else: bad("FORM_FILLED")

# install observer to capture .fx-float-plus text right after submit
ev("""(function(){
  window.__floatTexts=[];
  window.__burstSeen=0;
  var ol=new MutationObserver(function(muts){
    muts.forEach(function(m){m.addedNodes.forEach(function(n){
      if(n.nodeType===1){
        if(n.className==='fx-float-plus' && n.textContent) window.__floatTexts.push(n.textContent);
        if(n.className==='fx-burst') window.__burstSeen++;
      }
    });});
  });
  ol.observe(document.body,{childList:true,subtree:false});
  window.__ol=ol;
})()""")

# submit
ev("document.querySelector('.create-post-card .submit-btn').click()")

floatSeen=None; burstSeen=False; toastSeen=False; polled=0
for _ in range(40):  # ~3s, float lives 0.8s
    r=ev("""(function(){var arr=window.__floatTexts||[];return arr.length?arr[arr.length-1]:'';})()""")
    if r and "发布成功" in r: floatSeen=r
    b=ev("window.__burstSeen||0")
    if b and int(b)>0: burstSeen=True
    if ev("document.body.innerText.indexOf('发布成功')>=0"): toastSeen=True
    polled+=1
    if floatSeen and toastSeen: break
    time.sleep(0.08)

if floatSeen and "发布成功" in floatSeen:
    ok("T13_FLOAT_TEXT","float text = %r"%floatSeen)
else:
    bad("T13_FLOAT_TEXT","floatSeen=%r polled=%d"%(floatSeen,polled))
if burstSeen:
    ok("T13_BURST","🎉 burst spans appeared")
else:
    bad("T13_BURST","no burst spans")

# persistence
time.sleep(1.0)
st,mp=http("GET","/posts/?user_id=%s&limit=60"%user["id"],t=token)
found=[p for p in mp if p.get("title")==POST_TITLE]
if found:
    ok("T13_PERSIST","post saved (id=%s)"%found[0].get("id"))
else:
    bad("T13_PERSIST","post not found in backend; got=%r"%mp)

# toast shown (captured during submit window above)
if toastSeen:
    ok("T13_TOAST")
else:
    bad("T13_TOAST","toast text not found during submit window")

# console clean
errs=[e for e in events if e.get("method") in ("Runtime.exceptionThrown","Runtime.consoleAPICalled") and (e.get("params",{}).get("type")=="error" or e.get("params",{}).get("level")=="error") and "favicon" not in str(e)]
if errs:
    bad("CONSOLE_ERRORS",str(len(errs))+" errors")
    for e in errs[:3]: print("  ERR:",json.dumps(e)[:200])
else: ok("CONSOLE_CLEAN")

ws.close(); proc.terminate()
print("\n%d passed, %d failed"%(len(passed),len(failed)))
sys.exit(1 if failed else 0)
