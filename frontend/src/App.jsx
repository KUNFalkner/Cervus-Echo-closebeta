import { useState, useEffect, useCallback, createContext, useContext, useRef, useMemo } from 'react'
import gsap from 'gsap'
import './App.css'
import { TAROT_DECK, TAROT_POSITIONS, ELEMENT_THEME } from './tarotData'

const API_BASE = import.meta.env.DEV ? 'http://localhost:8000/api' : `http://${window.location.hostname || 'localhost'}:8000/api`
const WS_BASE = import.meta.env.DEV ? 'ws://localhost:8000/ws' : `ws://${window.location.hostname || 'localhost'}:8000/ws`

const CATEGORIES = [
  { id: 'general', name: '综合', icon: '📝' }, { id: 'study', name: '学习', icon: '📚' },
  { id: 'chat', name: '闲聊', icon: '💬' }, { id: 'game', name: '游戏', icon: '🎮' },
  { id: 'feedback', name: '意见箱', icon: '📮' },
]

const SCHOOLS = [
  { code: 'JSKS', name: '江苏省昆山中学', short: '昆中' }, { code: 'KSZC', name: '昆山震川高级中学', short: '震川' },
  { code: 'KSSY', name: '昆山市第一中学', short: '市一中' }, { code: 'KSKF', name: '开发区高级中学', short: '开高' },
  { code: 'KSLJ', name: '陆家高级中学', short: '陆高' }, { code: 'KSBL', name: '柏庐高级中学', short: '柏高' },
  { code: 'KSZS', name: '周市高级中学', short: '周市' }, { code: 'KSBC', name: '巴城高级中学', short: '巴城' },
  { code: 'KSHQ', name: '花桥高级中学', short: '花桥' }, { code: 'KSJX', name: '锦溪高级中学', short: '锦溪' },
  { code: 'KSPL', name: '蓬朗高级中学', short: '蓬朗' }, { code: 'KSTL', name: '亭林高级中学', short: '亭林' },
]
const getSchoolName = (code) => code === 'main' ? '主论坛' : (SCHOOLS.find(s => s.code === code)?.short || code)

const ADJS = ['快乐的','神秘的','可爱的','聪明的','勇敢的','温柔的','活泼的','安静的']
const ANIMALS = ['小猫','小狗','小兔','小熊','小狐狸','小松鼠','小熊猫','小海豚']
const genNick = () => ADJS[Math.floor(Math.random()*ADJS.length)] + ANIMALS[Math.floor(Math.random()*ANIMALS.length)]
const fmtTime = (d) => { if(!d) return ''; const dt = new Date(d.includes('Z')||d.includes('+')?d:d+'Z'); const now = new Date(); const diff = now-dt; if(diff<0||diff<60000) return '刚刚'; if(diff<3600000) return Math.floor(diff/60000)+'分钟前'; if(diff<86400000) return Math.floor(diff/3600000)+'小时前'; return `${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}` }

function canSeeAllForums(u) { return u && (u.role==='founder'||u.role==='ambassador') }
function canSeeUid(viewer, post) { if(!viewer||!post) return false; if(viewer.role==='founder') return true; if(viewer.role==='ambassador') return post.user_school===viewer.school_id || !post.hide_uid; return !post.hide_uid }

// ── Toast ──
const ToastCtx = createContext()
export const useToast = () => useContext(ToastCtx)
const ToastProvider = ({children}) => {
  const [toasts, setToasts] = useState([]); const tidRef = useRef(0)
  const push = (type, m) => { const id = ++tidRef.current; setToasts(p=>[...p,{id,msg:m,type}]); setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3000) }
  const toast = { success: m => push('success', m), error: m => push('error', m), info: m => push('info', m) }
  return <ToastCtx.Provider value={toast}>{children}<div className="toast-container">{toasts.map(t=><div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>)}</div></ToastCtx.Provider>
}

// ── Shared components ──
const Spinner = () => <div className="spinner-container"><div className="spinner"/></div>
const SkeletonList = () => <div className="posts-list">{[1,2,3].map(i=><div key={i} className="skeleton-card"><div className="skeleton skeleton-title"/><div className="skeleton skeleton-text"/><div className="skeleton skeleton-text" style={{width:'40%'}}/></div>)}</div>
const Empty = ({icon,title,desc}) => <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{desc}</p></div>
const ErrorBox = ({msg,onRetry}) => <div className="error-state"><span className="error-icon">!</span><h3>出错了</h3><p>{msg}</p>{onRetry&&<button onClick={onRetry} className="retry-btn">重试</button>}</div>

// ── ReportModal ──
const ReportModal = ({type,tid,uid,onClose}) => {
  const [reason,setReason]=useState(''); const [s,setS]=useState(false); const toast=useToast()
  const submit = async () => { if(!reason.trim()) return; setS(true)
    try { const r=await fetch(`${API_BASE}/reports/`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reporter_id:uid,target_type:type,target_id:tid,reason})}); if(!r.ok) throw new Error('举报失败'); toast.success('举报已提交'); onClose() }
    catch(e){toast.error(e.message)} finally{setS(false)} }
  return <div className="modal-overlay" onClick={onClose}><div className="glass-card modal-card" onClick={e=>e.stopPropagation()}><h3>举报内容</h3><textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="请描述举报原因..." className="glass-textarea" rows={4}/><div className="modal-actions"><button className="glass-button btn-secondary" onClick={onClose}>取消</button><button className="glass-button btn-primary" onClick={submit} disabled={s||!reason.trim()}>{s?'提交中...':'提交举报'}</button></div></div></div>
}

