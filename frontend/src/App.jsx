import { useState, useEffect, useCallback, createContext, useContext, useRef, useMemo } from 'react'
import gsap from 'gsap'
import { animate } from 'animejs'
import './App.css'
import TarotOrb from './TarotOrb'
import TarotOverlay from './TarotOverlay'

// 生产走同源相对路径：后端/nginx 都在同一 origin 下托管前端，
// 这样换端口、上 nginx、上 HTTPS 域名都不用改代码，也不会触发混合内容拦截。
const API_BASE = import.meta.env.DEV ? 'http://localhost:8000/api' : '/api'
const WS_BASE = import.meta.env.DEV
  ? 'ws://localhost:8000/ws'
  : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
const AVATAR_ORIGIN = API_BASE.replace(/\/api\/?$/, '')  // 头像由后端同源托管

// 解析头像地址：data: 直出；/path 走 API 同源；null 走骰子人占位
const avatarUrl = (a) => {
  if (!a) return null
  if (a.startsWith('http') || a.startsWith('data:')) return a
  return AVATAR_ORIGIN + a
}
const fallbackAvatar = (seed) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed || 'treehole')}`
const Avatar = ({ src, seed, className = '' }) => (
  <img className={`avatar-img ${className}`} src={avatarUrl(src) || fallbackAvatar(seed)} alt="" />
)

// 帖子图片网格（卡片与详情共用）；点击图片不冒泡，避免误触卡片跳转
const PostImages = ({ images }) => (images && images.length) ? (
  <div className="post-imgs">{images.map((src, i) => <img key={i} src={src} alt="" loading="lazy" onClick={e => e.stopPropagation()} />)}</div>
) : null

// ── 统一请求层：身份一律由 JWT 承载，不再用 ?user_id= 自报家门 ──
const getToken = () => localStorage.getItem('token') || ''
let onUnauthorized = null  // 由 App 注册，401 时统一登出
const setUnauthorizedHandler = fn => { onUnauthorized = fn }

async function apiFetch(path, opts = {}) {
  const headers = { ...(opts.headers || {}) }
  const _isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData
  if (opts.body && !headers['Content-Type'] && !_isForm) headers['Content-Type'] = 'application/json'
  const tk = getToken()
  if (tk) headers['Authorization'] = 'Bearer ' + tk
  const r = await fetch(path.startsWith('http') ? path : API_BASE + path, { ...opts, headers })
  // token 过期/被吊销：清理本地身份，回到登录页
  if (r.status === 401 && onUnauthorized) onUnauthorized()
  return r
}

// 后端的校验错误是数组结构，直接 toString 会变成 [object Object]
async function errMsg(r, fallback) {
  const d = await r.json().catch(() => ({}))
  if (Array.isArray(d.detail)) return d.detail.map(x => x.msg || (x.loc || []).join('.')).join('；')
  return typeof d.detail === 'string' ? d.detail : fallback
}

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

// ── 动效工具 ──
const prefersReduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

// 爱心/星光粒子爆裂（GSAP：用自身 rAF 引擎，headless 与真实浏览器表现一致）──
function spawnBurst(anchor, glyph, count = 7) {
  if (!anchor || prefersReduced()) return
  const rect = anchor.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span')
    s.textContent = glyph
    s.className = 'fx-burst'
    s.style.left = cx + 'px'
    s.style.top = cy + 'px'
    document.body.appendChild(s)
    const a = (-90 + (i / (count - 1) - 0.5) * 140) * Math.PI / 180
    const dist = 34 + Math.random() * 28
    gsap.to(s, {
      x: Math.cos(a) * dist,
      y: Math.sin(a) * dist,
      scale: 0.2,
      opacity: 0,
      duration: 0.7,
      ease: 'expo.out',
      onComplete: () => s.remove()
    })
  }
}

// 浮起的 +1（GSAP）
function spawnFloatPlus(anchor) {
  if (!anchor || prefersReduced()) return
  const rect = anchor.getBoundingClientRect()
  const el = document.createElement('span')
  el.textContent = '+1'
  el.className = 'fx-float-plus'
  el.style.left = (rect.left + rect.width / 2) + 'px'
  el.style.top = (rect.top + rect.height / 2) + 'px'
  document.body.appendChild(el)
  gsap.to(el, { y: -30, opacity: 0, duration: 0.8, ease: 'power1.out', onComplete: () => el.remove() })
}

// 数字滚动组件（Anime.js 插值文本，避免与 React 受控文本冲突）
function RollNumber({ value, className }) {
  const ref = useRef(null)
  const prev = useRef(value)
  useEffect(() => {
    const from = prev.current, to = value
    prev.current = value
    if (from === to || !ref.current) return
    if (prefersReduced()) { ref.current.textContent = String(to); return }
    const obj = { v: from }
    animate(obj, { v: to, duration: 450, ease: 'outQuad',
      onUpdate: () => { if (ref.current) ref.current.textContent = String(Math.round(obj.v)) } })
  }, [value])
  return <span ref={ref} className={className}>{value}</span>
}

function canSeeAllForums(u) { return u && (u.role==='founder'||u.role==='ambassador') }
function canSeeUid(viewer, post) { if(!viewer||!post) return false; if(viewer.role==='founder') return true; if(viewer.role==='ambassador') return post.user_school===viewer.school_id || !post.hide_uid; return !post.hide_uid }

// ── Toast（上下文在 ToastContext.jsx）──
import { ToastProvider, useToast } from './ToastContext'

// ── Shared components ──
const Spinner = () => <div className="spinner-container"><div className="spinner"/></div>
const SkeletonList = () => <div className="posts-list">{[1,2,3].map(i=><div key={i} className="skeleton-card"><div className="skeleton skeleton-title"/><div className="skeleton skeleton-text"/><div className="skeleton skeleton-text" style={{width:'40%'}}/></div>)}</div>
const Empty = ({icon,title,desc}) => <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{desc}</p></div>
const ErrorBox = ({msg,onRetry}) => <div className="error-state"><span className="error-icon">!</span><h3>出错了</h3><p>{msg}</p>{onRetry&&<button onClick={onRetry} className="retry-btn">重试</button>}</div>

// ── AnimatedModal（GSAP 进出场：遮罩淡入 + 卡片缩放回弹；关闭时反向回弹再卸载）──
const AnimatedModal = ({ onClose, className = '', children }) => {
  const overlayRef = useRef(null)
  const cardRef = useRef(null)
  const closing = useRef(false)
  const requestClose = useCallback(() => {
    if (closing.current) return
    closing.current = true
    if (prefersReduced()) { onClose(); return }
    const tl = gsap.timeline({ onComplete: onClose })
    tl.to(cardRef.current, { opacity: 0, scale: 0.94, y: 10, duration: 0.18, ease: 'power2.in' })
      .to(overlayRef.current, { opacity: 0, duration: 0.18 }, '<')
  }, [onClose])
  useEffect(() => {
    if (prefersReduced()) return
    const ctx = gsap.context(() => {
      gsap.set(overlayRef.current, { opacity: 0 })
      gsap.set(cardRef.current, { opacity: 0, scale: 0.92, y: 14 })
      const tl = gsap.timeline()
      tl.to(overlayRef.current, { opacity: 1, duration: 0.2, ease: 'power1.out' })
        .to(cardRef.current, { opacity: 1, scale: 1, y: 0, duration: 0.34, ease: 'back.out(1.5)' }, '<')
    })
    return () => ctx.revert()
  }, [])
  return (
    <div className="modal-overlay" ref={overlayRef} onClick={requestClose}>
      <div className={`glass-card modal-card ${className}`} ref={cardRef} onClick={e => e.stopPropagation()}>
        {typeof children === 'function' ? children({ requestClose }) : children}
      </div>
    </div>
  )
}

// ── ReportModal ──
const ReportModal = ({type,tid,onClose}) => {
  const [reason,setReason]=useState(''); const [s,setS]=useState(false); const toast=useToast()
  const submit = async () => { if(!reason.trim()) return; setS(true)
    try { const r=await apiFetch(`/reports/`,{method:'POST',body:JSON.stringify({target_type:type,target_id:tid,reason})}); if(!r.ok) throw new Error(await errMsg(r,'举报失败')); toast.success('举报已提交'); onClose() }
    catch(e){toast.error(e.message)} finally{setS(false)} }
  return <AnimatedModal onClose={onClose}>
    {({ requestClose }) => (<>
      <h3>举报内容</h3>
      <textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="请描述举报原因..." className="glass-textarea" rows={4}/>
      <div className="modal-actions"><button className="glass-button btn-secondary" onClick={requestClose}>取消</button><button className="glass-button btn-primary" onClick={submit} disabled={s||!reason.trim()}>{s?'提交中...':'提交举报'}</button></div>
    </>)}
  </AnimatedModal>
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
    try{const r=await apiFetch(`/users/login`,{method:'POST',body:JSON.stringify({username:u,password:p})});if(!r.ok)throw new Error(await errMsg(r,'登录失败'));onLogin(await r.json())}catch(e){alert(e.message)}finally{setLoading(false)}}
  return <div className="login-page"><div className="login-card-glass"><div className="login-header"><span className="login-icon">🪵</span><h1>校园树洞</h1><p>匿名表达，自由交流</p></div><form onSubmit={submit} className="login-form"><input ref={nameRef} type="text" placeholder="用户名" className="login-input" required/><input ref={passRef} type="password" placeholder="密码（可选）" className="login-input"/><button type="submit" className="login-btn" disabled={loading}>{loading?'进入中...':'进入社区'}</button></form><p className="switch-link">没有账号？<button onClick={onSwitchRegister}>去注册</button></p></div></div>
}

// ── RegisterForm ──
const RegisterForm = ({onSwitch}) => {
  const toast=useToast(); const [f,setF]=useState({username:'',password:'',nickname:'',school_id:'JSKS',enrollment_year:2024,class_number:1,student_number:1}); const [loading,setLoading]=useState(false); const [showPick,setShowPick]=useState(false);
  const submit=async(e)=>{e.preventDefault();if(!f.username.trim())return;setLoading(true);
    try{const r=await apiFetch(`/users/`,{method:'POST',body:JSON.stringify({username:f.username,nickname:f.nickname||genNick(),password:f.password||undefined,school_id:f.school_id,enrollment_year:f.enrollment_year,class_number:f.class_number,student_number:f.student_number})});if(!r.ok)throw new Error(await errMsg(r,'注册失败'));const data=await r.json();localStorage.setItem('token',data.access_token);localStorage.setItem('user',JSON.stringify(data.user));toast.success('注册成功');window.location.reload()}catch(e){toast.error(e.message)}finally{setLoading(false)}}
  const preview=`${f.school_id}${f.enrollment_year}${String(f.class_number).padStart(2,'0')}${String(f.student_number).padStart(2,'0')}`; const sel=SCHOOLS.find(s=>s.code===f.school_id);
  return <div className="register-page"><div className="login-card-glass register-card"><div className="login-header"><span className="login-icon">🪵</span><h1>注册账号</h1><p>填写入学信息，系统将自动生成你的 UID</p></div><form onSubmit={submit} className="login-form"><input value={f.username} onChange={e=>setF({...f,username:e.target.value})} placeholder="用户名（登录用）" className="login-input" required/><input value={f.password} onChange={e=>setF({...f,password:e.target.value})} placeholder="密码（可选）" className="login-input"/><input value={f.nickname} onChange={e=>setF({...f,nickname:e.target.value})} placeholder="账户名（可随时修改）" className="login-input"/><div className="uid-section-glass"><h4>入学信息</h4><div className="custom-select" onClick={()=>setShowPick(!showPick)}><span className="custom-select-label">学校</span><span className="custom-select-value">{sel?.name||'选择学校'}</span><span className="custom-select-arrow">▾</span>{showPick&&<div className="custom-select-dropdown">{SCHOOLS.map(s=><div key={s.code} className={`custom-select-option ${f.school_id===s.code?'active':''}`} onClick={e=>{e.stopPropagation();setF({...f,school_id:s.code});setShowPick(false)}}><span>{s.name}</span><span className="custom-select-code">{s.code}</span></div>)}</div>}</div><div className="uid-inputs" style={{gridTemplateColumns:'1fr 1fr 1fr',marginTop:'.75rem'}}><div className="uid-input-group"><label>入学年份</label><input type="number" value={f.enrollment_year} onChange={e=>setF({...f,enrollment_year:parseInt(e.target.value)||2024})} className="login-input" min="2020" max="2030"/></div><div className="uid-input-group"><label>班级</label><input type="number" value={f.class_number} onChange={e=>setF({...f,class_number:parseInt(e.target.value)||1})} className="login-input" min="1" max="99"/></div><div className="uid-input-group"><label>学号</label><input type="number" value={f.student_number} onChange={e=>setF({...f,student_number:parseInt(e.target.value)||1})} className="login-input" min="1" max="99"/></div></div><div className="uid-preview"><span>你的 UID 将是：</span><span className="uid-badge-glass">{preview}</span></div></div><button type="submit" className="login-btn" disabled={loading}>{loading?'注册中...':'注册'}</button></form><p className="switch-link">已有账号？<button onClick={onSwitch}>去登录</button></p></div></div>
}

// ── PostForm ──
const PostForm = ({user,visibleForums,onPostCreated}) => {
  const toast=useToast(); const tRef=useRef(null),cRef=useRef(null);   const [forum,setForum]=useState('main');
  const [cats,setCats]=useState(['general']); const [submitting,setSubmitting]=useState(false);
  const [tags,setTags]=useState(''); const [tagInput,setTagInput]=useState('');
  const [imgs,setImgs]=useState([]); const [uploading,setUploading]=useState(false);
  const pickImgs = (e) => { const files=Array.from(e.target.files||[]); const room=9-imgs.length;
    const next=files.slice(0,room).map(f=>({file:f,url:URL.createObjectURL(f)})); setImgs(prev=>[...prev,...next]); e.target.value='' }
  const removeImg = (i) => setImgs(prev=>{ const n=[...prev]; if(n[i].url)URL.revokeObjectURL(n[i].url); n.splice(i,1); return n })
  const isAdmin=user?.role==='founder'||user?.role==='ambassador';
  const [isAnon,setIsAnon]=useState(isAdmin?false:true); const [hideUid,setHideUid]=useState(false);
  // 标签以逗号/空格/回车分隔，最多 5 个
  const addTag = (raw) => { const t=raw.trim(); if(!t)return; setTags(prev=>{ const arr=prev?prev.split(',').map(x=>x.trim()).filter(Boolean):[]; if(arr.length>=5||arr.includes(t))return prev; return [...arr,t].join(',') }); setTagInput('') }
  const removeTag = (t) => setTags(prev=>{ const arr=(prev||'').split(',').map(x=>x.trim()).filter(Boolean).filter(x=>x!==t); return arr.join(',') })
  const submit=async e=>{e.preventDefault(); if(!user?.id){toast.error('登录已失效，请重新登录');return;} const title=tRef.current?.value?.trim(),content=cRef.current?.value?.trim(); if(!title||!content)return; setSubmitting(true);
    const dn=isAdmin?user.nickname:(isAnon?genNick():user.nickname);
    const hu=isAdmin?false:(isAnon||hideUid);
    let imageUrls=[];
    if(imgs.length){ setUploading(true); try{ const fd=new FormData(); imgs.forEach(it=>fd.append('files',it.file));
        const ur=await apiFetch(`/uploads/`,{method:'POST',body:fd}); if(!ur.ok)throw new Error(await errMsg(ur,'图片上传失败')); imageUrls=(await ur.json()).urls||[] }
      catch(err){ setUploading(false); toast.error(err.message||'图片上传失败'); return } setUploading(false) }
    try{const r=await apiFetch(`/posts/`,{method:'POST',body:JSON.stringify({title,content,category:cats.join(','),forum,tags:tags||null,display_name:dn,hide_uid:hu,images:imageUrls.length?imageUrls:null,is_announcement:false})});if(!r.ok)throw new Error(await errMsg(r,'发布失败'));tRef.current.value='';cRef.current.value='';setCats(['general']);setHideUid(false);setTags('');setTagInput('');setImgs([]);onPostCreated();toast.success('发布成功')}catch(e){toast.error((e&&e.name==='TypeError')?'网络异常：无法连接服务器，请确认后端已启动于 localhost:8000':(e&&e.message||'发布失败'))}finally{setSubmitting(false)}}
  return <div className="glass-card create-post-card"><h3>发布新帖子</h3><form onSubmit={submit} className="create-post-form"><input ref={tRef} type="text" placeholder="帖子标题" className="glass-input" required/><textarea ref={cRef} placeholder="分享你的想法..." className="glass-textarea" required rows={4}/><div className="forum-select"><label className="forum-label">发布到：</label><div className="forum-options">{visibleForums.map(f=><button key={f.code} type="button" className={`forum-option ${forum===f.code?'active':''}`} onClick={()=>setForum(f.code)}>{f.code==='main'?'🏠 ':'🏫 '}{f.name}</button>)}</div></div>{!isAdmin&&<div className="post-options"><label className="checkbox-label"><input type="checkbox" checked={isAnon} onChange={e=>setIsAnon(e.target.checked)}/><span>匿名发布</span></label><label className="checkbox-label"><input type="checkbox" checked={hideUid} onChange={e=>setHideUid(e.target.checked)}/><span>隐藏 UID</span></label></div>}<div className="category-select">{CATEGORIES.map(c=><button key={c.id} type="button" className={`category-option ${cats.includes(c.id)?'active':''}`} onClick={()=>setCats(p=>p.includes(c.id)?p.filter(x=>x!==c.id):[...p,c.id])}>{c.icon} {c.name}</button>)}</div><div className="tag-input-row"><div className="tag-chips">{tags?tags.split(',').map(x=>x.trim()).filter(Boolean).map(t=><span key={t} className="tag-chip" onClick={()=>removeTag(t)}>#{t} ✕</span>):null}<input value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'||e.key===','||e.key===' '){e.preventDefault();addTag(tagInput)}else if(e.key==='Backspace'&&!tagInput&&tags){const arr=tags.split(',').map(x=>x.trim()).filter(Boolean);arr.pop();setTags(arr.join(','))}}} placeholder={tags?'':'添加标签（回车确认，最多5个）'} className="glass-input tag-input"/></div></div><div className="img-upload-row"><label className="img-pick-btn"><input type="file" accept="image/*" multiple onChange={pickImgs} hidden/>📷 添加图片{imgs.length?` (${imgs.length}/9)`:''}</label>{imgs.length>0&&<div className="img-thumbs">{imgs.map((it,i)=><div key={i} className="img-thumb"><img src={it.url} alt=""/><button type="button" className="img-thumb-del" onClick={()=>removeImg(i)}>✕</button></div>)}</div>}</div><button type="submit" className="glass-button submit-btn btn-primary" disabled={submitting||uploading}>{submitting?'发布中...':uploading?'图片上传中...':'发布'}</button></form></div>
}

// ── StarButton（星标：GSAP 弹跳 + Anime.js 星光粒子爆裂 + 数字滚动）──
const StarButton = ({post, starred, count, onToggle}) => {
  const ref = useRef(null)
  const handle = (e) => {
    e.stopPropagation()
    if (ref.current && !prefersReduced()) {
      gsap.fromTo(ref.current, {scale:1}, {scale:1.3, duration:.18, ease:'back.out(3)', yoyo:true, repeat:1, clearProps:'transform'})
      if (!starred) { spawnBurst(ref.current, '⭐', 7); spawnFloatPlus(ref.current) }
    }
    onToggle(post)
  }
  return <button ref={ref} onClick={handle} className={`action-btn star-btn ${starred?'starred':''}`}>{starred?'⭐':'☆'} <RollNumber value={count||0} className="action-count"/></button>
}

// ── LikeButton（点赞：GSAP 弹跳 + Anime.js 爱心粒子爆裂 + 数字滚动）──
const LikeButton = ({post, liked, count, onToggle}) => {
  const ref = useRef(null)
  const handle = (e) => {
    e.stopPropagation()
    if (ref.current && !prefersReduced()) {
      gsap.fromTo(ref.current, {scale:1}, {scale:1.3, duration:.18, ease:'back.out(3)', yoyo:true, repeat:1, clearProps:'transform'})
      if (!liked) { spawnBurst(ref.current, '❤️', 7); spawnFloatPlus(ref.current) }
    }
    onToggle(post)
  }
  return <button ref={ref} onClick={handle} className={`action-btn like-btn ${liked?'liked':''}`}>{liked?'❤️':'🤍'} <RollNumber value={count||0} className="action-count"/></button>
}

// ── PostDetail ──
const PostDetail = ({post,user,onBack,onRefresh,myStars,onToggleStar,myLikes,onToggleLike}) => {
  const toast=useToast(); const [comments,setComments]=useState([]); const [nc,setNc]=useState(''); const [loading,setLoading]=useState(false); const [err,setErr]=useState(null); const [submitting,setSubmitting]=useState(false); const [showR,setShowR]=useState(false); const [rt,setRt]=useState({type:'post',id:0});
  const isAdmin=user?.role==='founder'||user?.role==='ambassador';
  const rootRef=useRef(null); const closingRef=useRef(false);
  const close=useCallback(()=>{ if(closingRef.current)return; closingRef.current=true; if(prefersReduced()||!rootRef.current){onBack();return} gsap.to(rootRef.current,{opacity:0,y:20,duration:.22,ease:'power2.in',onComplete:onBack}) },[onBack]);
  const fc=useCallback(async()=>{setLoading(true);try{const r=await apiFetch(`/posts/${post.id}/comments`);if(!r.ok)throw new Error('获取评论失败');setComments(await r.json())}catch(e){setErr(e.message)}finally{setLoading(false)}},[post.id]);
  useEffect(()=>{fc()},[fc]);
  useEffect(()=>{ if(!prefersReduced()&&rootRef.current) gsap.from(rootRef.current,{opacity:0,y:20,duration:.3,ease:'power2.out'}) },[]);
  useEffect(()=>{const h=e=>{if(e.key==='Escape')close()};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h)},[close]);
  const submitComment=async e=>{e.preventDefault();if(!nc.trim())return;setSubmitting(true);const dn=user?.role==='founder'||user?.role==='ambassador'?user.nickname:genNick();try{const r=await apiFetch(`/posts/${post.id}/comments`,{method:'POST',body:JSON.stringify({content:nc,display_name:dn})});if(!r.ok)throw new Error(await errMsg(r,'评论失败'));setNc('');fc();onRefresh?.();toast.success('评论成功')}catch(e){toast.error(e.message)}finally{setSubmitting(false)}}
  return <div className="post-detail" ref={rootRef}><button className="back-btn" onClick={close}>← 返回</button><div className="glass-card post-detail-card"><div className="post-header"><Avatar src={post.author_avatar} seed={post.display_name} className="post-author-avatar" /><span className="post-author-name">{post.display_name||'匿名用户'}</span>{canSeeUid(user,post)&&<span className="uid-badge">{post.user_uid}{post.hide_uid&&' (隐藏)'}</span>}<span className="post-category-badge">{post.category?post.category.split(',').map(c=>{const x=CATEGORIES.find(y=>y.id===c);return x?`${x.icon} ${x.name}`:'📝 综合'}).join(' · '):'📝 综合'}</span></div><h2>{post.title}</h2><p className="post-content">{post.content}</p>{post.images&&post.images.length>0&&<PostImages images={post.images}/>}<div className="post-meta"><span className="post-time">{fmtTime(post.created_at)}</span><div className="post-actions"><LikeButton post={post} liked={!!myLikes[post.id]} count={post.like_count} onToggle={onToggleLike}/><StarButton post={post} starred={!!myStars[post.id]} count={post.star_count} onToggle={onToggleStar}/><button onClick={()=>{setRt({type:'post',id:post.id});setShowR(true)}} className="action-btn">🚩</button>{(user?.id===post.user_id||isAdmin)&&<button onClick={async()=>{if(!confirm('确定删除？'))return;const r=await apiFetch(`/posts/${post.id}`,{method:'DELETE'});if(!r.ok){toast.error(await errMsg(r,'删除失败'));return}toast.success('已删除');onBack()}} className="action-btn delete-btn">🗑️</button>}</div></div></div><div className="glass-card comments-section"><h3>评论 ({comments.length})</h3><form onSubmit={submitComment} className="comment-form"><textarea value={nc} onChange={e=>setNc(e.target.value)} placeholder="说点什么..." className="comment-input" rows={3}/><button type="submit" className="glass-button submit-btn btn-primary" disabled={submitting||!nc.trim()}>{submitting?'发送中...':'发表评论'}</button></form>{loading?<Spinner/>:err?<ErrorBox msg={err} onRetry={fc}/>:comments.length===0?<Empty icon="💬" title="暂无评论" desc="成为第一个评论的人"/>:<div className="comments-list">{comments.map(c=><div key={c.id} className="glass-card comment-card"><div className="comment-header"><div className="comment-author-info"><Avatar src={c.author_avatar} seed={c.display_name} className="comment-author-avatar" /><span className="comment-author">{c.display_name||'匿名用户'}</span>{canSeeUid(user,c)&&<span className="uid-badge">{c.user_uid}</span>}</div><div className="comment-actions"><span className="comment-time">{fmtTime(c.created_at)}</span>{(user?.id===c.user_id||isAdmin)&&<button onClick={async()=>{const r=await apiFetch(`/posts/${post.id}/comments/${c.id}`,{method:'DELETE'});if(!r.ok){toast.error(await errMsg(r,'删除失败'));return}fc();onRefresh?.()}} className="action-btn delete-btn">🗑️</button>}<button onClick={()=>{setRt({type:'comment',id:c.id});setShowR(true)}} className="action-btn">🚩</button></div></div><p className="comment-content">{c.content}</p></div>)}</div>}</div>{showR&&<ReportModal type={rt.type} tid={rt.id} onClose={()=>setShowR(false)}/>}</div>
}

// ── RulesModal ──
const RulesModal = ({onClose}) => <AnimatedModal onClose={onClose} className="rules-modal login-rules-modal">
  {({ requestClose }) => (<>
    <h2>📜 社区规则</h2>
    <p className="rules-subtitle">欢迎来到校园树洞！请仔细阅读以下规则：</p>
    <div className="rules-content"><p><strong>1. 友善交流</strong> — 尊重他人，禁止辱骂、人身攻击。</p><p><strong>2. 保护隐私</strong> — 请勿公开他人真实姓名、联系方式等隐私信息。</p><p><strong>3. 合理发言</strong> — 禁止发布违法、色情、暴力等不良信息。</p><p><strong>4. 举报机制</strong> — 发现违规内容请及时举报，管理员会尽快处理。</p><p><strong>5. 共同维护</strong> — 让我们一起营造温暖、安全的校园社区。</p></div>
    <button className="glass-button btn-primary" onClick={requestClose}>我已阅读，开始使用</button>
  </>)}
</AnimatedModal>

// ── ChatRoom ──
const fmtChatTime = ts => { if(!ts) return ''; const d = new Date(String(ts).includes('Z')||String(ts).includes('+')?ts:ts+'Z'); return isNaN(d) ? '' : d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}) }

const ChatRoom = () => {
  const [msgs,setMsgs] = useState([]); const [input,setInput] = useState('')
  const [status,setStatus] = useState('connecting')   // connecting | online | offline | unauthorized
  const [errTip,setErrTip] = useState('')
  const wsRef = useRef(null); const endRef = useRef(null); const aliveRef = useRef(true); const retryRef = useRef(0); const listRef = useRef(null)
  const usr = JSON.parse(localStorage.getItem('user')||'{}')

  useEffect(()=>{
    aliveRef.current = true
    let timer = null
    const connect = () => {
      if(!aliveRef.current) return
      setStatus('connecting')
      // 浏览器 WebSocket 不能带 header，token 只能走查询参数
      const s = new WebSocket(`${WS_BASE}/chat/main?token=${encodeURIComponent(getToken())}`)
      wsRef.current = s
      s.onopen = () => { retryRef.current = 0; setStatus('online') }
      s.onmessage = e => { try{ const m=JSON.parse(e.data); if(!m)return; if(m.type==='error'){ setErrTip(m.detail||'发送失败'); return } setMsgs(p=>p.some(x=>x.id&&x.id===m.id)?p:[...p,m]) }catch{} }
      s.onclose = ev => {
        if(!aliveRef.current) return
        // 4401 = 服务端拒绝鉴权，重连再多次也没用，直接提示重新登录
        if(ev?.code === 4401){ setStatus('unauthorized'); return }
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
    // 身份由服务端从 token 解析，客户端只发内容
    setErrTip('')
    s.send(JSON.stringify({content:input}))
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
    {!online && <div className="chat-status">{status==='connecting'?'连接中…':status==='unauthorized'?'登录已失效，请重新登录后再进入聊天室':'已断开，正在重连…'}</div>}
    {errTip && <div className="chat-status">{errTip}</div>}
    <div className="chat-messages" ref={listRef}>
      {msgs.length===0
        ? <Empty icon="💬" title="暂无消息" desc="来说点什么吧"/>
        : msgs.map((m,i)=><div key={m.id ?? `local-${i}`} className={`chat-message ${m.user_id===usr.id?'own':''}`}>
            <Avatar src={m.avatar} seed={m.nickname} className="chat-avatar" />
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
  const toast=useToast(); const [stats,setStats]=useState(null); const [ulist,setUlist]=useState([]); const [reports,setReports]=useState([]); const [plist,setPlist]=useState([]); const [psearch,setPsearch]=useState(''); const [tab,setTab]=useState('stats'); const [loading,setLoading]=useState(true); const [muteMins,setMuteMins]=useState(60); const [reportStatus,setReportStatus]=useState('')
  const loadReports = useCallback(async()=>{ try{ const r=await apiFetch('/admin/reports'+(reportStatus?`?status=${reportStatus}`:'')); if(r.ok)setReports(await r.json()) }catch{} },[reportStatus])
  useEffect(()=>{ const f=async()=>{ setLoading(true); try{ const [sr,ur,pr]=await Promise.all([apiFetch(`/admin/stats`),apiFetch(`/admin/users`),apiFetch(`/admin/posts`)]); if(sr.ok)setStats(await sr.json()); if(ur.ok)setUlist(await ur.json()); if(pr.ok)setPlist(await pr.json()); await loadReports() }catch(e){toast.error('加载失败')} finally{setLoading(false)} }; f() },[loadReports])
  useEffect(()=>{ if(tab==='reports') loadReports() },[tab,loadReports])
  const updReport = async(id,st,action='none')=>{ try{ const url=`/admin/reports/${id}/status?status=${st}`+(action!=='none'?`&action=${action}`:''); const r=await apiFetch(url,{method:'PUT'}); if(!r.ok)throw new Error(await errMsg(r,'更新失败')); setReports(rs=>rs.map(x=>x.id===id?{...x,status:st}:x)); toast.success(action!=='none'?'已删除内容并处理举报':'状态已更新') }catch(e){toast.error(e.message||'更新失败')} }
  const delPost = async(id)=>{ if(!confirm('确认删除该帖子？此操作不可恢复'))return; try{ const r=await apiFetch(`/posts/${id}`,{method:'DELETE'}); if(!r.ok)throw new Error(await errMsg(r,'删除失败')); setPlist(ps=>ps.filter(x=>x.id!==id)); toast.success('帖子已删除') }catch(e){toast.error(e.message)} }
  // 管理范围：founder 管全部；大使只管本校；管理员（founder/ambassador）自身不可被操作
  const isAdminRole = user.role==='founder'||user.role==='ambassador'
  const canManage = (u)=> isAdminRole && u.role==='student' && (user.role==='founder' || u.school_id===user.school_id)
  const fmtMute = (iso)=> iso? new Date(iso).toLocaleString('zh-CN',{hour12:false}) : null
  const isMutedNow = (iso)=>{ if(!iso) return false; return new Date(iso).getTime() > Date.now() }
  const setMuted = (id,iso)=> setUlist(us=>us.map(x=>x.id===id?{...x,muted_until:iso}:x))
  const muteUser = async(u)=>{ try{ const r=await apiFetch(`/admin/users/${u.id}/mute?minutes=${muteMins}`,{method:'PUT'}); if(!r.ok)throw new Error(await errMsg(r,'禁言失败')); const d=await r.json(); setMuted(u.id,d.muted_until); toast.success(`已禁言 ${fmtMute(d.muted_until)} 解禁`) }catch(e){toast.error(e.message)} }
  const unmuteUser = async(u)=>{ try{ const r=await apiFetch(`/admin/users/${u.id}/unmute`,{method:'PUT'}); if(!r.ok)throw new Error(await errMsg(r,'解禁失败')); setMuted(u.id,null); toast.success('已解除禁言') }catch(e){toast.error(e.message)} }
  const banUser = async(u)=>{ if(!confirm(`确认封禁 ${u.nickname}？该用户将无法再登录`))return; try{ const r=await apiFetch(`/admin/users/${u.id}/ban`,{method:'PUT'}); if(!r.ok)throw new Error(await errMsg(r,'封禁失败')); const d=await r.json(); setUlist(us=>us.map(x=>x.id===u.id?{...x,banned:d.banned}:x)); toast.success('已封禁该用户') }catch(e){toast.error(e.message)} }
  const unbanUser = async(u)=>{ try{ const r=await apiFetch(`/admin/users/${u.id}/unban`,{method:'PUT'}); if(!r.ok)throw new Error(await errMsg(r,'解封失败')); const d=await r.json(); setUlist(us=>us.map(x=>x.id===u.id?{...x,banned:d.banned}:x)); toast.success('已解封') }catch(e){toast.error(e.message)} }
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
      <div className="admin-user-info"><span className="uid-badge">{u.uid||'------'}</span><span className="admin-username">@{u.username}</span><span className="admin-nickname">{u.nickname}</span>{u.role==='founder'&&<span className="role-badge founder">创始人</span>}{u.role==='ambassador'&&<span className="role-badge ambassador">大使</span>}{u.banned&&<span className="role-badge banned">已封禁</span>}<span>{getSchoolName(u.school_id)}</span></div>
      <div className="admin-user-meta"><span>匿名: {u.is_anonymous?'是':'否'}</span><span>注册: {u.created_at?new Date(u.created_at).toLocaleDateString('zh-CN'):'-'}</span></div>
      {isMutedNow(u.muted_until)&&<div className="mute-status">已禁言至 {fmtMute(u.muted_until)}</div>}
      {u.banned&&<div className="mute-status banned-status">已封禁（无法登录）</div>}
      {canManage(u)&&<div className="admin-user-actions">
        {isMutedNow(u.muted_until)
          ? <button className="save-btn" onClick={()=>unmuteUser(u)}>解除禁言</button>
          : <button className="danger-btn" onClick={()=>muteUser(u)}>禁言</button>}
        {u.banned
          ? <button className="save-btn" onClick={()=>unbanUser(u)}>解封</button>
          : <button className="danger-btn" onClick={()=>banUser(u)}>封禁</button>}
      </div>}
    </div>)}
  </div>}
  {tab==='reports'&&<div className="admin-list"><div className="report-filter-row">{[{v:'',t:'全部'},{v:'pending',t:'待处理'},{v:'reviewed',t:'已审核'},{v:'resolved',t:'已解决'}].map(o=><button key={o.v||'all'} className={`report-filter-chip ${reportStatus===o.v?'active':''}`} onClick={()=>setReportStatus(o.v)}>{o.t}</button>)}</div>{reports.length===0?<Empty icon="✅" title="暂无举报" desc="一切正常"/>:reports.map(r=><div key={r.id} className="glass-card admin-report-card"><div className="report-header"><span className={`report-status ${r.status}`}>{r.status==='pending'?'待处理':r.status==='reviewed'?'已审核':'已解决'}</span><span className="report-time">{r.created_at?new Date(r.created_at).toLocaleString('zh-CN'):'-'}</span></div><div className="report-body"><p><strong>举报者:</strong> {r.reporter_nickname} ({r.reporter_uid})</p><p><strong>目标:</strong> {r.target_type==='post'?'帖子':'评论'} #{r.target_id}</p><p><strong>原因:</strong> {r.reason}</p></div>{r.status==='pending'&&<div className="report-actions"><button className="save-btn" onClick={()=>updReport(r.id,'reviewed')}>标记已审核</button><button className="save-btn" onClick={()=>updReport(r.id,'resolved')}>标记已解决</button>{(r.target_type==='post'||r.target_type==='comment')&&<button className="danger-btn" onClick={()=>updReport(r.id,'resolved',r.target_type==='post'?'delete_post':'delete_comment')}>删除内容并解决</button>}</div>}</div>)}</div>}
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
  const save=async()=>{ if(!nick?.trim()){toast.error('账户名不能为空');return}
    try{ const body={nickname:nick.trim(),is_anonymous:isAdmin?false:isAnon}; if(pw?.trim())body.password=pw.trim()
      const r=await apiFetch(`/users/${user.id}`,{method:'PUT',body:JSON.stringify(body)})
      if(!r.ok)throw new Error(await errMsg(r,'保存失败'))
      const u=await r.json(); setUser(u); localStorage.setItem('user',JSON.stringify(u)); setPw(''); toast.success(pw?.trim()?'保存成功，密码已更新':'保存成功') }catch(e){toast.error(e.message)} }
  return <div className="profile-page"><div className="glass-card profile-card"><label className="avatar-upload"><img src={avatarUrl(user.avatar) || fallbackAvatar(user.username)} alt="头像"/><div className="avatar-upload-overlay">📷</div><input type="file" accept="image/*" onChange={async e=>{const f=e.target.files[0];if(!f)return;const fd=new FormData();fd.append('file',f);try{const r=await apiFetch(`/users/${user.id}/avatar`,{method:'POST',body:fd});if(!r.ok)throw new Error(await errMsg(r,'头像更新失败'));const u=await r.json();u.avatar=(u.avatar||'')+'?t='+Date.now();setUser(u);localStorage.setItem('user',JSON.stringify(u));toast.success('头像已更新')}catch(err){toast.error(err.message||'头像更新失败')}}}/></label><div className="profile-info"><h3>{user.nickname}</h3><p className="profile-username">@{user.username}</p><span className="uid-badge">UID: {user.uid}</span>{user.role==='founder'&&<span className="role-badge founder">创始人</span>}{user.role==='ambassador'&&<span className="role-badge ambassador">大使</span>}<div className="profile-stats"><div className="stat-item"><span className="stat-value">{user.star_count||0}</span><span className="stat-label">Star</span></div><div className="stat-item"><span className="stat-value">{user.karma||0}</span><span className="stat-label">Karma</span></div></div><div className="karma-level" style={{marginTop:'.5rem',fontSize:'.85rem',opacity:.9}}>{['🌫️ 初来乍到','🌱 成长中的声音','🔥 活跃核心','🌟 树洞之光'][Math.min(3,Math.floor((user.karma||0)/20))]}</div></div></div><div className="glass-card settings-card"><h3>设置</h3><div className="settings-list">{!isAdmin&&<div className="setting-row"><span>匿名发布</span><div className={`toggle-switch ${isAnon?'active':''}`} onClick={()=>setIsAnon(!isAnon)}/></div>}<div className="setting-row"><span>账户名</span><input value={nick} onChange={e=>setNick(e.target.value)}/></div><div className="setting-row"><span>修改密码</span><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="留空不修改"/></div><button className="save-btn" onClick={save}>保存设置</button></div><div className="settings-section"><h4>其他</h4><div className="settings-list"><div className="settings-item" onClick={()=>{setUser(null);localStorage.removeItem('token');localStorage.removeItem('user');toast.info('已退出登录')}}><span>退出登录</span><span className="settings-arrow">→</span></div></div></div></div></div>
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
  const [myLikes,setMyLikes] = useState({})
  const [activeTag,setActiveTag] = useState('')
  const [trendingTags,setTrendingTags] = useState([])
  const [notifOpen,setNotifOpen] = useState(false)
  const [notifs,setNotifs] = useState([])
  const [unread,setUnread] = useState(0)
  const [tarotOpen,setTarotOpen] = useState(false)
  const [sessionExpired,setSessionExpired] = useState(false)
  const [listKey,setListKey] = useState(0)   // 仅在一次真实的帖子列表加载后 +1，避免点赞/取消星标触发整列表重播动画
  const notifPanelRef = useRef(null)
  const PAGE_SIZE = 12
  const postsSkipRef = useRef(0)
  const [hasMore,setHasMore] = useState(false)
  const [loadingMore,setLoadingMore] = useState(false)

  // mode='replace' 重新拉首页（切换分类/搜索/发帖后）；mode='more' 在末尾追加下一页
  const fetchPosts = useCallback(async(mode='replace')=>{ const replace=mode!=='more'
    if(replace) postsSkipRef.current=0
    const skip=replace?0:postsSkipRef.current
    setLoading(replace); setLoadingMore(!replace)
    try{ let url=`/posts/?skip=${skip}&limit=${PAGE_SIZE}`; if(activeCat!=='all')url+=`&category=${activeCat}`; if(activeForum!=='all')url+=`&forum=${activeForum}`; if(activeSort==='hot')url+=`&sort=hot`; if(debouncedQ.trim())url+=`&search=${encodeURIComponent(debouncedQ.trim())}`; const r=await apiFetch(url); if(!r.ok)throw new Error('获取帖子失败'); const data=await r.json()
      if(replace){ setPosts(data); setListKey(k=>k+1) } else { setPosts(prev=>[...prev,...data]) }
      postsSkipRef.current=skip+data.length; setHasMore(data.length===PAGE_SIZE)
    }catch(e){ if(replace) setError(e.message) }finally{ setLoading(false); setLoadingMore(false) } },[activeCat,activeForum,activeSort,debouncedQ,user])

  useEffect(()=>{ const t=setTimeout(()=>setDebouncedQ(searchQ),300); return ()=>clearTimeout(t) },[searchQ])
  useEffect(()=>{ const el=document.querySelector('.main-content'); if(!el)return; if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return; gsap.fromTo(el,{opacity:0,y:12},{opacity:1,y:0,duration:.3,ease:'power2.out'}) },[curPage])
  // 分类标签错落入场（与帖子卡片呼应）
  useEffect(()=>{ const el=document.querySelector('.category-tabs'); if(!el)return; if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return; const ctx=gsap.context(()=>{ gsap.from('.category-tab',{opacity:0,y:10,duration:.35,ease:'power2.out',stagger:.04,clearProps:'opacity,transform'}) }); return ()=>ctx.revert(); },[activeCat])
  useEffect(()=>{ const saved=localStorage.getItem('user'); if(saved){try{const u=JSON.parse(saved); if(u&&typeof u.id==='number'){setUser(u)}else{localStorage.removeItem('user');localStorage.removeItem('token')}}catch{localStorage.removeItem('user')} } },[])
  // token 失效时由请求层回调，统一清身份并回到登录页
  useEffect(()=>{ setUnauthorizedHandler(()=>{ localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null); setCurPage('home'); setSessionExpired(true) }); return ()=>setUnauthorizedHandler(null) },[])
  useEffect(()=>{ if(!sessionExpired) return; const t=setTimeout(()=>setSessionExpired(false),4000); return ()=>clearTimeout(t) },[sessionExpired])
  useEffect(()=>{ if(user) fetchPosts() },[user,fetchPosts])

  // 载入当前用户的星标记录（localStorage 持久化，避免刷新后丢失高亮）
  useEffect(()=>{ if(!user){ setMyStars({}); return } const k='treehole_stars_'+user.id; try{ setMyStars(JSON.parse(localStorage.getItem(k)||'{}')) }catch{ setMyStars({}) } },[user])

  // 载入当前用户的点赞记录（本地持久化，用于按钮高亮）
  useEffect(()=>{ if(!user){ setMyLikes({}); return } const k='treehole_likes_'+user.id; try{ setMyLikes(JSON.parse(localStorage.getItem(k)||'{}')) }catch{ setMyLikes({}) } },[user])

  // 热门标签（点标签即可筛选帖子）
  useEffect(()=>{ const f=async()=>{ try{ const r=await apiFetch('/posts/tags/trending'); if(r.ok)setTrendingTags(await r.json()) }catch{} }; f() },[])

  // 通知：加载未读数 + 每 20s 轮询（轻量）；面板打开时拉取完整列表
  const fetchUnread = useCallback(async()=>{ if(!user) return; try{ const r=await apiFetch('/notifications/unread-count'); if(r.ok)setUnread((await r.json()).unread) }catch{} },[user])
  const fetchNotifs = useCallback(async()=>{ try{ const r=await apiFetch('/notifications'); if(r.ok)setNotifs(await r.json()) }catch{} },[])
  useEffect(()=>{ if(!user){ setUnread(0); setNotifs([]); return } fetchUnread(); const t=setInterval(fetchUnread,20000); return ()=>clearInterval(t) },[user,fetchUnread])
  const closeNotif = ()=>{ const el=notifPanelRef.current; if(!el||prefersReduced()){ setNotifOpen(false); return } gsap.to(el,{opacity:0,y:-8,scale:.98,duration:.18,ease:'power2.in',onComplete:()=>setNotifOpen(false)}) }
  const toggleNotif = async()=>{ if(notifOpen){ closeNotif(); return } await fetchNotifs(); setNotifOpen(o=>!o) }
  const markRead = async(id)=>{ setNotifs(ns=>ns.map(n=>n.id===id?{...n,read:true}:n)); setUnread(u=>Math.max(0,u-1)); try{ await apiFetch(`/notifications/${id}/read`,{method:'POST'}) }catch{} }
  const markAll = async()=>{ setNotifs(ns=>ns.map(n=>({...n,read:true}))); setUnread(0); try{ await apiFetch('/notifications/read-all',{method:'POST'}) }catch{} }
  const clickNotif = async(n)=>{ await markRead(n.id); if(n.post_id){ try{ const r=await apiFetch(`/posts/${n.post_id}`); if(r.ok){ setSelectedPost(await r.json()); setNotifOpen(false) } }catch{} } }
  const notifText = (n)=> n.type==='like' ? `${n.actor_name||'有人'} 赞了你的帖子` : n.type==='mention' ? `${n.actor_name||'有人'} 在评论中提到了你` : `${n.actor_name||'有人'} 回复了你的帖子`
  // 通知面板入场：遮罩缩放回弹 + 列表项错落淡入；尊重 prefers-reduced-motion
  useEffect(()=>{ if(!notifOpen) return; const el=notifPanelRef.current; if(!el) return
    if(prefersReduced()){ gsap.set(el,{opacity:1,y:0,scale:1}); return }
    const ctx=gsap.context(()=>{ gsap.fromTo(el,{opacity:0,y:-10,scale:.96},{opacity:1,y:0,scale:1,duration:.26,ease:'back.out(1.7)'})
      gsap.from(el.querySelectorAll('.notif-item'),{opacity:0,x:14,duration:.28,ease:'power2.out',stagger:.05,clearProps:'opacity,transform'}) },el)
    return ()=>ctx.revert() },[notifOpen])

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
      const r = await apiFetch(`/posts/${post.id}/star`, {method})
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

  // 点赞切换：点赞/取消点赞 + 同步计数与本地高亮
  const toggleLike = async (post) => {
    const uid = user?.id
    if(!uid) return
    const liked = !!myLikes[post.id]
    const method = liked ? 'DELETE' : 'POST'
    try {
      const r = await apiFetch(`/posts/${post.id}/like`, {method})
      if(!r.ok){ const d=await r.json().catch(()=>({})); if(d.detail) alert(d.detail); return }
      const d = await r.json().catch(()=>({}))
      const nowLiked = !liked
      setMyLikes(s => ({...s, [post.id]: nowLiked}))
      const key = 'treehole_likes_'+uid
      try{ const saved = JSON.parse(localStorage.getItem(key)||'{}'); saved[post.id]=nowLiked; localStorage.setItem(key, JSON.stringify(saved)) }catch{}
      const lc = (typeof d.like_count==='number') ? d.like_count : (post.like_count + (nowLiked?1:-1))
      setPosts(prev => prev.map(x=>x.id===post.id?{...x, like_count:lc}:x))
      if(selectedPost && selectedPost.id===post.id) setSelectedPost(sp=>({...sp, like_count:lc}))
    } catch(e){ alert('操作失败，请重试') }
  }

  if(isRegister&&!user) return <ToastProvider><Starfield/><RegisterForm onSwitch={()=>setIsRegister(false)}/></ToastProvider>

  return <ToastProvider>
    <Starfield/>
    {showRules&&<RulesModal onClose={()=>{localStorage.setItem('rules_accepted','true');setShowRules(false)}}/>}
    {sessionExpired&&<div className="session-expired-banner">登录已过期，请重新登录</div>}
    {!user ? <LoginPage onLogin={handleLogin} onSwitchRegister={()=>setIsRegister(true)}/>
    : selectedPost ? <div className="app"><PostDetail post={selectedPost} user={user} onBack={()=>setSelectedPost(null)} onRefresh={fetchPosts} myStars={myStars} onToggleStar={toggleStar} myLikes={myLikes} onToggleLike={toggleLike}/></div>
    : <div className="app">
      <nav className="glass-nav"><h2 className="nav-title">校园树洞</h2><div className="nav-links"><button className={curPage==='home'?'active':''} onClick={()=>setCurPage('home')}>首页</button><button className={curPage==='chat'?'active':''} onClick={()=>setCurPage('chat')}>聊天室</button>{isAdmin&&<button className={curPage==='admin'?'active':''} onClick={()=>setCurPage('admin')}>管理</button>}<button className={`nav-bell ${notifOpen?'active':''}`} onClick={toggleNotif}>🔔{unread>0&&<span key={unread} className="notif-badge">{unread>99?'99+':unread}</span>}</button><button className={curPage==='profile'?'active':''} onClick={()=>setCurPage('profile')}>我的</button></div><div className="user-info">{isAdmin&&<span className="role-indicator">{user.role==='founder'?'👑':'🏅'}</span>}<Avatar src={user.avatar} seed={user.username} className="nav-avatar" /><span className="user-nickname">{user.nickname}</span></div></nav>
        {notifOpen&&<div ref={notifPanelRef} className="notif-panel glass-card"><div className="notif-panel-head"><span>通知</span><button className="notif-markall" onClick={markAll}>全部已读</button></div>{notifs.length===0?<Empty icon="🔔" title="暂无通知" desc="有人回复、点赞或 @ 你时会在这里提醒"/>:<div className="notif-list">{notifs.map(n=><div key={n.id} className={`notif-item ${n.read?'read':''}`} onClick={()=>clickNotif(n)}><span className="notif-icon">{n.type==='like'?'❤️':n.type==='mention'?'@️⃣':'💬'}</span><div className="notif-body"><p className="notif-text">{notifText(n)}</p>{n.post_title&&<p className="notif-post">「{n.post_title}」</p>}<span className="notif-time">{fmtTime(n.created_at)}</span></div>{!n.read&&<span className="notif-dot"/>}</div>)}</div>}</div>}
      <main className="main-content">
        {curPage==='home'&&<div className="home-page">
          {user&&<div className="glass-card create-post-card"><h3>发布新帖子</h3><PostForm user={user} visibleForums={getVisibleForums()} onPostCreated={fetchPosts}/></div>}
          <div className="forum-tabs"><button className={`forum-tab ${activeForum==='all'?'active':''}`} onClick={()=>setActiveForum('all')}>全部</button>{getVisibleForums().map(f=><button key={f.code} className={`forum-tab ${activeForum===f.code?'active':''}`} onClick={()=>setActiveForum(f.code)}>{f.code==='main'?'🏠':'🏫'} {f.name}</button>)}</div>
          <div className="search-bar"><input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="搜索帖子..." className="glass-input search-input"/>{searchQ&&<button className="search-clear" onClick={()=>setSearchQ('')}>✕</button>}</div>
          <div className="category-tabs"><button className={`category-tab ${activeCat==='all'?'active':''}`} onClick={()=>setActiveCat('all')}>全部</button>{CATEGORIES.map(c=><button key={c.id} className={`category-tab ${activeCat===c.id?'active':''}`} onClick={()=>setActiveCat(c.id)}><span className="category-icon">{c.icon}</span><span className="category-name">{c.name}</span></button>)}</div>
          <div className="category-tabs"><button className={`category-tab ${activeSort==='latest'?'active':''}`} onClick={()=>setActiveSort('latest')}>🕒 最新</button><button className={`category-tab ${activeSort==='hot'?'active':''}`} onClick={()=>setActiveSort('hot')}>🔥 热门</button></div>
          {trendingTags.length>0&&<div className="tag-filter-row"><span className="tag-filter-label">🔥 热门标签</span><div className="tag-filter-chips">{trendingTags.slice(0,12).map(t=><button key={t.tag} className={`tag-filter-chip ${activeTag===t.tag?'active':''}`} onClick={()=>setActiveTag(prev=>prev===t.tag?'':t.tag)}>#{t.tag}<span className="tag-count">{t.count}</span></button>)}</div></div>}
          {activeTag&&<div className="active-tag-bar">正在筛选标签：#{activeTag}<button className="active-tag-clear" onClick={()=>setActiveTag('')}>✕ 清除</button></div>}
          {loading?<SkeletonList/>:error?<ErrorBox msg={error} onRetry={fetchPosts}/>:posts.length===0?<Empty icon="📝" title="暂无帖子" desc="成为第一个发帖的人吧"/>: <><div className="posts-list">{posts.map((p,i)=><div key={p.id} data-post-id={p.id} data-post-author={p.user_id} className={`glass-card post-card ${p.is_announcement?'post-announcement':''}`} onClick={()=>setSelectedPost(p)}>{p.is_announcement&&<div className="announcement-badge">📢 公告</div>}<div className="post-card-header"><Avatar src={p.author_avatar} seed={p.display_name} className="post-author-avatar" /><span className="post-author-name-small">{p.display_name||'匿名用户'}</span>{canSeeUid(user,p)&&<span className="uid-badge">{p.user_uid}{p.hide_uid&&' (隐藏)'}</span>}<span className="post-forum-badge">{getSchoolName(p.forum)}</span><span className="post-category-mini">{p.category?p.category.split(',').map(c=>CATEGORIES.find(x=>x.id===c)?.icon||'📝').join(' '):'📝'}</span></div><h4 className="post-title">{p.title}</h4><p className="post-preview">{p.content?.slice(0,100)}{p.content?.length>100?'...':''}</p>{p.images&&p.images.length>0&&<PostImages images={p.images}/>}<div className="post-footer"><span className="post-time">{fmtTime(p.created_at)}</span><div className="post-actions">{(user?.id===p.user_id||user?.role==='founder'||(user?.role==='ambassador'&&p.user_school===user.school_id))&&<button onClick={e=>{e.stopPropagation();if(!confirm('确定删除？'))return;apiFetch(`/posts/${p.id}`,{method:'DELETE'}).then(fetchPosts)}} className="action-btn delete-btn">🗑️</button>}<LikeButton post={p} liked={!!myLikes[p.id]} count={p.like_count} onToggle={toggleLike}/><StarButton post={p} starred={!!myStars[p.id]} count={p.star_count} onToggle={toggleStar}/><span className="action-text">💬 {p.comment_count}</span></div></div>{p.tags&&<div className="post-tags">{p.tags.split(',').map(t=>t.trim()).filter(Boolean).map(t=><button key={t} className={`post-tag ${activeTag===t?'active':''}`} onClick={e=>{e.stopPropagation();setActiveTag(t)}}>#{t}</button>)}</div>}</div>)}</div>{hasMore&&!loading&&<div className="load-more-wrap"><button className="load-more-btn" onClick={()=>fetchPosts('more')} disabled={loadingMore}>{loadingMore?'加载中…':'加载更多'}</button></div>}</>}
        </div>}
        {curPage==='chat'&&<div className="chat-page"><div className="glass-card chat-container"><ChatRoom/></div></div>}
        {curPage==='admin'&&isAdmin&&<AdminPage user={user}/>}
        {curPage==='profile'&&<ProfilePage user={user} setUser={setUser}/>}
      </main>
      <nav className="mobile-nav"><button className={`mobile-nav-item ${curPage==='home'?'active':''}`} onClick={()=>setCurPage('home')}><span className="nav-icon">🏠</span><span className="nav-label">首页</span></button><button className={`mobile-nav-item ${curPage==='chat'?'active':''}`} onClick={()=>setCurPage('chat')}><span className="nav-icon">💬</span><span className="nav-label">聊天</span></button>{isAdmin&&<button className={`mobile-nav-item ${curPage==='admin'?'active':''}`} onClick={()=>setCurPage('admin')}><span className="nav-icon">⚙️</span><span className="nav-label">管理</span></button>}<button className={`mobile-nav-item ${notifOpen?'active':''}`} onClick={toggleNotif}><span className="nav-icon">🔔{unread>0&&<span key={unread} className="notif-badge">{unread>99?'99+':unread}</span>}</span><span className="nav-label">通知</span></button><button className={`mobile-nav-item ${curPage==='profile'?'active':''}`} onClick={()=>setCurPage('profile')}><span className="nav-icon">👤</span><span className="nav-label">我的</span></button></nav>
    </div>}
    {user && <><TarotOrb onOpen={() => setTarotOpen(true)} />
    <TarotOverlay open={tarotOpen} onClose={() => setTarotOpen(false)} /></>}
  </ToastProvider>
}

export default App
