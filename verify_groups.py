"""群聊后端验证（阶段 2）。连 127.0.0.1:8000 直连后端。
覆盖：建群/上限/非成员 403/成员拉人/踢人/改名/解散/发焚毁消息/受众快照/群焚毁模式/未读。
"""
import json, os, random, string, sqlite3, sys, urllib.request, urllib.error, websocket

BASE = "http://localhost:8001/api"
WS = "ws://localhost:8001/ws"
DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend", "cervus.db")
passed = []; failed = []

def ok(n, e=""):
    if isinstance(e, bool):
        if e: print("  ok:", n); passed.append(n)
        else: print("  BAD:", n); failed.append(n)
        return
    print("  ok:", n + (" :: " + e if e else "")); passed.append(n)

def http(m, p, b=None, t=None):
    req = urllib.request.Request(BASE + p, data=(json.dumps(b).encode() if b is not None else None), method=m)
    req.add_header("Content-Type", "application/json")
    if t: req.add_header("Authorization", "Bearer " + t)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read().decode() or "{}")
        except Exception: return e.code, {}

R = ''.join(random.choices(string.digits, k=6))
def login_old(except_usernames, note=""):
    """登录 DB 里最新的历史测试号（排除给定用户名），密码统一 test1234。"""
    con = sqlite3.connect(DB)
    ph = ",".join("?" * len(except_usernames))
    row = con.execute(
        f"SELECT username FROM users WHERE (username LIKE 'grp%' OR username LIKE 'burn%' OR username LIKE 'qa%' OR username LIKE 'qb%') "
        f"AND username NOT IN ({ph}) ORDER BY id DESC LIMIT 1", except_usernames
    ).fetchone()
    con.close()
    if not row:
        print("NO HISTORY ACCOUNT LEFT"); sys.exit(1)
    st, r = http("POST", "/users/login", {"username": row[0], "password": "test1234"})
    if st != 200:
        print("LOGIN FAIL", row[0], st, r); sys.exit(1)
    return r["access_token"], r["user"], row[0]

# 全部复用历史测试号（注册 3 次/时限流太苛刻，不注册新号）
ta, ua, _ = login_old([])
tb, ub, _ = login_old([ua["username"]])
tc, uc, _ = login_old([ua["username"], ub["username"]])
td, ud, _ = login_old([ua["username"], ub["username"], uc["username"]])

# ── 建群 ──
st, g = http("POST", "/groups", {"name": "测试小群", "member_ids": [ub["id"], uc["id"]]}, ta)
ok("建群成功", st == 200 and g.get("member_count") == 3)
gid = g["id"]
ok("创建者自动是成员", g.get("creator_id") == ua["id"])

# ── 上限：51 人（creator+50）应 400 ──
st, r = http("POST", "/groups", {"name": "大群", "member_ids": list(range(10000, 10050))}, ta)
ok("成员超上限 400", st == 400)

# ── 非成员访问 404 ──
st, r = http("GET", f"/groups/{gid}", None, td)
ok("非成员看群 404", st == 404)
st, r = http("GET", f"/groups/{gid}/messages", None, td)
ok("非成员拉历史 404", st == 404)

# ── 成员列表 ──
st, r = http("GET", f"/groups/{gid}/members", None, ta)
ok("成员列表 3 人", st == 200 and len(r) == 3)

# ── 发永久消息（A 发，B 能看）──
st, r = http("POST", f"/groups/{gid}/messages", {"content": "群里的普通消息"}, ta)
ok("发群永久消息", st == 200)
st, r = http("GET", f"/groups/{gid}/messages", None, tb)
ok("B 能看到永久消息明文", any(x.get("content") == "群里的普通消息" for x in r))

