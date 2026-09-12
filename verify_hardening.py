"""生产加固验证：限流 + 注册校验（纯 HTTP，走 nginx :80 反代）。
注意：内存限流桶跨请求持久，运行前需重启后端以保证桶为空。
"""
import urllib.request, urllib.error, json, random, string, sqlite3, sys

BASE = "http://localhost:8000/api"
passed=[]; failed=[]
def ok(n,e=""): print("  ok:",n+(" :: "+e if e else "")); passed.append(n)
def bad(n,e=""): print("  BAD:",n+(" :: "+e if e else "")); failed.append(n)

def get_hdr(hdrs, name):
    # urllib 的 HTTPMessage 对 header 名大小写不敏感，但 dict() 后键可能是小写
    if name in hdrs: return hdrs[name]
    lname=name.lower()
    for k,v in hdrs.items():
        if k.lower()==lname: return v
    return None

def req(method, path, body=None, token=None, xff=None):
    r = urllib.request.Request(BASE+path, data=(json.dumps(body).encode() if body is not None else None), method=method)
    r.add_header("Content-Type","application/json")
    if token: r.add_header("Authorization","Bearer "+token)
    if xff: r.add_header("X-Forwarded-For", xff)
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}"), dict(resp.headers)
    except urllib.error.HTTPError as e:
        try: payload=json.loads(e.read().decode() or "{}")
        except: payload={}
        return e.code, payload, dict(e.headers)

RAND=''.join(random.choices(string.digits,k=6))
def uname(p): return p+"_"+RAND
def mkuser(p, xff=None):
    st,reg,_=req("POST","/users/",{"username":uname(p),"password":"Abcd1234","nickname":"验证"+p,
        "school_id":"JSKS","enrollment_year":2024,"class_number":random.randint(1,9),"student_number":random.randint(1, 55)}, xff=xff)
    return st,reg

# 1) 合法注册 -> 拿到 token（无 XFF -> 走 127.0.0.1）
st,reg = mkuser("main")
if st!=200 or "access_token" not in reg:
    bad("SETUP_REGISTER", f"st={st} reg={reg}")
    print("\n%d passed, %d failed"%(len(passed),len(failed))); sys.exit(1)
token=reg["access_token"]; uid=reg["user"]["id"]
ok("SETUP_REGISTER", f"uid={uid}")

# 2) 发帖限流：5/分钟 -> 第6个 429 且带 Retry-After
codes=[]; retry=None
for i in range(6):
    st,_,hdrs=req("POST","/posts/",{"title":"限流测试"+str(i),"content":"内容","forum":"main","category":"general"},token=token)
    codes.append(st)
    if st==429: retry=get_hdr(hdrs,"Retry-After")
if codes[:5]==[200,200,200,200,200] and codes[5]==429 and retry:
    ok("POST_RATE_LIMIT", f"codes={codes} retry={retry}")
else:
    bad("POST_RATE_LIMIT", f"codes={codes} retry={retry}")

# 3) 评论限流：10/分钟 -> 第11个 429
st,posts,_=req("GET","/posts/?limit=5",token=token)
post_id = posts[0]["id"] if posts else None
if not post_id:
    bad("COMMENT_SETUP","no post to comment on"); post_id=1
ccodes=[]
for i in range(11):
    st,_,_=req("POST",f"/posts/{post_id}/comments",{"content":"评论限流"+str(i)},token=token)
    ccodes.append(st)
if ccodes[:10]==[200]*10 and ccodes[10]==429:
    ok("COMMENT_RATE_LIMIT", f"codes={ccodes}")
else:
    bad("COMMENT_RATE_LIMIT", f"codes={ccodes}")

# 4) 注册校验：错误输入应被拒（各用独立 XFF，避免触发注册限流）
# 4a 密码过短 -> 422
st,_,_=req("POST","/users/",{"username":uname("pw"),"password":"1","nickname":"x","school_id":"JSKS","enrollment_year":2024,"class_number":1,"student_number":random.randint(1, 55)},xff="203.0.113.1")
if st in (422,400): ok("REG_SHORT_PW", f"st={st}")
else: bad("REG_SHORT_PW", f"st={st}")

# 4b 学校不在白名单 -> 400
st,_,_=req("POST","/users/",{"username":uname("sch"),"password":"Abcd1234","nickname":"x","school_id":"XX","enrollment_year":2024,"class_number":1,"student_number":random.randint(1, 55)},xff="203.0.113.2")
if st==400: ok("REG_BAD_SCHOOL", f"st={st}")
else: bad("REG_BAD_SCHOOL", f"st={st}")

# 4c 用户名含非法字符 -> 422
st,_,_=req("POST","/users/",{"username":"bad name","password":"Abcd1234","nickname":"x","school_id":"JSKS","enrollment_year":2024,"class_number":1,"student_number":random.randint(1, 55)},xff="203.0.113.3")
if st in (422,400): ok("REG_BAD_USERNAME", f"st={st}")
else: bad("REG_BAD_USERNAME", f"st={st}")

# 4d 密码无数字 -> 422
st,_,_=req("POST","/users/",{"username":uname("nodig"),"password":"Abcdefgh","nickname":"x","school_id":"JSKS","enrollment_year":2024,"class_number":1,"student_number":random.randint(1, 55)},xff="203.0.113.4")
if st in (422,400): ok("REG_PW_NO_DIGIT", f"st={st}")
else: bad("REG_PW_NO_DIGIT", f"st={st}")

# 5) 同 IP 注册限流：3/小时 -> 第4个 429（固定唯一 XFF，配合重启后端保证桶为空）
created_uids=[]
for i in range(4):
    st,reg,_=req("POST","/users/",{"username":uname("rl%d"%i),"password":"Abcd1234","nickname":"限流","school_id":"JSKS","enrollment_year":2024,"class_number":random.randint(1,9),"student_number":random.randint(1, 55)},xff="198.51.100.23")
    if st==200: created_uids.append(reg["user"]["id"])
if len(created_uids)==3 and st==429:
    ok("REG_IP_RATE_LIMIT", f"created={len(created_uids)} 4th={st}")
else:
    bad("REG_IP_RATE_LIMIT", f"created={len(created_uids)} last_st={st}")

# 清理：删除测试用户及其数据
uids=[uid]+created_uids
try:
    c=sqlite3.connect("backend/cervus.db"); c.execute("PRAGMA foreign_keys=OFF")
    for u in uids:
        for tbl,col in [("posts","user_id"),("comments","user_id"),("notifications","recipient_id"),("notifications","actor_id"),("user_likes","user_id"),("user_stars","user_id"),("messages","user_id"),("reports","reporter_id")]:
            c.execute(f"DELETE FROM {tbl} WHERE {col}=?",(u,))
        c.execute("DELETE FROM users WHERE id=?",(u,))
    c.commit(); c.close()
    print("cleaned", len(uids), "test users")
except Exception as e:
    print("cleanup err", e)

print("\n%d passed, %d failed"%(len(passed),len(failed)))
sys.exit(1 if failed else 0)
