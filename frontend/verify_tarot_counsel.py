import json, os, subprocess, time, random, string, threading, base64
import websocket
import urllib.request

CHROME = r"C:/Users/FXK/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"
PORT = 9400 + random.randint(0, 50)
URL = "http://localhost/"
OUT = r"E:/mimo code 树洞设计/frontend/tarot_shots"
os.makedirs(OUT, exist_ok=True)

class CDP:
    def __init__(self, wsurl):
        self.ws = websocket.create_connection(wsurl, timeout=30)
        self._id = 0; self._lock = threading.Lock()
        self._pending = {}; self._events = []; self._stop = False
        threading.Thread(target=self._read, daemon=True).start()
    def _read(self):
        while not self._stop:
            try: raw = self.ws.recv()
            except Exception: break
            try: m = json.loads(raw)
            except Exception: continue
            if "id" in m and m["id"] in self._pending:
                with self._lock: ev = self._pending.pop(m["id"])
                ev["msg"] = m; ev["ready"].set()
            else:
                with self._lock: self._events.append(m)
    def send(self, method, params=None, timeout=20):
        with self._lock:
            self._id += 1; rid = self._id
            ev = {"ready": threading.Event(), "msg": None}
            self._pending[rid] = ev
        self.ws.send(json.dumps({"id": rid, "method": method, "params": params or {}}))
        if ev["ready"].wait(timeout): return ev["msg"]
        with self._lock: self._pending.pop(rid, None)
        return None
    def close(self):
        self._stop = True
        try: self.ws.close()
        except: pass

def ev(c, expr, ret=True, timeout=20):
    p = {"expression": expr}
    if ret: p["returnByValue"] = True
    return c.send("Runtime.evaluate", p, timeout=timeout)

def wait_for(c, expr, timeout=12):
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = ev(c, expr)
        v = r.get('result',{}).get('result',{}).get('value') if r else None
        if v: return v
        time.sleep(0.4)
    return None

def main():
    ud = f"/tmp/cdp_c2_{''.join(random.choices(string.ascii_lowercase, k=6))}"
    launch = (f'"{CHROME}" --headless=new --disable-gpu --no-sandbox '
              f'--remote-allow-origins=* --remote-debugging-port={PORT} '
              f'--user-data-dir={ud}')
    proc = subprocess.Popen(launch, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(2.5)
        raw = urllib.request.urlopen(f"http://localhost:{PORT}/json/list", timeout=5).read().decode()
        pages = json.loads(raw)
        wsurl = next((p["webSocketDebuggerUrl"] for p in pages if p.get("type") == "page"), pages[0]["webSocketDebuggerUrl"])
        c = CDP(wsurl)
        c.send("Page.enable"); c.send("Runtime.enable"); c.send("Network.enable"); c.send("Input.enable")
        c.send("Emulation.setDeviceMetricsOverride", {"width":1000,"height":1100,"deviceScaleFactor":1,"mobile":False})

        # Navigate to the app first (critical: localStorage is per-origin)
        c.send("Page.navigate", {"url": URL}); time.sleep(2.5)

        ev(c, """
            localStorage.setItem('token','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidWlkIjoiQUFBMDAwMDAwMDAiLCJleHAiOjE3ODkxMTAwNzR9.0oTJfYQB1t0vFAP8gpkPrs0rZF0fS6XAQnC8nyYvT-g');
            localStorage.setItem('user', JSON.stringify({"id":1,"uid":"AAA00000000","username":"founder","nickname":"Xavier Kun Falkner","school_id":"JSKS","isAdmin":true}));
            location.reload();
        """, ret=False)
        print("user loaded:", wait_for(c, "!!JSON.parse(localStorage.getItem('user')||'{}').id"))
        print("orb present:", wait_for(c, "!!document.querySelector('.tarot-orb')"))
        ev(c, "document.querySelector('.tarot-orb')?.click();", ret=False)
        print("start present after orb click:", wait_for(c, "!!document.querySelector('.tarot-start')"))
        ev(c, "document.querySelector('.tarot-start')?.click();", ret=False)
        print("cards drawn:", wait_for(c, "!!document.querySelector('.tarot-card')", timeout=8))
        for i in range(3):
            ev(c, f"document.querySelectorAll('.tarot-card')[{i}]?.click();", ret=False); time.sleep(0.6)
        time.sleep(0.5)
        ev(c, """
            const q=document.querySelector('.tarot-question');
            if(q){ const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; setter.call(q,'我会顺利吗'); q.dispatchEvent(new Event('input',{bubbles:true})); }
        """, ret=False)
        time.sleep(0.4)
        print("ask button present:", wait_for(c, "!!document.querySelector('.tarot-ask')"))
        ev(c, "document.querySelector('.tarot-ask')?.click();", ret=False)
        res = wait_for(c, "(()=>{const el=document.querySelector('.tarot-counsel'); if(!el) return null; const t=el.querySelector('.tarot-counsel-text'); return {src:el.className, len:(t?t.textContent:'').length};})()", timeout=8)
        print("counsel result:", res)
        r = c.send("Page.captureScreenshot", {"format":"png","captureBeyondViewport":False})
        if r and "result" in r:
            open(f"{OUT}/tarot_counsel.png","wb").write(base64.b64decode(r["result"]["data"])); print("saved tarot_counsel.png")
        with c._lock:
            errs = [e for e in c._events if e.get("method") in ("Runtime.exceptionThrown","Runtime.consoleAPICalled")]
        print("=== console/exception events:", len(errs))
        for e in errs[:20]:
            if e["method"]=="Runtime.exceptionThrown":
                d=e["params"]["exceptionDetails"]; print("EXC:", d.get("text"), str(d.get("exception",{}).get("description",""))[:200])
            else:
                print("CONSOLE:", e["params"].get("type"), " ".join(str(a.get("value","")) for a in e["params"].get("args",[]))[:200])
        c.close()
    finally:
        proc.terminate(); print("done")

if __name__ == "__main__":
    main()
