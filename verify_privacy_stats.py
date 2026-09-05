"""隐私统计 + 我的内容验证（阶段 3）。连 127.0.0.1:8001。
覆盖：匿名帖落库 / privacy-stats 数值 / founder 200 & ambassador 403 / 删自己评论 200 & 删他人 403。
"""
import json, os, sqlite3, sys, urllib.request, urllib.error

BASE = "http://localhost:8001/api"
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

def login_old(order="DESC", except_usernames=[]):
    """登录 DB 里的历史测试号（order 控制取最新或最旧，except 排除用户名）。"""
    con = sqlite3.connect(DB)
    ph = ",".join("?" * len(except_usernames))
    q = "SELECT username FROM users WHERE username LIKE 'grp%' OR username LIKE 'burn%'"
    if except_usernames:
        q += f" AND username NOT IN ({ph})"
    q += f" ORDER BY id {order} LIMIT 1"
    row = con.execute(q, except_usernames).fetchone()
    con.close()
    if not row:
        print("NO HISTORY ACCOUNT"); sys.exit(1)
    st, r = http("POST", "/users/login", {"username": row[0], "password": "test1234"})
    if st != 200:
        print("LOGIN FAIL", st, r); sys.exit(1)
    return r["access_token"], r["user"]

# founder（种子账号）
st, r = http("POST", "/users/login", {"username": "founder", "password": "20100606"})
if st != 200:
    print("FOUNDER LOGIN FAIL", st, r); sys.exit(1)
FT = r["access_token"]
# 两个不同账号：最新 + 最旧，保证不同
TA, UA = login_old("DESC")
TB, UB = login_old("ASC", [UA["username"]])

# ── 1. 匿名帖落库 ──
st, r = http("POST", "/posts/", {"title": "匿名帖验证", "content": "应该记为匿名",
    "category": "general", "forum": "main", "is_anonymous": True,
    "display_name": "快乐的小猫", "hide_uid": True}, TA)
ok("发匿名帖", st == 200)
anon_post_id = r.get("id")
st, r = http("POST", "/posts/", {"title": "实名帖验证", "content": "应该记为实名",
    "category": "general", "forum": "main", "is_anonymous": False,
    "display_name": UA["nickname"], "hide_uid": False}, TA)
ok("发实名帖", st == 200)
# DB 直查确认 is_anonymous 落库
con = sqlite3.connect(DB)
anon_flag = con.execute("SELECT is_anonymous FROM posts WHERE id=?", (anon_post_id,)).fetchone()
con.close()
ok("匿名帖 is_anonymous=1 落库", anon_flag and anon_flag[0] == 1)

# ── 2. 发一条焚毁私信（凑统计；非关键路径，失败不阻断）──
st, conv = http("POST", "/dm/conversations", {"peer_id": UB["id"]}, TA)
cid = conv.get("id")
st, r = http("POST", f"/dm/conversations/{cid}/messages", {"content": "焚毁测试", "burn_mode": "any"}, TA)
if st == 200:
    ok("发焚毁私信", r.get("burn_mode") == "any")
else:
    print("  (跳过) 焚毁私信:", st, r)

# ── 3. privacy-stats 接口 ──
st, r = http("GET", "/admin/privacy-stats", None, FT)
ok("founder 拉 privacy-stats 200", st == 200)
if st == 200:
    ok("统计含 burn 结构", isinstance(r.get("burn"), dict) and "pct_of_all" in r["burn"])
    ok("统计含 anon 结构", isinstance(r.get("anon"), dict) and "pct_of_all" in r["anon"])
    ok("匿名帖计数>=1", r.get("anon_post", {}).get("count", 0) >= 1)
    ok("焚毁消息计数>=1", r.get("burn_msg", {}).get("count", 0) >= 1)
    ok("note 字段存在", "note" in r)
# ambassador 403
st, r = http("POST", "/users/login", {"username": "KSPLambassador", "password": "20100606"})
if st == 200:
    st2, r2 = http("GET", "/admin/privacy-stats", None, r["access_token"])
    ok("ambassador 拉 privacy-stats 403", st2 == 403)
else:
    # 尝试找任意 ambassador 账号
    con = sqlite3.connect(DB)
    row = con.execute("SELECT username FROM users WHERE role='ambassador' LIMIT 1").fetchone()
    con.close()
    if row:
        st, r = http("POST", "/users/login", {"username": row[0], "password": "20100606"})
        if st == 200:
            st2, r2 = http("GET", "/admin/privacy-stats", None, r["access_token"])
            ok("ambassador 拉 privacy-stats 403", st2 == 403)

# ── 4. 删自己评论 vs 删他人评论 ──
# 先让 A 在某帖下发评论
st, p = http("GET", "/posts/?limit=1", None, TA)
pid = p[0]["id"] if isinstance(p, list) and p else None
if pid:
    st, c = http("POST", f"/posts/{pid}/comments", {"content": "我的评论"}, TA)
    cid2 = c.get("id")
    ok("发评论", bool(st == 200 and cid2))
    # 我删我的评论
    st, r = http("DELETE", f"/users/me/comments/{cid2}", None, TA)
    ok("删自己评论 200", st == 200)
    # 别人删我的评论（用 B 的 token；B 必须与 A 不同）
    st, c = http("POST", f"/posts/{pid}/comments", {"content": "B要删的评论"}, TA)
    cid3 = c.get("id")
    if cid3:
        if UB["id"] != UA["id"]:
            st, r = http("DELETE", f"/users/me/comments/{cid3}", None, TB)
            ok("删他人评论 403", st == 403)
        else:
            print("  (跳过) 删他人评论: A/B 同账号")
    else:
        print("  (跳过) 删他人评论: 评论发送失败", st, c)
    # 我的评论列表分页参数
    st, r = http("GET", "/users/me/comments?skip=0&limit=10", None, TA)
    ok("我的评论分页接口", bool(st == 200 and isinstance(r, list)))

print(f"\n=== PASS {len(passed)} / {len(passed)+len(failed)} ===")
if failed: print("FAILED:", ", ".join(failed)); sys.exit(1)