// ── Starfield canvas (shared, time-aware) ──
// 夜晚 = 星夜低语（深蓝渐变 + 柔光星云 + 稀疏星点 + 偶尔流星）
// 白天 = 黛蓝信纸（冷调纸面 + 左上柔光 + 颗粒 + 浮动尘埃）
function useStarfield(canvasRef) {
  useEffect(() => { const c=canvasRef.current; if(!c) return; const ctx=c.getContext('2d'); let w=c.width=window.innerWidth,h=c.height=window.innerHeight;
    const stars=Array.from({length:200},()=>({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.6+.3,a:Math.random(),phase:Math.random()*Math.PI*2,ts:Math.random()*.04+.01}));
    const nebulae=[{x:w*.25,y:h*.3,r:Math.max(w,h)*.55,c:[92,110,220],ox:0,oy:0,sx:.00012,sy:.0001},{x:w*.72,y:h*.72,r:Math.max(w,h)*.5,c:[150,100,210],ox:0,oy:0,sx:.0001,sy:.00016}];
    const dust=Array.from({length:46},()=>({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.4+.6,sp:Math.random()*.4+.15,ph:Math.random()*Math.PI*2,sw:Math.random()*.025+.008,a:Math.random()*.1+.04}));
    const grains=Array.from({length:900},()=>({x:Math.random()*w,y:Math.random()*h,s:Math.random()*1+.5,a:Math.random()*.08+.03}));
    const meteors=[]; let time=0,anim,prevNight=null;
    const forced=typeof location!=='undefined'?new URLSearchParams(location.search).get('theme'):null;
    const isNight=()=>{ if(forced==='day')return false; if(forced==='night')return true; const hr=new Date().getHours();return hr>=19||hr<6; };
    const draw=()=>{const night=isNight();
      if(prevNight!==night){ document.body.dataset.time=night?'night':'day'; prevNight=night; }
      if(night){
        const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#080b18');bg.addColorStop(.5,'#0b1024');bg.addColorStop(1,'#0a0916');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
        nebulae.forEach(n=>{n.ox+=Math.sin(time*n.sx)*.5;n.oy+=Math.cos(time*n.sy)*.3;const nx=n.x+n.ox,ny=n.y+n.oy,p=1+Math.sin(time*.001)*.1,g=ctx.createRadialGradient(nx,ny,0,nx,ny,n.r*p);const[r,gb,b]=n.c;g.addColorStop(0,`rgba(${r},${gb},${b},.06)`);g.addColorStop(.5,`rgba(${r},${gb},${b},.03)`);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(0,0,w,h)});
        stars.forEach(s=>{s.a=.3+.7*Math.abs(Math.sin(time*s.ts+s.phase));ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fillStyle=`rgba(233,236,247,${s.a})`;ctx.fill();if(s.r>1.1){ctx.beginPath();ctx.arc(s.x,s.y,s.r*3,0,Math.PI*2);ctx.fillStyle=`rgba(143,166,255,${s.a*.12})`;ctx.fill()}});
      } else {
        const pg=ctx.createLinearGradient(0,0,0,h);pg.addColorStop(0,'#fbeede');pg.addColorStop(1,'#f3e0c8');ctx.fillStyle=pg;ctx.fillRect(0,0,w,h);
        const lg=ctx.createRadialGradient(w*.7,h*.1,0,w*.7,h*.1,h*.7);lg.addColorStop(0,'rgba(255,224,170,.55)');lg.addColorStop(1,'rgba(255,224,170,0)');ctx.fillStyle=lg;ctx.fillRect(0,0,w,h);
        ctx.fillStyle='#caa877';grains.forEach(g=>{ctx.globalAlpha=g.a*.5;ctx.fillRect(g.x,g.y,g.s,g.s)});ctx.globalAlpha=1;
        dust.forEach(d=>{d.y-=d.sp;d.x+=Math.sin(time*d.sw+d.ph)*.3;if(d.y<-10){d.y=h+10;d.x=Math.random()*w;}ctx.fillStyle=`rgba(196,140,80,${d.a*1.3})`;ctx.beginPath();ctx.arc(d.x,d.y,d.r,0,Math.PI*2);ctx.fill()});
      }
      if(night&&meteors.length<3&&Math.random()<.012) meteors.push({x:Math.random()*w*1.5-w*.25,y:-10,len:Math.random()*120+60,speed:Math.random()*8+5,angle:Math.PI/4+(Math.random()-.5)*.3,a:1,life:1});
      for(let i=meteors.length-1;i>=0;i--){const m=meteors[i];m.x+=Math.cos(m.angle)*m.speed;m.y+=Math.sin(m.angle)*m.speed;m.life-=.015;m.a=m.life;if(m.life<=0||m.y>h+50){meteors.splice(i,1);continue}const tx=m.x-Math.cos(m.angle)*m.len,ty=m.y-Math.sin(m.angle)*m.len,g=ctx.createLinearGradient(tx,ty,m.x,m.y);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.7,`rgba(200,220,255,${m.a*.4})`);g.addColorStop(1,`rgba(255,255,255,${m.a*.9})`);ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(m.x,m.y);ctx.strokeStyle=g;ctx.lineWidth=1.5;ctx.stroke();ctx.beginPath();ctx.arc(m.x,m.y,2,0,Math.PI*2);ctx.fillStyle=`rgba(255,255,255,${m.a})`;ctx.fill()}
      time++;anim=requestAnimationFrame(draw)};draw();
    const resize=()=>{w=c.width=window.innerWidth;h=c.height=window.innerHeight;stars.forEach(s=>{s.x=Math.random()*w;s.y=Math.random()*h});dust.forEach(d=>{if(d.x>w)d.x=Math.random()*w;if(d.y>h)d.y=Math.random()*h});grains.forEach(g=>{g.x=Math.random()*w;g.y=Math.random()*h})};window.addEventListener('resize',resize);
    return ()=>{cancelAnimationFrame(anim);window.removeEventListener('resize',resize)}},[])
}

// ── Global starry background (always mounted) ──
const Starfield = () => {
  const canvasRef = useRef(null);
  useStarfield(canvasRef);
  return <canvas ref={canvasRef} className="starry-canvas" />;
};

// ── LoginPage ──
const LoginPage = ({onLogin,onSwitchRegister}) => {
  const nameRef=useRef(null); const passRef=useRef(null); const [loading,setLoading]=useState(false);
  useEffect(()=>{const card=document.querySelector('.login-card-glass');const items=document.querySelectorAll('.login-card-glass>*');if(!card)return;if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;gsap.set(card,{opacity:0,scale:.85,y:20});gsap.set(items,{opacity:0,y:15});const tl=gsap.timeline({defaults:{ease:'power2.out'}});tl.to(card,{opacity:1,scale:1,y:0,duration:.8,ease:'back.out(1.7)'}).to(items,{opacity:1,y:0,duration:.4,stagger:.12},.35);return()=>tl.kill()},[])
  const submit=async(e)=>{e.preventDefault();const u=nameRef.current?.value?.trim(),p=passRef.current?.value||'';if(!u)return;setLoading(true);
    try{const r=await fetch(`${API_BASE}/users/login?username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`,{method:'POST'});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.detail||'登录失败')}onLogin(await r.json())}catch(e){alert(e.message)}finally{setLoading(false)}}
  return <div className="login-page"><div className="login-card-glass"><div className="login-header"><span className="login-icon">🪵</span><h1>校园树洞</h1><p>匿名表达，自由交流</p></div><form onSubmit={submit} className="login-form"><input ref={nameRef} type="text" placeholder="用户名" className="login-input" required/><input ref={passRef} type="password" placeholder="密码（可选）" className="login-input"/><button type="submit" className="login-btn" disabled={loading}>{loading?'进入中...':'进入社区'}</button></form><p className="switch-link">没有账号？<button onClick={onSwitchRegister}>去注册</button></p></div></div>
}

// ── RegisterForm ──
const RegisterForm = ({onSwitch}) => {
  const toast=useToast(); const [f,setF]=useState({username:'',password:'',nickname:'',school_id:'JSKS',enrollment_year:2024,class_number:1,student_number:1}); const [loading,setLoading]=useState(false); const [showPick,setShowPick]=useState(false);
  const submit=async(e)=>{e.preventDefault();if(!f.username.trim())return;setLoading(true);
    try{const r=await fetch(`${API_BASE}/users/`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:f.username,nickname:f.nickname||genNick(),password:f.password||undefined,school_id:f.school_id,enrollment_year:f.enrollment_year,class_number:f.class_number,student_number:f.student_number})});if(!r.ok){const d=await r.json();throw new Error(d.detail||'注册失败')}const data=await r.json();localStorage.setItem('token',data.access_token);localStorage.setItem('user',JSON.stringify(data.user));toast.success('注册成功');window.location.reload()}catch(e){toast.error(e.message)}finally{setLoading(false)}}
  const preview=`${f.school_id}${f.enrollment_year}${String(f.class_number).padStart(2,'0')}${String(f.student_number).padStart(2,'0')}`; const sel=SCHOOLS.find(s=>s.code===f.school_id);
  return <div className="register-page"><div className="login-card-glass register-card"><div className="login-header"><span className="login-icon">🪵</span><h1>注册账号</h1><p>填写入学信息，系统将自动生成你的 UID</p></div><form onSubmit={submit} className="login-form"><input value={f.username} onChange={e=>setF({...f,username:e.target.value})} placeholder="用户名（登录用）" className="login-input" required/><input value={f.password} onChange={e=>setF({...f,password:e.target.value})} placeholder="密码（可选）" className="login-input"/><input value={f.nickname} onChange={e=>setF({...f,nickname:e.target.value})} placeholder="账户名（可随时修改）" className="login-input"/><div className="uid-section-glass"><h4>入学信息</h4><div className="custom-select" onClick={()=>setShowPick(!showPick)}><span className="custom-select-label">学校</span><span className="custom-select-value">{sel?.name||'选择学校'}</span><span className="custom-select-arrow">▾</span>{showPick&&<div className="custom-select-dropdown">{SCHOOLS.map(s=><div key={s.code} className={`custom-select-option ${f.school_id===s.code?'active':''}`} onClick={e=>{e.stopPropagation();setF({...f,school_id:s.code});setShowPick(false)}}><span>{s.name}</span><span className="custom-select-code">{s.code}</span></div>)}</div>}</div><div className="uid-inputs" style={{gridTemplateColumns:'1fr 1fr 1fr',marginTop:'.75rem'}}><div className="uid-input-group"><label>入学年份</label><input type="number" value={f.enrollment_year} onChange={e=>setF({...f,enrollment_year:parseInt(e.target.value)||2024})} className="login-input" min="2020" max="2030"/></div><div className="uid-input-group"><label>班级</label><input type="number" value={f.class_number} onChange={e=>setF({...f,class_number:parseInt(e.target.value)||1})} className="login-input" min="1" max="99"/></div><div className="uid-input-group"><label>学号</label><input type="number" value={f.student_number} onChange={e=>setF({...f,student_number:parseInt(e.target.value)||1})} className="login-input" min="1" max="99"/></div></div><div className="uid-preview"><span>你的 UID 将是：</span><span className="uid-badge-glass">{preview}</span></div></div><button type="submit" className="login-btn" disabled={loading}>{loading?'注册中...':'注册'}</button></form><p className="switch-link">已有账号？<button onClick={onSwitch}>去登录</button></p></div></div>
}

