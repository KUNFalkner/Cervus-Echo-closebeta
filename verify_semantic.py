"""语义搜索端到端验证：验证「同义不同词」召回，并对比关键词搜索。"""
import json, urllib.request, urllib.parse

BASE = 'http://localhost:8000/api'
TOKEN = None

def http(method, path, body=None):
    req = urllib.request.Request(BASE + path,
        data=(json.dumps(body).encode() if body is not None else None), method=method)
    req.add_header('Content-Type', 'application/json')
    if TOKEN:
        req.add_header('Authorization', 'Bearer ' + TOKEN)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]
    except Exception as e:
        return -1, f'{type(e).__name__}: {e}'

st, r = http('POST', '/users/login', {'username': 'founder', 'password': '201006'})
print('登录:', st, '| 字段:', list(r.keys()) if isinstance(r, dict) else r)
if isinstance(r, dict):
    TOKEN = r.get('access_token') or r.get('token')
print('token 就绪:', bool(TOKEN))

# 语义搜索：同义不同词，关键词搜不到但语义应该能搜到
for q in ['心情很差', 'emo了', '考试没考好', '晚上睡不着']:
    qs = urllib.parse.quote(q)
    st, r = http('GET', f'/posts/semantic?q={qs}&limit=3')
    print(f'\n【语义】{q}  status={st}')
    if isinstance(r, list):
        if not r:
            print('   （无结果）')
        for h in r:
            p = h.get('post', h)
            print(f"   {h.get('score', 0):.3f}  {str(p.get('title'))[:34]}  | {str(p.get('content'))[:26]}")
    else:
        print('   ', r)

# 关键词搜索对照
for q in ['心情很差', 'emo了']:
    qs = urllib.parse.quote(q)
    st, r = http('GET', f'/posts/?search={qs}&limit=3')
    n = len(r) if isinstance(r, list) else r
    print(f'\n【关键词】{q}  status={st}  条数={n}')
    if isinstance(r, list):
        for p in r[:3]:
            print(f"   {str(p.get('title'))[:34]}")