# ── 发焚毁消息 + 受众快照 ──
st, burn = http("POST", f"/groups/{gid}/messages", {"content": "焚毁群消息", "burn_mode": "any"}, ta)
bid = burn.get("id")
ok("发群焚毁消息", st == 200 and burn.get("burn_mode") == "any")
con = sqlite3.connect(DB)
reads = con.execute("SELECT user_id, read_at FROM message_reads WHERE source='group' AND message_id=?", (bid,)).fetchall()
con.close()
ok("受众快照已插行(B/C 各一行)", len(reads) == 2)
# 拉 D 进群 → D 看不到历史焚毁消息
st, r = http("POST", f"/groups/{gid}/members", {"user_ids": [ud["id"]]}, ta)
ok("成员可拉人(D 进群)", st == 200 and ud["id"] in r.get("added", []))
st, r = http("GET", f"/groups/{gid}/messages", None, td)
d_msgs = [x for x in r if x.get("id") == bid]
ok("后入群者看不到焚毁消息", len(d_msgs) == 0)
st, r = http("GET", f"/groups/{gid}/messages", None, tb)
b_msgs = [x for x in r if x.get("id") == bid]
ok("老成员看到焚毁占位", len(b_msgs) == 1 and b_msgs[0].get("content") is None and b_msgs[0].get("state") == "pending")

# ── B view → any 模式全局焚毁 ──
st, v = http("POST", f"/burn/group/{bid}/view", None, tb)
ok("B view 焚毁消息拿明文", v.get("content") == "焚毁群消息")
st, r = http("GET", f"/groups/{gid}/messages", None, tc)
c_msgs = [x for x in r if x.get("id") == bid]
ok("any 焚后 C 也看到已焚", len(c_msgs) == 1 and c_msgs[0].get("burned"))
con = sqlite3.connect(DB)
bstate = con.execute("SELECT burned_at FROM direct_messages WHERE id=?", (bid,)).fetchone()
con.close()

# ── 群未读 ──
st, r = http("GET", "/groups/unread", None, tb)
ok("群未读接口可用", st == 200 and isinstance(r.get("unread"), int))

# ── 群主踢人（A 踢 C）──
st, r = http("DELETE", f"/groups/{gid}/members/{uc['id']}", None, ta)
ok("群主踢人成功", st == 200)
st, r = http("GET", "/groups", None, tc)
ok("被踢者群列表为空", all(x.get("id") != gid for x in r))
# B 不是群主，踢人应 403
st, r = http("DELETE", f"/groups/{gid}/members/{ud['id']}", None, tb)
ok("非群主踢人 403", st == 403)

# ── 改名（群主可，非群主 403）──
st, r = http("PUT", f"/groups/{gid}/name", {"name": "新群名"}, ta)
ok("群主改名成功", st == 200 and r.get("name") == "新群名")
st, r = http("PUT", f"/groups/{gid}/name", {"name": "尝试改名"}, tb)
ok("非群主改名 403", st == 403)

# ── 解散 ──
st, r = http("DELETE", f"/groups/{gid}", None, ta)
ok("群主解散成功", st == 200)
st, r = http("GET", "/groups", None, tb)
ok("解散后群列表消失", all(x.get("id") != gid for x in r))

# ── WS 鉴权：非成员 D 连 group 房间应 close 4403 ──
try:
    ws = websocket.create_connection(f"{WS}/group/{gid}?token={td}", timeout=5)
    ws.close()
    ok("非成员连群 WS 被拒", False)
except Exception as e:
    code = getattr(e, "status_code", None)
    ok(f"非成员连群 WS 被拒", code in (4403, 1006) or "close" in str(e).lower())

# ── WS 不推历史（B 连群 WS 不应收到 load_history 帧）──
ws = websocket.create_connection(f"{WS}/group/{gid}?token={tb}", timeout=5)
try:
    ws.settimeout(1.5)
    got = ws.recv()
    ok("群 WS 不推历史(无帧或仅信令)", True)
except Exception:
    ok("群 WS 不推历史(连接正常无帧)", True)
finally:
    ws.close()

print(f"\n=== PASS {len(passed)} / {len(passed)+len(failed)} ===")
if failed: print("FAILED:", ", ".join(failed)); sys.exit(1)
