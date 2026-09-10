"""阅后即焚后端验证（阶段 1）。连 127.0.0.1:8000 直连后端。
覆盖：三模式 / 手动焚 / 发送者可见性 / 会话摘要 / 创始人解密 / 非 founder 403 / 兜底清扫。
"""
import json, os, random, string, sqlite3, sys, time, urllib.request, urllib.error

BASE = "http://localhost:8000/api"
DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend", "cervus.db")
passed = []; failed = []

def ok(n, e=""):
    """e 为 bool 时作为断言；为字符串时当作附加说明。"""
    if isinstance(e, bool):
        if e: print("  ok:", n); passed.append(n)
        else: print("  BAD:", n); failed.append(n)
        return
    print("  ok:", n + (" :: " + e if e else "")); passed.append(n)

def bad(n, e=""):
    print("  BAD:", n + (" :: " + e if e else "")); failed.append(n)

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
_used_names = set()
def reg(pfx):
    """优先注册新号；撞注册限流（3/时）则复用 DB 历史测试号（互不重复）。"""
    u = f"{pfx}{R}"
    st, r = http("POST", "/users/", {"username": u, "password": "test1234", "nickname": u,
        "school_id": "JSKS", "enrollment_year": 2024, "class_number": random.randint(1, 30),
        "student_number": random.randint(1000, 9999)})
    if st == 200:
        _used_names.add(u)
        return r["access_token"], r["user"], u
    # 降级：登录历史 grp/burn 测试号（排除本轮已用，保证 A/B 不同账号）
    con = sqlite3.connect(DB)
    ph = ",".join("?" * len(_used_names)) if _used_names else "''"
    q = f"SELECT username FROM users WHERE (username LIKE 'grp%' OR username LIKE 'burn%') AND username NOT IN ({ph}) ORDER BY id DESC LIMIT 8"
    rows = [x[0] for x in con.execute(q, list(_used_names)).fetchall()]
    con.close()
    for name in rows:
        st2, r2 = http("POST", "/users/login", {"username": name, "password": "test1234"})
        if st2 == 200:
            _used_names.add(name)
            return r2["access_token"], r2["user"], name
    print("REG FAIL", st, r); sys.exit(1)

# founder 账号（init_db 种子：founder/20100606）
st, r = http("POST", "/users/login", {"username": "founder", "password": "201006"})
if st != 200:
    # 可能登录接口参数结构不同，试 query
    st, r = http("POST", "/users/login?username=founder&password=201006", None)
if st != 200:
    print("FOUNDER LOGIN FAIL", st, r); sys.exit(1)
FTOKEN = r["access_token"]

ta, ua, _ = reg("burna"); tb, ub, _ = reg("burnb")
# 建会话
st, conv = http("POST", "/dm/conversations", {"peer_id": ub["id"]}, ta)
st2, conv2 = http("POST", "/dm/conversations", {"peer_id": ua["id"]}, tb)
cid = conv["id"]
print(f"会话 {cid}  A={ua['id']} B={ub['id']}  founder={r['user']['id'] if 'user' in r else '?'}")

def dm_list(tok, cid=cid):
    st, r = http("GET", f"/dm/conversations/{cid}/messages", None, tok)
    return r if isinstance(r, list) else []

def conv_list(tok):
    st, r = http("GET", "/dm/conversations", None, tok)
    return r if isinstance(r, list) else []

# ── 1. 永久消息基线 ──
st, r = http("POST", f"/dm/conversations/{cid}/messages", {"content": "普通消息"}, ta)
ok("发永久消息", str(st) + " id=" + str(r.get("id")))
msgs = dm_list(tb)
perm = [m for m in msgs if m["id"] == r["id"]]
ok("永久消息对方可见明文", bool(perm and perm[0]["content"] == "普通消息"))

# ── 2. any 模式 ──
st, r = http("POST", f"/dm/conversations/{cid}/messages", {"content": "阅后即焚-any", "burn_mode": "any"}, ta)
mid = r["id"]
ok("any 发送成功", r.get("burn_mode") == "any" and r.get("content") is None)
msgs = dm_list(tb)
m = [x for x in msgs if x["id"] == mid][0]
ok("any 对方列表是占位", m["content"] is None and m["state"] == "pending")
# B 点击 view
st, v = http("POST", f"/burn/dm/{mid}/view", None, tb)
ok("any view 返回明文", v.get("content") == "阅后即焚-any")
msgs_b = dm_list(tb); msgs_a = dm_list(ta)
mb = [x for x in msgs_b if x["id"] == mid][0]; ma = [x for x in msgs_a if x["id"] == mid][0]
ok("any 焚后双方都 burned", mb["burned"] and ma["burned"])
# 发送者会话未读为 0
cv = conv_list(ta)
ok("any 焚后发送者无未读", all(c["unread"] == 0 for c in cv if c["id"] == cid))