// ── PostForm ──
const PostForm = ({user,visibleForums,onPostCreated}) => {
  const toast=useToast(); const tRef=useRef(null),cRef=useRef(null); const [forum,setForum]=useState('main');
  const [cats,setCats]=useState(['general']); const [submitting,setSubmitting]=useState(false);
  const isAdmin=user?.role==='founder'||user?.role==='ambassador';
  const [isAnon,setIsAnon]=useState(isAdmin?false:true); const [hideUid,setHideUid]=useState(false);
  const submit=async e=>{e.preventDefault(); if(!user?.id){toast.error('登录已失效，请重新登录');return;} const title=tRef.current?.value?.trim(),content=cRef.current?.value?.trim(); if(!title||!content)return; setSubmitting(true);
    const dn=isAdmin?user.nickname:(isAnon?genNick():user.nickname);
    const hu=isAdmin?false:(isAnon||hideUid);
    try{const r=await fetch(`${API_BASE}/posts/`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,content,category:cats.join(','),forum,user_id:user.id,display_name:dn,user_uid:user.uid,user_school:user.school_id,hide_uid:hu,is_announcement:false})});if(!r.ok){const d=await r.json().catch(()=>({}));const msg=Array.isArray(d.detail)?d.detail.map(x=>x.msg||(x.loc||[]).join('.')).join('；'):(typeof d.detail==='string'?d.detail:'发布失败');throw new Error(msg)}tRef.current.value='';cRef.current.value='';setCats(['general']);setHideUid(false);onPostCreated();toast.success('发布成功')}catch(e){toast.error((e&&e.name==='TypeError')?'网络异常：无法连接服务器，请确认后端已启动于 localhost:8000':(e&&e.message||'发布失败'))}finally{setSubmitting(false)}}
  return <div className="glass-card create-post-card"><h3>发布新帖子</h3><form onSubmit={submit} className="create-post-form"><input ref={tRef} type="text" placeholder="帖子标题" className="glass-input" required/><textarea ref={cRef} placeholder="分享你的想法..." className="glass-textarea" required rows={4}/><div className="forum-select"><label className="forum-label">发布到：</label><div className="forum-options">{visibleForums.map(f=><button key={f.code} type="button" className={`forum-option ${forum===f.code?'active':''}`} onClick={()=>setForum(f.code)}>{f.code==='main'?'🏠 ':'🏫 '}{f.name}</button>)}</div></div>{!isAdmin&&<div className="post-options"><label className="checkbox-label"><input type="checkbox" checked={isAnon} onChange={e=>setIsAnon(e.target.checked)}/><span>匿名发布</span></label><label className="checkbox-label"><input type="checkbox" checked={hideUid} onChange={e=>setHideUid(e.target.checked)}/><span>隐藏 UID</span></label></div>}<div className="category-select">{CATEGORIES.map(c=><button key={c.id} type="button" className={`category-option ${cats.includes(c.id)?'active':''}`} onClick={()=>setCats(p=>p.includes(c.id)?p.filter(x=>x!==c.id):[...p,c.id])}>{c.icon} {c.name}</button>)}</div><button type="submit" className="glass-button submit-btn btn-primary" disabled={submitting}>{submitting?'发布中...':'发布'}</button></form></div>
}

// ── PostCard ──
const PostCard = ({post,user,onRefresh}) => {
  const router=null; const toast=useToast();
  const open=()=>{/* handled by parent */};
  const star=async e=>{e.stopPropagation();try{const r=await fetch(`${API_BASE}/posts/${post.id}/star?user_id=${user?.id}`,{method:'POST'});const d=await r.json();if(!r.ok){toast.error(d.detail||'加星失败');return}onRefresh()}catch(e){toast.error(e.message)}}
  const report=e=>{e.stopPropagation();const reason=prompt('举报理由：');if(!reason)return;fetch(`${API_BASE}/reports/`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reporter_id:user?.id,target_type:'post',target_id:post.id,reason})}).then(()=>toast.success('举报已提交')).catch(()=>toast.error('举报失败'))}
  return <div className="glass-card post-card" onClick={()=>document.dispatchEvent(new CustomEvent('openPost',{detail:post}))}>
    <div className="post-card-header">{post.is_announcement&&<div className="announcement-badge">📢 公告</div>}<span className="post-author-name-small">{post.display_name||'匿名用户'}</span>{canSeeUid(user,post)&&<span className="uid-badge">{post.user_uid}{post.hide_uid&&' (隐藏)'}</span>}<span className="post-forum-badge">{getSchoolName(post.forum)}</span><span className="post-category-mini">{post.category?post.category.split(',').map(c=>CATEGORIES.find(x=>x.id===c)?.icon||'📝').join(' '):'📝'}</span></div>
    <h4 className="post-title">{post.title}</h4>
    <p className="post-preview">{post.content?.slice(0,100)}{post.content?.length>100?'...':''}</p>
    <div className="post-footer"><span className="post-time">{fmtTime(post.created_at)}</span><div className="post-actions">{(user?.id===post.user_id||user?.role==='founder'||(user?.role==='ambassador'&&post.user_school===user.school_id))&&<button onClick={e=>{e.stopPropagation();if(!confirm('确定删除？'))return;fetch(`${API_BASE}/posts/${post.id}?user_id=${user.id}`,{method:'DELETE'}).then(onRefresh)}} className="action-btn delete-btn">🗑️</button>}<button onClick={star} className="action-btn star-btn">⭐ {post.star_count||0}</button><span className="action-text">💬 {post.comment_count}</span></div></div></div>
}

// ── StarButton（点赞/星标，带 GSAP 弹跳动效；替代原来整列表重绘导致的闪烁）──
const StarButton = ({post, starred, count, onToggle}) => {
  const ref = useRef(null)
  const handle = (e) => {
    e.stopPropagation()
    if(ref.current && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)){
      gsap.fromTo(ref.current, {scale:1}, {scale:1.35, duration:.16, ease:'back.out(3)', yoyo:true, repeat:1, clearProps:'transform'})
    }
    onToggle(post)
  }
  return <button ref={ref} onClick={handle} className={`action-btn star-btn ${starred?'starred':''}`}>{starred?'⭐':'☆'} {count||0}</button>
}

