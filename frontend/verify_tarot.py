import json, os, subprocess, time, random, string, threading, sys
import websocket
import urllib.request
import base64

CHROME = r"C:/Users/FXK/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe"
PORT = 9400 + random.randint(0, 50)
URL = "http://localhost/"
OUT = r"E:/mimo code 树洞设计/frontend/tarot_shots"
os.makedirs(OUT, exist_ok=True)

class CDP:
    def __init__(self, wsurl):
        self.ws = websocket.create_connection(wsurl, timeout=30)
        self._id = 0
        self._lock = threading.Lock()
        self._pending = {}
        self._events = []
        self._stop = False
        t = threading.Thread(target=self._read, daemon=True)
        t.start()

    def _read(self):
        while not self._stop:
            try:
                raw = self.ws.recv()
            except Exception:
                break
            try:
                m = json.loads(raw)
            except Exception:
                continue
            if "id" in m and m["id"] in self._pending:
                with self._lock:
                    ev = self._pending.pop(m["id"])
                ev["msg"] = m
                ev["ready"].set()
            else:
                with self._lock:
                    self._events.append(m)

    def send(self, method, params=None, timeout=20):
        with self._lock:
            self._id += 1
            rid = self._id
            ev = {"ready": threading.Event(), "msg": None}
            self._pending[rid] = ev
        self.ws.send(json.dumps({"id": rid, "method": method, "params": params or {}}))
        if ev["ready"].wait(timeout):
            return ev["msg"]
        with self._lock:
            self._pending.pop(rid, None)
        return None

    def close(self):
        self._stop = True
        try: self.ws.close()
        except: pass

def main():
    ud = f"/tmp/cdp_tarot_{''.join(random.choices(string.ascii_lowercase, k=6))}"
    launch = (f'"{CHROME}" --headless=new --disable-gpu --no-sandbox '
              f'--remote-allow-origins=* --remote-debugging-port={PORT} '
              f'--user-data-dir={ud}')
    proc = subprocess.Popen(launch, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(2.5)
        try:
            raw = urllib.request.urlopen(f"http://localhost:{PORT}/json/list", timeout=5).read().decode()
        except Exception as e:
            print("CDP endpoint unreachable:", e); return
        pages = json.loads(raw)
        wsurl = next((p["webSocketDebuggerUrl"] for p in pages if p.get("type") == "page"), pages[0]["webSocketDebuggerUrl"])
        print("WS:", wsurl)
        c = CDP(wsurl)
        c.send("Page.enable"); c.send("Runtime.enable"); c.send("Network.enable"); c.send("Input.enable")
        c.send("Emulation.setDeviceMetricsOverride", {"width":1000,"height":1000,"deviceScaleFactor":1,"mobile":False})

        def open_tarot(variant):
            c.send("Page.navigate", {"url": URL}); time.sleep(1.5)
            c.send("Runtime.evaluate", {"expression": """
                localStorage.setItem('token','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidWlkIjoiQUFBMDAwMDAwMDAiLCJleHAiOjE3ODkxMTAwNzR9.0oTJfYQB1t0vFAP8gpkPrs0rZF0fS6XAQnC8nyYvT-g');
                localStorage.setItem('user', JSON.stringify({"id":1,"uid":"AAA00000000","username":"founder","nickname":"Xavier Kun Falkner","school_id":"JSKS","isAdmin":true}));
                localStorage.setItem('tarot_variant','%s');
                location.reload();
            """ % variant}); time.sleep(3.5)

            # Verify orb exists and click it
            # Get orb position and use CDP mouse events
            pos = c.send("Runtime.evaluate", {"expression": "(()=>{const el=document.querySelector('.tarot-orb');if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()", "returnByValue": True})
            print(f"orb pos: {pos}")
            if pos and "result" in pos:
                pt = pos["result"]["result"]["value"]
                cx, cy = int(pt["x"]), int(pt["y"])
                c.send("Input.dispatchMouseEvent", {"type":"mousePressed","x":cx,"y":cy,"button":"left","clickCount":1})
                c.send("Input.dispatchMouseEvent", {"type":"mouseReleased","x":cx,"y":cy,"button":"left","clickCount":1})
            else:
                c.send("Runtime.evaluate", {"expression": "document.querySelector('.tarot-orb')?.click()"})
            time.sleep(2.0)

            # Verify overlay is open
            r = c.send("Runtime.evaluate", {"expression": "(document.querySelector('.tarot-overlay')||{}).style.display||'none'"})
            print(f"overlay display: {r and r.get('result',{}).get('result',{}).get('value')}")

            # Scroll overlay to top and ensure visibility
            dbg = c.send("Runtime.evaluate", {"expression": "(()=>{const ov=document.querySelector('.tarot-overlay');const s=document.querySelector('.tarot-overlay-scroll');if(s)s.scrollTop=0;if(ov){ov.style.opacity='1';ov.style.transform='none'}const r=ov?ov.getBoundingClientRect():null;return{display:ov?.style.display,zIndex:getComputedStyle(ov).zIndex,rect:r?{x:r.x,y:r.y,w:r.width,h:r.height}:null,hero:!!document.querySelector('.tarot-hero'),start:!!document.querySelector('.tarot-start')}})()", "returnByValue": True})
            print(f"overlay debug: {dbg}")
            time.sleep(0.5)

            # Click draw button
            c.send("Runtime.evaluate", {"expression": "document.querySelector('.tarot-start')?.click()"}); time.sleep(1.3)

            # Flip first card
            c.send("Runtime.evaluate", {"expression": "document.querySelectorAll('.tarot-card')[0]?.click()"}); time.sleep(0.8)

            # Expand detail
            c.send("Runtime.evaluate", {"expression": "document.querySelectorAll('.tarot-toggle')[0]?.click()"}); time.sleep(0.7)
            c.send("Runtime.evaluate", {"expression": "document.querySelector('.tarot-orb')?.click();"}); time.sleep(1.0)
            c.send("Runtime.evaluate", {"expression": "document.querySelector('.tarot-start')?.click();"}); time.sleep(1.1)
            c.send("Runtime.evaluate", {"expression": "document.querySelectorAll('.tarot-card')[0]?.click();"}); time.sleep(0.7)
            c.send("Runtime.evaluate", {"expression": "document.querySelectorAll('.tarot-toggle')[0]?.click();"}); time.sleep(0.6)

        open_tarot("a")
        r = c.send("Page.captureScreenshot", {"format":"png","captureBeyondViewport":False})
        if r and "result" in r:
            open(f"{OUT}/tarot_A.png","wb").write(base64.b64decode(r["result"]["data"])); print("saved tarot_A.png")
        else:
            print("A shot failed:", r)

        open_tarot("b")
        r = c.send("Page.captureScreenshot", {"format":"png","captureBeyondViewport":False})
        if r and "result" in r:
            open(f"{OUT}/tarot_B.png","wb").write(base64.b64decode(r["result"]["data"])); print("saved tarot_B.png")
        else:
            print("B shot failed:", r)

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
        proc.terminate()
        print("done")

if __name__ == "__main__":
    main()