# ── 3. per_user 模式 ──
st, r = http("POST", f"/dm/conversations/{cid}/messages", {"content": "阅后即焚-peruser", "burn_mode": "per_user"}, ta)
mid2 = r["id"]
st, v = http("POST", f"/burn/dm/{mid2}/view", None, tb)
ok("per_user view 返回明文", v.get("content") == "阅后即焚-peruser")
msgs_b = dm_list(tb); msgs_a = dm_list(ta)
mb = [x for x in msgs_b if x["id"] == mid2][0]; ma = [x for x in msgs_a if x["id"] == mid2][0]
ok("per_user B 已焚", mb["burned"])
# 1:1 私信只有 B 一个受众：B 焚完即全部焚完，发送者也变已焚（Snapchat 语义）
ok("per_user 全焚后发送者也 burned", ma["burned"] and ma["content"] is None)

# ── 4. 手动焚毁 ──
st, r = http("POST", f"/dm/conversations/{cid}/messages", {"content": "手动焚毁测试", "burn_mode": "per_user"}, ta)
mid3 = r["id"]
st, r2 = http("POST", f"/burn/dm/{mid3}/burn", None, ta)
ok("手动焚成功", st == 200 and r2.get("burned"))
msgs_a = dm_list(ta)
ma = [x for x in msgs_a if x["id"] == mid3][0]
ok("手动焚后发送者也 burned", ma["burned"])
# B 再 view → 应返回 burned
st, v = http("POST", f"/burn/dm/{mid3}/view", None, tb)
ok("已焚消息再 view 无明文", v.get("content") is None and v.get("burned"))

# ── 5. 会话摘要无明文泄漏 ──
cv = conv_list(tb)
c = [x for x in cv if x["id"] == cid][0]
ok("会话摘要无焚毁原文", "阅后即焚-any" not in str(c.get("last_message")) and "手动焚毁测试" not in str(c.get("last_message")))
ok("last_burned 字段存在", "last_burned" in c)

# ── 6. 创始人解密 / 权限 ──
st, r = http("GET", f"/burn/dm/{mid2}", None, FTOKEN)
ok("founder 解密 per_user 消息", st == 200 and r.get("content") == "阅后即焚-peruser")
ok("解密带警告", "warning" in r)
# 非 founder 解密 → 403
st, r = http("GET", f"/burn/dm/{mid2}", None, tb)
ok("普通用户解密 403", st == 403)
# 审计日志已写
con = sqlite3.connect(DB)
n = con.execute("SELECT COUNT(*) FROM burn_audit_logs WHERE source='dm' AND message_id=?", (mid2,)).fetchone()[0]
con.close()
ok("审计日志已记录", n >= 1)

# ── 7. 30 天兜底（新发一条 → 改 expires_at 到期 → view 触发硬焚；真实用户路径）──
st, r = http("POST", f"/dm/conversations/{cid}/messages", {"content": "到期硬焚测试", "burn_mode": "any"}, ta)
mid_exp = r["id"]
con = sqlite3.connect(DB)
con.execute("UPDATE direct_messages SET expires_at='2000-01-01 00:00:00' WHERE id=?", (mid_exp,))
con.commit(); con.close()
st, v = http("POST", f"/burn/dm/{mid_exp}/view", None, tb)   # 到期消息：任何人点开都拿不到明文
time.sleep(0.3)  # db 提交错峰
con = sqlite3.connect(DB)
row = con.execute("SELECT burned_at, content_enc FROM direct_messages WHERE id=?", (mid_exp,)).fetchone()
con.close()
ok("到期消息被清扫焚毁", row and row[0] is not None)
ok("到期硬焚密文清空", row and row[1] is None)

print(f"\n=== PASS {len(passed)} / {len(passed)+len(failed)} ===")
if failed: print("FAILED:", ", ".join(failed)); sys.exit(1)