// ── PostDetail ──
const PostDetail = ({post,user,onBack,onRefresh,myStars,onToggleStar}) => {
  const toast=useToast(); const [comments,setComments]=useState([]); const [nc,setNc]=useState(''); const [loading,setLoading]=useState(false); const [err,setErr]=useState(null); const [submitting,setSubmitting]=useState(false); const [showR,setShowR]=useState(false); const [rt,setRt]=useState({type:'post',id:0});
  const isAdmin=user?.role==='founder'||user?.role==='ambassador';
  const fc=useCallback(async()=>{setLoading(true);try{const r=await fetch(`${API_BASE}/posts/${post.id}/comments`);if(!r.ok)throw new Error('获取评论失败');setComments(await r.json())}catch(e){setErr(e.message)}finally{setLoading(false)}},[post.id]);
  useEffect(()=>{fc()},[fc]);
  useEffect(()=>{const h=e=>{if(e.key==='Escape')onBack()};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h)},[onBack]);
  const submitComment=async e=>{e.preventDefault();if(!nc.trim())return;setSubmitting(true);const dn=user?.role==='founder'||user?.role==='ambassador'?user.nickname:genNick();try{const r=await fetch(`${API_BASE}/posts/${post.id}/comments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:nc,user_id:user.id,post_id:post.id,display_name:dn,user_uid:user.uid})});if(!r.ok)throw new Error('评论失败');setNc('');fc();onRefresh?.();toast.success('评论成功')}catch(e){toast.error(e.message)}finally{setSubmitting(false)}}
  return <div className="post-detail"><button className="back-btn" onClick={onBack}>← 返回</button><div className="glass-card post-detail-card"><div className="post-header"><span className="post-author-name">{post.display_name||'匿名用户'}</span>{canSeeUid(user,post)&&<span className="uid-badge">{post.user_uid}{post.hide_uid&&' (隐藏)'}</span>}<span className="post-category-badge">{post.category?post.category.split(',').map(c=>{const x=CATEGORIES.find(y=>y.id===c);return x?`${x.icon} ${x.name}`:'📝 综合'}).join(' · '):'📝 综合'}</span></div><h2>{post.title}</h2><p className="post-content">{post.content}</p><div className="post-meta"><span className="post-time">{fmtTime(post.created_at)}</span><div className="post-actions"><StarButton post={post} starred={!!myStars[post.id]} count={post.star_count} onToggle={onToggleStar}/><button onClick={()=>{setRt({type:'post',id:post.id});setShowR(true)}} className="action-btn">🚩</button>{(user?.id===post.user_id||isAdmin)&&<button onClick={async()=>{if(!confirm('确定删除？'))return;await fetch(`${API_BASE}/posts/${post.id}?user_id=${user.id}`,{method:'DELETE'});toast.success('已删除');onBack()}} className="action-btn delete-btn">🗑️</button>}</div></div></div><div className="glass-card comments-section"><h3>评论 ({comments.length})</h3><form onSubmit={submitComment} className="comment-form"><textarea value={nc} onChange={e=>setNc(e.target.value)} placeholder="说点什么..." className="comment-input" rows={3}/><button type="submit" className="glass-button submit-btn btn-primary" disabled={submitting||!nc.trim()}>{submitting?'发送中...':'发表评论'}</button></form>{loading?<Spinner/>:err?<ErrorBox msg={err} onRetry={fc}/>:comments.length===0?<Empty icon="💬" title="暂无评论" desc="成为第一个评论的人"/>:<div className="comments-list">{comments.map(c=><div key={c.id} className="glass-card comment-card"><div className="comment-header"><div className="comment-author-info"><span className="comment-author">{c.display_name||'匿名用户'}</span>{canSeeUid(user,c)&&<span className="uid-badge">{c.user_uid}</span>}</div><div className="comment-actions"><span className="comment-time">{fmtTime(c.created_at)}</span>{(user?.id===c.user_id||isAdmin)&&<button onClick={async()=>{await fetch(`${API_BASE}/posts/${post.id}/comments/${c.id}?user_id=${user.id}`,{method:'DELETE'});fc()}} className="action-btn delete-btn">🗑️</button>}<button onClick={()=>{setRt({type:'comment',id:c.id});setShowR(true)}} className="action-btn">🚩</button></div></div><p className="comment-content">{c.content}</p></div>)}</div>}</div>{showR&&<ReportModal type={rt.type} tid={rt.id} uid={user?.id} onClose={()=>setShowR(false)}/>}</div>
}

// ── RulesModal ──
const RulesModal = ({onClose}) => <div className="modal-overlay" onClick={onClose}><div className="glass-card modal-card rules-modal login-rules-modal" onClick={e=>e.stopPropagation()}><h2>📜 社区规则</h2><p className="rules-subtitle">欢迎来到校园树洞！请仔细阅读以下规则：</p><div className="rules-content"><p><strong>1. 友善交流</strong> — 尊重他人，禁止辱骂、人身攻击。</p><p><strong>2. 保护隐私</strong> — 请勿公开他人真实姓名、联系方式等隐私信息。</p><p><strong>3. 合理发言</strong> — 禁止发布违法、色情、暴力等不良信息。</p><p><strong>4. 举报机制</strong> — 发现违规内容请及时举报，管理员会尽快处理。</p><p><strong>5. 共同维护</strong> — 让我们一起营造温暖、安全的校园社区。</p></div><button className="glass-button btn-primary" onClick={onClose}>我已阅读，开始使用</button></div></div>

// ── ChatRoom ──
const fmtChatTime = ts => { if(!ts) return ''; const d = new Date(String(ts).includes('Z')||String(ts).includes('+')?ts:ts+'Z'); return isNaN(d) ? '' : d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}) }

const ChatRoom = () => {
  const [msgs,setMsgs] = useState([]); const [input,setInput] = useState('')
  const [status,setStatus] = useState('connecting')   // connecting | online | offline
  const wsRef = useRef(null); const endRef = useRef(null); const aliveRef = useRef(true); const retryRef = useRef(0); const listRef = useRef(null)
  const usr = JSON.parse(localStorage.getItem('user')||'{}')

  useEffect(()=>{
    aliveRef.current = true
    let timer = null
    const connect = () => {
      if(!aliveRef.current) return
      setStatus('connecting')
      const s = new WebSocket(`${WS_BASE}/chat/main`)
      wsRef.current = s
      s.onopen = () => { retryRef.current = 0; setStatus('online') }
      s.onmessage = e => { try{ const m=JSON.parse(e.data); if(!m||m.type==='error')return; setMsgs(p=>p.some(x=>x.id&&x.id===m.id)?p:[...p,m]) }catch{} }
      s.onclose = () => {
        if(!aliveRef.current) return
        setStatus('offline')
        const delay = Math.min(1000 * 2 ** retryRef.current, 15000)
        retryRef.current += 1
        timer = setTimeout(connect, delay)
      }
      s.onerror = () => s.close()
    }
    connect()
    return () => { aliveRef.current = false; clearTimeout(timer); wsRef.current?.close() }
  },[])

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:'smooth'}) },[msgs])

  const send = e => {
    e.preventDefault()
    const s = wsRef.current
    if(!input.trim() || !s || s.readyState !== WebSocket.OPEN) return
    s.send(JSON.stringify({user_id:usr.id, nickname:usr.nickname, content:input}))
    setInput('')
  }

  // 新消息入场弹入（只动最后一条，不重绘整列）；尊重 prefers-reduced-motion
  useEffect(()=>{
    if(!listRef.current) return
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = listRef.current.querySelector('.chat-message:last-child')
    if(el) gsap.fromTo(el, {opacity:0, y:8}, {opacity:1, y:0, duration:.25, ease:'power2.out', clearProps:'opacity,transform'})
  },[msgs.length])

  const online = status === 'online'
  return <div className="chat-room">
    {!online && <div className="chat-status">{status==='connecting'?'连接中…':'已断开，正在重连…'}</div>}
    <div className="chat-messages" ref={listRef}>
      {msgs.length===0
        ? <Empty icon="💬" title="暂无消息" desc="来说点什么吧"/>
        : msgs.map((m,i)=><div key={m.id ?? `local-${i}`} className={`chat-message ${m.user_id===usr.id?'own':''}`}>
            <span className="chat-nickname">{m.nickname}</span>
            <span className="chat-content">{m.content}</span>
            <span className="chat-time">{fmtChatTime(m.timestamp)}</span>
          </div>)}
      <div ref={endRef}/>
    </div>
    <form onSubmit={send} className="chat-input-form">
      <input value={input} onChange={e=>setInput(e.target.value)} placeholder={online?'输入消息...':'连接断开，无法发送'} className="glass-input chat-input" disabled={!online}/>
      <button type="submit" className="glass-button btn-primary chat-send-btn" disabled={!input.trim()||!online}>发送</button>
    </form>
  </div>
}

// ── AdminPage ──
const AdminPage = ({user}) => {
  const toast=useToast(); const [stats,setStats]=useState(null); const [ulist,setUlist]=useState([]); const [reports,setReports]=useState([]); const [plist,setPlist]=useState([]); const [psearch,setPsearch]=useState(''); const [tab,setTab]=useState('stats'); const [loading,setLoading]=useState(true); const [muteMins,setMuteMins]=useState(60)
  useEffect(()=>{ const f=async()=>{ setLoading(true); try{ const [sr,ur,rr,pr]=await Promise.all([fetch(`${API_BASE}/admin/stats?user_id=${user.id}`),fetch(`${API_BASE}/admin/users?user_id=${user.id}`),fetch(`${API_BASE}/admin/reports?user_id=${user.id}`),fetch(`${API_BASE}/admin/posts?user_id=${user.id}`)]); if(sr.ok)setStats(await sr.json()); if(ur.ok)setUlist(await ur.json()); if(rr.ok)setReports(await rr.json()); if(pr.ok)setPlist(await pr.json()) }catch(e){toast.error('加载失败')} finally{setLoading(false)} }; f() },[])
  const updReport = async(id,st,action='none')=>{ try{ const url=`${API_BASE}/admin/reports/${id}/status?user_id=${user.id}&status=${st}`+(action!=='none'?`&action=${action}`:''); await fetch(url,{method:'PUT'}); setReports(rs=>rs.map(x=>x.id===id?{...x,status:st}:x)); toast.success(action!=='none'?'已删除内容并处理举报':'状态已更新') }catch(e){toast.error(e.message||'更新失败')} }
  const delPost = async(id)=>{ if(!confirm('确认删除该帖子？此操作不可恢复'))return; try{ const r=await fetch(`${API_BASE}/posts/${id}?user_id=${user.id}`,{method:'DELETE'}); if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.detail||'删除失败')} setPlist(ps=>ps.filter(x=>x.id!==id)); toast.success('帖子已删除') }catch(e){toast.error(e.message)} }
  // 管理范围：founder 管全部；大使只管本校；管理员（founder/ambassador）自身不可被操作
  const isAdminRole = user.role==='founder'||user.role==='ambassador'
  const canManage = (u)=> isAdminRole && u.role==='student' && (user.role==='founder' || u.school_id===user.school_id)
  const fmtMute = (iso)=> iso? new Date(iso).toLocaleString('zh-CN',{hour12:false}) : null
  const isMutedNow = (iso)=>{ if(!iso) return false; return new Date(iso).getTime() > Date.now() }
  const setMuted = (id,iso)=> setUlist(us=>us.map(x=>x.id===id?{...x,muted_until:iso}:x))
  const muteUser = async(u)=>{ try{ const r=await fetch(`${API_BASE}/admin/users/${u.id}/mute?user_id=${user.id}&minutes=${muteMins}`,{method:'PUT'}); if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.detail||'禁言失败')} const d=await r.json(); setMuted(u.id,d.muted_until); toast.success(`已禁言 ${fmtMute(d.muted_until)} 解禁`) }catch(e){toast.error(e.message)} }
  const unmuteUser = async(u)=>{ try{ const r=await fetch(`${API_BASE}/admin/users/${u.id}/unmute?user_id=${user.id}`,{method:'PUT'}); if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.detail||'解禁失败')} setMuted(u.id,null); toast.success('已解除禁言') }catch(e){toast.error(e.message)} }
  if(loading) return <Spinner/>
  return <div className="admin-page"><h2 className="admin-title">管理后台</h2>
  <div className="admin-tabs"><button className={`admin-tab ${tab==='stats'?'active':''}`} onClick={()=>setTab('stats')}>数据</button><button className={`admin-tab ${tab==='users'?'active':''}`} onClick={()=>setTab('users')}>用户</button><button className={`admin-tab ${tab==='reports'?'active':''}`} onClick={()=>setTab('reports')}>举报 ({reports.filter(r=>r.status==='pending').length})</button><button className={`admin-tab ${tab==='content'?'active':''}`} onClick={()=>setTab('content')}>内容 ({plist.length})</button></div>
  {tab==='stats'&&stats&&<div className="admin-stats"><div className="glass-card stat-card"><span className="stat-number">{stats.total_users}</span><span className="stat-desc">注册用户</span></div><div className="glass-card stat-card"><span className="stat-number">{stats.total_posts}</span><span className="stat-desc">帖子总数</span></div><div className="glass-card stat-card"><span className="stat-number">{stats.total_comments}</span><span className="stat-desc">评论总数</span></div><div className="glass-card stat-card"><span className="stat-number">{stats.pending_reports}</span><span className="stat-desc">待处理举报</span></div></div>}
  {tab==='users'&&<div className="admin-list">
    <div className="mute-bar">禁言时长：
      <select className="glass-input" value={muteMins} onChange={e=>setMuteMins(Number(e.target.value))}>
        <option value={30}>30 分钟</option>
        <option value={60}>1 小时</option>
        <option value={360}>6 小时</option>
        <option value={1440}>1 天</option>
        <option value={4320}>3 天</option>
        <option value={10080}>7 天</option>
      </select>
      <span className="mute-hint">仅可禁言{user.role==='founder'?'全部':'本校'}学生，不可禁言管理员</span>
    </div>
    {ulist.map(u=><div key={u.id} className="glass-card admin-user-card">
      <div className="admin-user-info"><span className="uid-badge">{u.uid||'------'}</span><span className="admin-username">@{u.username}</span><span className="admin-nickname">{u.nickname}</span>{u.role==='founder'&&<span className="role-badge founder">创始人</span>}{u.role==='ambassador'&&<span className="role-badge ambassador">大使</span>}<span>{getSchoolName(u.school_id)}</span></div>
      <div className="admin-user-meta"><span>匿名: {u.is_anonymous?'是':'否'}</span><span>注册: {u.created_at?new Date(u.created_at).toLocaleDateString('zh-CN'):'-'}</span></div>
      {isMutedNow(u.muted_until)&&<div className="mute-status">已禁言至 {fmtMute(u.muted_until)}</div>}
      {canManage(u)&&<div className="admin-user-actions">
        {isMutedNow(u.muted_until)
          ? <button className="save-btn" onClick={()=>unmuteUser(u)}>解除禁言</button>
          : <button className="danger-btn" onClick={()=>muteUser(u)}>禁言</button>}
      </div>}
    </div>)}
  </div>}
  {tab==='reports'&&<div className="admin-list">{reports.length===0?<Empty icon="✅" title="暂无举报" desc="一切正常"/>:reports.map(r=><div key={r.id} className="glass-card admin-report-card"><div className="report-header"><span className={`report-status ${r.status}`}>{r.status==='pending'?'待处理':r.status==='reviewed'?'已审核':'已解决'}</span><span className="report-time">{r.created_at?new Date(r.created_at).toLocaleString('zh-CN'):'-'}</span></div><div className="report-body"><p><strong>举报者:</strong> {r.reporter_nickname} ({r.reporter_uid})</p><p><strong>目标:</strong> {r.target_type==='post'?'帖子':'评论'} #{r.target_id}</p><p><strong>原因:</strong> {r.reason}</p></div>{r.status==='pending'&&<div className="report-actions"><button className="save-btn" onClick={()=>updReport(r.id,'reviewed')}>标记已审核</button><button className="save-btn" onClick={()=>updReport(r.id,'resolved')}>标记已解决</button>{(r.target_type==='post'||r.target_type==='comment')&&<button className="danger-btn" onClick={()=>updReport(r.id,'resolved',r.target_type==='post'?'delete_post':'delete_comment')}>删除内容并解决</button>}</div>}</div>)}</div>}
  {tab==='content'&&<div className="admin-list">
    <div className="mute-bar"><input className="glass-input" placeholder="搜索标题/内容" value={psearch} onChange={e=>setPsearch(e.target.value)} />
      <span className="mute-hint">仅可管理{user.role==='founder'?'全部':'本校'}内容</span>
    </div>
    {plist.filter(p=>!psearch.trim()||(p.title||'').includes(psearch.trim())||(p.content||'').includes(psearch.trim())).length===0?<Empty icon="📭" title="暂无内容" desc="本校暂无帖子"/>:plist.filter(p=>!psearch.trim()||(p.title||'').includes(psearch.trim())||(p.content||'').includes(psearch.trim())).map(p=><div key={p.id} className="glass-card admin-post-card">
      <div className="admin-post-info"><span className="admin-post-school">{getSchoolName(p.user_school)}</span><span className="admin-post-cat">{p.category}</span><span className="admin-post-time">{p.created_at?new Date(p.created_at).toLocaleString('zh-CN'):'-'}</span></div>
      <div className="admin-post-title">{p.title||'(无标题)'}</div>
      <div className="admin-post-content">{p.content?.slice(0,120)}{p.content&&p.content.length>120?'…':''}</div>
      <div className="admin-post-meta"><span>💬 {p.comment_count}</span><span>⭐ {p.star_count}</span></div>
      <div className="report-actions"><button className="danger-btn" onClick={()=>delPost(p.id)}>删除帖子</button></div>
    </div>)}
  </div>}
  </div>
}

// ── ProfilePage ──
const ProfilePage = ({user,setUser}) => {
  const toast=useToast(); const [nick,setNick]=useState(user.nickname); const [pw,setPw]=useState('');   const isAdmin=user.role==='founder'||user.role==='ambassador'; const [isAnon,setIsAnon]=useState(isAdmin?false:user.is_anonymous!==false)
  const _tk=localStorage.getItem('token'); const _auth={'Content-Type':'application/json'}; if(_tk)_auth['Authorization']='Bearer '+_tk
  const save=async()=>{ if(!nick?.trim()){toast.error('账户名不能为空');return}
    try{ const body={nickname:nick.trim(),is_anonymous:isAdmin?false:isAnon}; if(pw?.trim())body.password=pw.trim()
      const r=await fetch(`${API_BASE}/users/${user.id}`,{method:'PUT',headers:_auth,body:JSON.stringify(body)})
      if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.detail||'保存失败')}
      const u=await r.json(); setUser(u); localStorage.setItem('user',JSON.stringify(u)); setPw(''); toast.success('保存成功') }catch(e){toast.error(e.message)} }
  return <div className="profile-page"><div className="glass-card profile-card"><label className="avatar-upload"><img src={user.avatar||`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} alt="头像"/><div className="avatar-upload-overlay">📷</div><input type="file" accept="image/*" onChange={async e=>{const f=e.target.files[0];if(!f)return;const reader=new FileReader();reader.onload=async ev=>{const r=await fetch(`${API_BASE}/users/${user.id}`,{method:'PUT',headers:_auth,body:JSON.stringify({avatar:ev.target.result})});if(r.ok){const u=await r.json();setUser(u);localStorage.setItem('user',JSON.stringify(u));toast.success('头像已更新')}};reader.readAsDataURL(f)}}/></label><div className="profile-info"><h3>{user.nickname}</h3><p className="profile-username">@{user.username}</p><span className="uid-badge">UID: {user.uid}</span>{user.role==='founder'&&<span className="role-badge founder">创始人</span>}{user.role==='ambassador'&&<span className="role-badge ambassador">大使</span>}<div className="profile-stats"><div className="stat-item"><span className="stat-value">{user.star_count||0}</span><span className="stat-label">Star</span></div><div className="stat-item"><span className="stat-value">{user.karma||0}</span><span className="stat-label">Karma</span></div></div><div className="karma-level" style={{marginTop:'.5rem',fontSize:'.85rem',opacity:.9}}>{['🌫️ 初来乍到','🌱 成长中的声音','🔥 活跃核心','🌟 树洞之光'][Math.min(3,Math.floor((user.karma||0)/20))]}</div></div></div><div className="glass-card settings-card"><h3>设置</h3><div className="settings-list">{!isAdmin&&<div className="setting-row"><span>匿名发布</span><div className={`toggle-switch ${isAnon?'active':''}`} onClick={()=>setIsAnon(!isAnon)}/></div>}<div className="setting-row"><span>账户名</span><input value={nick} onChange={e=>setNick(e.target.value)}/></div><div className="setting-row"><span>修改密码</span><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="留空不修改"/></div><button className="save-btn" onClick={save}>保存设置</button></div><div className="settings-section"><h4>其他</h4><div className="settings-list"><div className="settings-item" onClick={()=>{setUser(null);localStorage.removeItem('token');localStorage.removeItem('user');toast.info('已退出登录')}}><span>退出登录</span><span className="settings-arrow">→</span></div></div></div></div></div>
}

// ── TarotPage（塔罗占卜：过去 / 现在 / 未来 三张时间牌阵）──
const TarotPage = () => {
  const toast = useToast()
  const todayKey = 'treehole_tarot_' + new Date().toISOString().slice(0, 10)
  const [drawn, setDrawn] = useState(() => { try { return JSON.parse(localStorage.getItem(todayKey) || 'null') } catch { return null } })
  const [revealed, setRevealed] = useState(() => drawn ? [true, true, true] : [false, false, false])
  const [openIdx, setOpenIdx] = useState(-1)
  const [shuffling, setShuffling] = useState(false)
  const r0 = useRef(null), r1 = useRef(null), r2 = useRef(null)
  const cardRefs = [r0, r1, r2]
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const themeOf = (card) => ELEMENT_THEME[card.arcana === 'major' ? 'major' : card.suit]
  const stars = useMemo(() => Array.from({ length: 40 }, () => ({
    top: Math.random() * 100, left: Math.random() * 100,
    size: Math.random() * 2 + 1, dur: 2 + Math.random() * 3, delay: Math.random() * 3
  })), [])

  const draw = () => {
    if (shuffling) return
    setShuffling(true)
    setTimeout(() => {
      const deck = [...TAROT_DECK]
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]] }
      const picks = deck.slice(0, 3).map(c => ({ ...c, reversed: Math.random() < 0.5 }))
      setDrawn(picks); setRevealed([false, false, false]); setOpenIdx(-1); setShuffling(false)
      try { localStorage.setItem(todayKey, JSON.stringify(picks)) } catch {}
      setTimeout(() => {
        if (reduce()) return
        cardRefs.forEach((r, i) => { if (r.current) gsap.from(r.current, { opacity: 0, scale: .4, y: -170, rotation: -12, duration: .6, delay: i * .14, ease: 'back.out(1.6)', clearProps: 'opacity,transform' }) })
      }, 30)
    }, 560)
  }

  const spawnBurst = (el, color) => {
    if (!el || reduce()) return
    const n = 14
    for (let k = 0; k < n; k++) {
      const p = document.createElement('span')
      p.className = 'tarot-spark'
      if (color) { p.style.background = color; p.style.boxShadow = '0 0 8px ' + color }
      el.appendChild(p)
      const ang = (Math.PI * 2 * k) / n + Math.random() * .5
      const dist = 36 + Math.random() * 54
      gsap.fromTo(p, { x: 0, y: 0, scale: .3, opacity: 1 },
        { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, scale: 0, opacity: 0, duration: .7 + Math.random() * .4, ease: 'power2.out', onComplete: () => p.remove() })
    }
  }

  const flip = (i) => {
    if (!drawn) return
    if (!revealed[i]) {
      setRevealed(p => { const n = [...p]; n[i] = true; return n })
      if (cardRefs[i].current) {
        if (!reduce()) gsap.fromTo(cardRefs[i].current, { scale: .9 }, { scale: 1, duration: .45, ease: 'back.out(2)' })
        const edge = (getComputedStyle(cardRefs[i].current).getPropertyValue('--edge') || '#fff').trim()
        spawnBurst(cardRefs[i].current, edge)
      }
    } else {
      setOpenIdx(openIdx === i ? -1 : i)
    }
  }

  const guidance = !drawn ? '' : (() => {
    const rev = drawn.filter(c => c.reversed).length
    const now = drawn[1]
    const head = rev === 0 ? '三牌皆正位，气运通透——' : rev === 3 ? '三牌皆逆位，宜守不宜攻——' : rev === 1 ? '一牌轻逆，留意暗流——' : '两牌逆位，先安内再向外——'
    const tail = now.reversed
      ? `当下「${now.name}」逆位，缓步而行、回头看看被忽略的线索。`
      : `当下「${now.name}」正位，顺势而为、把握眼前机缘。`
    return head + tail
  })()

  return <div className="tarot-page">
    <div className="tarot-stars" aria-hidden>
      {stars.map((s, k) => <i key={k} style={{ top: s.top + '%', left: s.left + '%', width: s.size + 'px', height: s.size + 'px', animationDuration: s.dur + 's', animationDelay: s.delay + 's' }} />)}
    </div>
    <div className="glass-card tarot-hero">
      <h2>🔮 塔罗占卜</h2>
      <p className="tarot-sub">静下心，想着你此刻的疑问——为「过去 · 现在 · 未来」各抽一张牌。</p>
      {!drawn
        ? <button className="glass-button btn-primary tarot-start" onClick={draw} disabled={shuffling}>
            {shuffling ? <span className="tarot-shuffle"><span className="dot" /> 洗牌中…</span> : '开始抽牌'}
          </button>
        : <>
            <div className="tarot-spread">
              {drawn.map((card, i) => {
                const th = themeOf(card)
                return (
                  <div className="tarot-col" key={i}>
                    <div className="tarot-pos">{TAROT_POSITIONS[i]}</div>
                    <div
                      className={`tarot-card ${revealed[i] ? 'flipped' : ''} ${card.reversed ? 'is-rev' : ''}`}
                      style={{ '--glow': th.glow, '--edge': th.color }}
                      onClick={() => flip(i)} ref={cardRefs[i]}
                    >
                      <div className="tarot-inner">
                        <div className="tarot-face tarot-back"><span className="tarot-back-sym">🔮</span><span className="tarot-back-hint">点击翻牌</span></div>
                        <div className="tarot-face tarot-front">
                          <span className="tarot-corner">{th.label.split(' ')[0]}</span>
                          <div className="tarot-top">
                            <span className="tarot-icon">{card.icon}</span>
                            <span className={`tarot-ori ${card.reversed ? 'rev' : ''}`}>{card.reversed ? '逆位' : '正位'}</span>
                          </div>
                          <div className="tarot-name">{card.name}</div>
                          <div className="tarot-en">{card.en}</div>
                          <div className="tarot-mean">{card.reversed ? card.reversed : card.upright}</div>
                          <div className="tarot-chips">
                            {(card.reversed ? card.keywordsRev : card.keywordsUp).slice(0, 5).map((k, ki) => (
                              <span className="tarot-chip" key={ki}>{k}</span>
                            ))}
                          </div>
                          {revealed[i] && openIdx === i && (
                            <div className="tarot-detail">
                              <div className="tarot-detail-row"><b>英文释义</b><span>{card.reversed ? card.meaningRev : card.meaningUp}</span></div>
                              <div className="tarot-detail-row"><b>💗 爱情</b><span>{card.love}</span></div>
                              <div className="tarot-detail-row"><b>💼 事业</b><span>{card.career}</span></div>
                              <div className="tarot-detail-row"><b>🌤 情绪</b><span>{card.mood}</span></div>
                              <div className="tarot-detail-row"><b>✨ 灵性</b><span>{card.spiritual}</span></div>
                              <div className="tarot-detail-row"><b>星象</b><span>{[card.element, card.planet, card.zodiac].filter(Boolean).join(' · ')}</span></div>
                              <div className="tarot-detail-row"><b>是非占</b><span>{card.reversed ? card.yesNoRev : card.yesNo}</span></div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {revealed[i] && <button className="tarot-toggle" onClick={(e) => { e.stopPropagation(); setOpenIdx(openIdx === i ? -1 : i) }}>{openIdx === i ? '收起详情 ▴' : '展开详情 ▾'}</button>}
                  </div>
                )
              })}
            </div>
            <div className="tarot-summary">
              今日牌阵：{drawn.map((c, i) => `${TAROT_POSITIONS[i]}·${c.name}${c.reversed ? '(逆)' : ''}`).join('　')}
            </div>
            {guidance && <div className="tarot-guidance">✦ {guidance}</div>}
            <div className="tarot-hint">点击卡牌翻面 · 再点「展开详情」查看英文释义与爱情 / 事业 / 情绪 / 灵性参考</div>
            <button className="glass-button tarot-redraw" onClick={() => { localStorage.removeItem(todayKey); setDrawn(null); setRevealed([false, false, false]); setOpenIdx(-1); toast.success('已重新洗牌') }}>重新洗牌</button>
          </>}
    </div>
  </div>
}

// ── App main ──
function App() {
  const [curPage,setCurPage] = useState('home')
  const [user,setUser] = useState(null)
  const [posts,setPosts] = useState([])
  const [selectedPost,setSelectedPost] = useState(null)
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState(null)
  const [activeCat,setActiveCat] = useState('all')
  const [activeForum,setActiveForum] = useState('main')
  const [searchQ,setSearchQ] = useState('')
  const [debouncedQ,setDebouncedQ] = useState('')
  const [isRegister,setIsRegister] = useState(false)
  const [showRules,setShowRules] = useState(false)
  const [activeSort,setActiveSort] = useState('latest')
  const [myStars,setMyStars] = useState({})
  const [listKey,setListKey] = useState(0)   // 仅在一次真实的帖子列表加载后 +1，避免点赞/取消星标触发整列表重播动画

  const fetchPosts = useCallback(async()=>{ setLoading(true); try{ let url=`${API_BASE}/posts/?user_id=${user?.id||''}`; if(activeCat!=='all')url+=`&category=${activeCat}`; if(activeForum!=='all')url+=`&forum=${activeForum}`; if(activeSort==='hot')url+=`&sort=hot`; if(debouncedQ.trim())url+=`&search=${encodeURIComponent(debouncedQ.trim())}`; const r=await fetch(url); if(!r.ok)throw new Error('获取帖子失败'); const data=await r.json(); setPosts(data); setListKey(k=>k+1) }catch(e){setError(e.message)}finally{setLoading(false)} },[activeCat,activeForum,activeSort,debouncedQ,user])

  useEffect(()=>{ const t=setTimeout(()=>setDebouncedQ(searchQ),300); return ()=>clearTimeout(t) },[searchQ])
  useEffect(()=>{ const el=document.querySelector('.main-content'); if(!el)return; if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return; gsap.fromTo(el,{opacity:0,y:12},{opacity:1,y:0,duration:.3,ease:'power2.out'}) },[curPage])
  // 分类标签错落入场（与帖子卡片呼应）
  useEffect(()=>{ const el=document.querySelector('.category-tabs'); if(!el)return; if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return; const ctx=gsap.context(()=>{ gsap.from('.category-tab',{opacity:0,y:10,duration:.35,ease:'power2.out',stagger:.04,clearProps:'opacity,transform'}) }); return ()=>ctx.revert(); },[activeCat])
  useEffect(()=>{ const saved=localStorage.getItem('user'); if(saved){try{const u=JSON.parse(saved); if(u&&typeof u.id==='number'){setUser(u)}else{localStorage.removeItem('user');localStorage.removeItem('token')}}catch{localStorage.removeItem('user')} } },[])
  useEffect(()=>{ if(user) fetchPosts() },[user,fetchPosts])

  // 载入当前用户的星标记录（localStorage 持久化，避免刷新后丢失高亮）
  useEffect(()=>{ if(!user){ setMyStars({}); return } const k='treehole_stars_'+user.id; try{ setMyStars(JSON.parse(localStorage.getItem(k)||'{}')) }catch{ setMyStars({}) } },[user])

  // 帖子卡片错落入场（GSAP stagger）；尊重 prefers-reduced-motion
  // 依赖 listKey 而非 posts：点赞只改 posts 数组引用，不应让整列重新闪一下
  useEffect(()=>{
    if(!posts.length) return;
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx=gsap.context(()=>{
      gsap.from('.post-card',{opacity:0,y:18,duration:.45,ease:'power2.out',stagger:.06,clearProps:'opacity,transform'});
    });
    return ()=>ctx.revert();
  },[listKey])

  const isAdmin = user && (user.role==='founder'||user.role==='ambassador')

  const getVisibleForums = () => {
    const forums = [{code:'main',name:'主论坛'}]
    if(user?.role==='founder') SCHOOLS.forEach(s=>forums.push({code:s.code,name:s.short}))
    else if(user?.role==='ambassador'){ if(user.school_id)forums.push({code:user.school_id,name:getSchoolName(user.school_id)}) }
    else if(user?.school_id) forums.push({code:user.school_id,name:getSchoolName(user.school_id)})
    return forums
  }

  const handleLogin = (data) => { localStorage.setItem('token',data.access_token); localStorage.setItem('user',JSON.stringify(data.user)); setUser(data.user); if(!localStorage.getItem('rules_accepted'))setShowRules(true) }

  // 星标切换：加星/取消星标 + 同步计数与本地高亮（Star/Karma 治理）
  const toggleStar = async (post) => {
    const uid = user?.id
    if(!uid) return
    const starred = !!myStars[post.id]
    const method = starred ? 'DELETE' : 'POST'
    try {
      const r = await fetch(`${API_BASE}/posts/${post.id}/star?user_id=${uid}`, {method})
      const d = await r.json().catch(()=>({}))
      if(!r.ok){ if(d.detail) alert(d.detail); return }
      const nowStarred = !starred
      setMyStars(s => ({...s, [post.id]: nowStarred}))
      const key = 'treehole_stars_'+uid
      try{ const saved = JSON.parse(localStorage.getItem(key)||'{}'); saved[post.id]=nowStarred; localStorage.setItem(key, JSON.stringify(saved)) }catch{}
      const sc = (typeof d.star_count==='number') ? d.star_count : (post.star_count + (nowStarred?1:-1))
      setPosts(prev => prev.map(x=>x.id===post.id?{...x, star_count:sc}:x))
      if(selectedPost && selectedPost.id===post.id) setSelectedPost(sp=>({...sp, star_count:sc}))
    } catch(e){ alert('操作失败，请重试') }
  }

  if(isRegister&&!user) return <ToastProvider><Starfield/><RegisterForm onSwitch={()=>setIsRegister(false)}/></ToastProvider>

  return <ToastProvider>
    <Starfield/>
    {showRules&&<RulesModal onClose={()=>{localStorage.setItem('rules_accepted','true');setShowRules(false)}}/>}
    {!user ? <LoginPage onLogin={handleLogin} onSwitchRegister={()=>setIsRegister(true)}/>
    : selectedPost ? <div className="app"><PostDetail post={selectedPost} user={user} onBack={()=>setSelectedPost(null)} onRefresh={fetchPosts} myStars={myStars} onToggleStar={toggleStar}/></div>
    : <div className="app">
      <nav className="glass-nav"><h2 className="nav-title">校园树洞</h2><div className="nav-links"><button className={curPage==='home'?'active':''} onClick={()=>setCurPage('home')}>首页</button><button className={curPage==='chat'?'active':''} onClick={()=>setCurPage('chat')}>聊天室</button><button className={curPage==='tarot'?'active':''} onClick={()=>setCurPage('tarot')}>🔮 塔罗</button>{isAdmin&&<button className={curPage==='admin'?'active':''} onClick={()=>setCurPage('admin')}>管理</button>}<button className={curPage==='profile'?'active':''} onClick={()=>setCurPage('profile')}>我的</button></div><div className="user-info">{isAdmin&&<span className="role-indicator">{user.role==='founder'?'👑':'🏅'}</span>}<span className="user-nickname">{user.nickname}</span></div></nav>
      <main className="main-content">
        {curPage==='home'&&<div className="home-page">
          {user&&<div className="glass-card create-post-card"><h3>发布新帖子</h3><PostForm user={user} visibleForums={getVisibleForums()} onPostCreated={fetchPosts}/></div>}
          <div className="forum-tabs"><button className={`forum-tab ${activeForum==='all'?'active':''}`} onClick={()=>setActiveForum('all')}>全部</button>{getVisibleForums().map(f=><button key={f.code} className={`forum-tab ${activeForum===f.code?'active':''}`} onClick={()=>setActiveForum(f.code)}>{f.code==='main'?'🏠':'🏫'} {f.name}</button>)}</div>
          <div className="search-bar"><input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="搜索帖子..." className="glass-input search-input"/>{searchQ&&<button className="search-clear" onClick={()=>setSearchQ('')}>✕</button>}</div>
          <div className="category-tabs"><button className={`category-tab ${activeCat==='all'?'active':''}`} onClick={()=>setActiveCat('all')}>全部</button>{CATEGORIES.map(c=><button key={c.id} className={`category-tab ${activeCat===c.id?'active':''}`} onClick={()=>setActiveCat(c.id)}><span className="category-icon">{c.icon}</span><span className="category-name">{c.name}</span></button>)}</div>
          <div className="category-tabs"><button className={`category-tab ${activeSort==='latest'?'active':''}`} onClick={()=>setActiveSort('latest')}>🕒 最新</button><button className={`category-tab ${activeSort==='hot'?'active':''}`} onClick={()=>setActiveSort('hot')}>🔥 热门</button></div>
          {loading?<SkeletonList/>:error?<ErrorBox msg={error} onRetry={fetchPosts}/>:posts.length===0?<Empty icon="📝" title="暂无帖子" desc="成为第一个发帖的人吧"/>:<div className="posts-list">{posts.map((p,i)=><div key={p.id} data-post-id={p.id} data-post-author={p.user_id} className={`glass-card post-card ${p.is_announcement?'post-announcement':''}`} onClick={()=>setSelectedPost(p)}>{p.is_announcement&&<div className="announcement-badge">📢 公告</div>}<div className="post-card-header"><span className="post-author-name-small">{p.display_name||'匿名用户'}</span>{canSeeUid(user,p)&&<span className="uid-badge">{p.user_uid}{p.hide_uid&&' (隐藏)'}</span>}<span className="post-forum-badge">{getSchoolName(p.forum)}</span><span className="post-category-mini">{p.category?p.category.split(',').map(c=>CATEGORIES.find(x=>x.id===c)?.icon||'📝').join(' '):'📝'}</span></div><h4 className="post-title">{p.title}</h4><p className="post-preview">{p.content?.slice(0,100)}{p.content?.length>100?'...':''}</p><div className="post-footer"><span className="post-time">{fmtTime(p.created_at)}</span><div className="post-actions">{(user?.id===p.user_id||user?.role==='founder'||(user?.role==='ambassador'&&p.user_school===user.school_id))&&<button onClick={e=>{e.stopPropagation();if(!confirm('确定删除？'))return;fetch(`${API_BASE}/posts/${p.id}?user_id=${user.id}`,{method:'DELETE'}).then(fetchPosts)}} className="action-btn delete-btn">🗑️</button>}<StarButton post={p} starred={!!myStars[p.id]} count={p.star_count} onToggle={toggleStar}/><span className="action-text">💬 {p.comment_count}</span></div></div></div>)}</div>}
        </div>}
        {curPage==='chat'&&<div className="chat-page"><div className="glass-card chat-container"><ChatRoom/></div></div>}
        {curPage==='tarot'&&<TarotPage/>}
        {curPage==='admin'&&isAdmin&&<AdminPage user={user}/>}
        {curPage==='profile'&&<ProfilePage user={user} setUser={setUser}/>}
      </main>
      <nav className="mobile-nav"><button className={`mobile-nav-item ${curPage==='home'?'active':''}`} onClick={()=>setCurPage('home')}><span className="nav-icon">🏠</span><span className="nav-label">首页</span></button><button className={`mobile-nav-item ${curPage==='chat'?'active':''}`} onClick={()=>setCurPage('chat')}><span className="nav-icon">💬</span><span className="nav-label">聊天</span></button>{isAdmin&&<button className={`mobile-nav-item ${curPage==='admin'?'active':''}`} onClick={()=>setCurPage('admin')}><span className="nav-icon">⚙️</span><span className="nav-label">管理</span></button>}<button className={`mobile-nav-item ${curPage==='profile'?'active':''}`} onClick={()=>setCurPage('profile')}><span className="nav-icon">👤</span><span className="nav-label">我的</span></button></nav>
    </div>}
  </ToastProvider>
}

export default App
