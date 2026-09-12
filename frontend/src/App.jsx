import { useState, useEffect, useLayoutEffect, useCallback, createContext, useContext, useRef, useMemo } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { animate } from 'animejs'
gsap.registerPlugin(useGSAP)
import './App.css'
import WelcomeHello from './WelcomeHello'
import TarotOrb from './TarotOrb'
import TarotOverlay from './TarotOverlay'
import GlobalSearch from './GlobalSearch'
import CommunityStory from './CommunityStory'
import { renderMarkdown } from './markdown'

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
const fallbackAvatar = (seed) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed || 'cervus')}`
const Avatar = ({ src, seed, className = '' }) => (
  <img className={`avatar-img ${className}`} src={avatarUrl(src) || fallbackAvatar(seed)} alt="" />
)

// 帖子图片网格（卡片与详情共用）；点击图片不冒泡，避免误触卡片跳转
const PostImages = ({ images }) => (images && images.length) ? (
  <div className="post-imgs">{images.map((src, i) => <img key={i} src={src} alt="" loading="lazy" onClick={e => e.stopPropagation()} />)}</div>
) : null

// 评论图片网格：尺寸更小，渲染与帖子图共用同一套安全渲染（仅 /uploads/ 同源图）
const CommentImages = ({ images }) => (images && images.length) ? (
  <div className="comment-imgs">{images.map((src, i) => <img key={i} src={src} alt="" loading="lazy" onClick={e => e.stopPropagation()} />)}</div>
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
// 422 的 pydantic 报错是英文原文（"String should have at least 8 characters"），
// 用户在注册页只能看到一串看不懂的英文 —— 这里统一映射成中文，所有表单共用。
const FIELD_CN = { username: '用户名', password: '密码', nickname: '昵称', school_id: '学校',
  enrollment_year: '入学年份', class_number: '班级', student_number: '学号', role: '身份' }
const RULE_CN = {
  string_too_short: (f, c) => `${f}至少 ${c.min_length} 位`,
  string_too_long: (f, c) => `${f}最多 ${c.max_length} 位`,
  string_pattern_mismatch: (f) => `${f}只能包含字母、数字或下划线`,
  greater_than_equal: (f, c) => `${f}不能小于 ${c.ge}`,
  less_than_equal: (f, c) => `${f}不能大于 ${c.le}`,
  missing: (f) => `请填写${f}`,
}
async function errMsg(r, fallback) {
  const d = await r.json().catch(() => ({}))
  if (Array.isArray(d.detail)) {
    return d.detail.map(x => {
      const f = FIELD_CN[(x.loc || [])[1]] || '该项'
      // 自定义 validator 抛的 value_error 本身就是中文，去掉 pydantic 的英文前缀
      if (x.type === 'value_error') return String(x.msg || '').replace(/^Value error,\s*/, '') || `${f}填写有误`
      const rule = RULE_CN[x.type]
      return rule ? rule(f, x.ctx || {}) : `${f}填写有误`
    }).join('；')
  }
  return typeof d.detail === 'string' ? d.detail : fallback
}

const CATEGORIES = [
  { id: 'general', name: '综合', icon: '📝' }, { id: 'study', name: '学习', icon: '📚' },
  { id: 'chat', name: '闲聊', icon: '💬' }, { id: 'game', name: '游戏', icon: '🎮' },
  { id: 'feedback', name: '意见箱', icon: '📮' },
]

let SCHOOLS = [
  { code: 'JSKS', name: '江苏省昆山中学', short: '昆中' }, { code: 'KSZC', name: '昆山震川高级中学', short: '震川' },
  { code: 'KSSY', name: '昆山市第一中学', short: '市一中' }, { code: 'KSKF', name: '开发区高级中学', short: '开高' },
  { code: 'KSLJ', name: '陆家高级中学', short: '陆高' }, { code: 'KSBL', name: '柏庐高级中学', short: '柏高' },
  { code: 'KSZS', name: '周市高级中学', short: '周市' }, { code: 'KSBC', name: '巴城高级中学', short: '巴城' },
  { code: 'KSHQ', name: '花桥高级中学', short: '花桥' }, { code: 'KSJX', name: '锦溪高级中学', short: '锦溪' },
  { code: 'KSPL', name: '蓬朗高级中学', short: '蓬朗' }, { code: 'KSTL', name: '亭林高级中学', short: '亭林' },
]
const getSchoolName = (code) => code === 'main' ? '主论坛' : (code ? (SCHOOLS.find(s => s.code === code)?.short || code) : '—')

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
function spawnFloatPlus(anchor, text = '+1') {
  if (!anchor || prefersReduced()) return
  const rect = anchor.getBoundingClientRect()
  const el = document.createElement('span')
  el.textContent = text;
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
import { ToastProvider, useToast, toast } from './ToastContext'

// ── Shared components ──
const Spinner = () => <div className="spinner-container"><div className="loading-dots"><span/><span/><span/></div></div>
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
    const isMobile=()=>window.innerWidth<=520; let mobile=isMobile();
    const stars=Array.from({length:200},()=>({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.6+.3,a:Math.random(),phase:Math.random()*Math.PI*2,ts:Math.random()*.04+.01}));
    const nebulae=[{x:w*.25,y:h*.3,r:Math.max(w,h)*.55,c:[92,110,220],ox:0,oy:0,sx:.00012,sy:.0001},{x:w*.72,y:h*.72,r:Math.max(w,h)*.5,c:[150,100,210],ox:0,oy:0,sx:.0001,sy:.00016}];
    const dust=Array.from({length:46},()=>({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.4+.6,sp:Math.random()*.4+.15,ph:Math.random()*Math.PI*2,sw:Math.random()*.025+.008,a:Math.random()*.1+.04}));
    const grains=Array.from({length:900},()=>({x:Math.random()*w,y:Math.random()*h,s:Math.random()*1+.5,a:Math.random()*.08+.03}));
    const meteors=[]; let time=0,anim=null,prevNight=null;
    const forced=typeof location!=='undefined'?new URLSearchParams(location.search).get('theme'):null;
    const isNight=()=>{ if(forced==='day')return false; if(forced==='night')return true; try{ const s=localStorage.getItem('cervus_theme'); if(s==='light')return false; if(s==='dark')return true; }catch(e){} const hr=new Date().getHours();return hr>=19||hr<6; };
    const draw=(staticFrame=false)=>{const night=isNight();
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
      if(!mobile){time++;anim=requestAnimationFrame(loop)}};
    const loop=()=>draw(false);
    const schedule=()=>{cancelAnimationFrame(anim);mobile=isMobile();draw(mobile)};
    schedule();
    const resize=()=>{w=c.width=window.innerWidth;h=c.height=window.innerHeight;stars.forEach(s=>{s.x=Math.random()*w;s.y=Math.random()*h});dust.forEach(d=>{if(d.x>w)d.x=Math.random()*w;if(d.y>h)d.y=Math.random()*h});grains.forEach(g=>{g.x=Math.random()*w;g.y=Math.random()*h});schedule()};window.addEventListener('resize',resize);
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
  const toast=useToast(); const nameRef=useRef(null); const passRef=useRef(null); const pageRef=useRef(null); const [loading,setLoading]=useState(false);
  useGSAP(() => {
    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const card = pageRef.current?.querySelector('.login-card-glass')
      const items = pageRef.current?.querySelectorAll('.login-card-glass > *')
      if (!card) return
      gsap.set(card, { opacity:0, scale:.85, y:20 })
      gsap.set(items, { opacity:0, y:15 })
      const tl = gsap.timeline({ defaults:{ ease:'power2.out' } })
      tl.to(card, { opacity:1, scale:1, y:0, duration:.8, ease:'back.out(1.7)' })
        .to(items, { opacity:1, y:0, duration:.4, stagger:.12 }, .35)
      return () => tl.kill()
    })
    return () => mm.revert()
  }, { scope: pageRef })
  const submit=async(e)=>{e.preventDefault();const u=nameRef.current?.value?.trim(),p=passRef.current?.value||'';if(!u)return;setLoading(true);
    try{const r=await apiFetch(`/users/login`,{method:'POST',body:JSON.stringify({username:u,password:p})});if(!r.ok)throw new Error(await errMsg(r,'登录失败'));onLogin(await r.json())}catch(e){toast.error(e.message)}finally{setLoading(false)}}
  return <div className="login-page" ref={pageRef}><div className="login-card-glass"><div className="login-header"><h1 className="brand-title">鹿鸣回音</h1><span className="brand-subtitle-en">Cervus Echo</span><p>匿名表达，自由交流</p></div><form onSubmit={submit} className="login-form"><input ref={nameRef} type="text" placeholder="用户名" className="login-input" required/><input ref={passRef} type="password" placeholder="密码" className="login-input" required/><button type="submit" className="login-btn ihb-btn" disabled={loading}><span className="ihb-dot"></span><span className="ihb-t1">{loading?'进入中…':'进入社区'}{!loading&&<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>}</span><span className="ihb-t2"><span className="ihb-t2-arrow">✦</span>开启你的树洞</span></button></form><p className="switch-link">没有账号？<button onClick={onSwitchRegister}>去注册</button></p></div></div>
}

// ── RegisterForm ──
const RegisterForm = ({onSwitch}) => {
  const toast=useToast(); const formRef=useRef(null); const _ty=new Date().getFullYear(); const _years=[_ty-3,_ty-2,_ty-1,_ty]; const [f,setF]=useState({username:'',password:'',nickname:'',school_id:'JSKS',enrollment_year:_ty,class_number:1,student_number:'',role:'student'}); const [loading,setLoading]=useState(false); const [showPick,setShowPick]=useState(false);
  // 入场动效：卡片缩放淡入 + 内部字段依次上浮；尊重「减少动态效果」系统偏好
  const { contextSafe } = useGSAP(() => {
    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const card = formRef.current?.querySelector('.register-card')
      const items = formRef.current?.querySelectorAll('.register-card > *')
      if (!card) return
      gsap.set(card, { opacity:0, scale:.88, y:24 })
      gsap.set(items, { opacity:0, y:14 })
      const tl = gsap.timeline({ defaults:{ ease:'power3.out' } })
      tl.to(card, { opacity:1, scale:1, y:0, duration:.7, ease:'back.out(1.6)' })
        .to(items, { opacity:1, y:0, duration:.45, stagger:.07 }, .28)
      return () => tl.kill()
    })
    return () => mm.revert()
  }, { scope: formRef })
  // 学校下拉展开时，选项依次淡入
  const openPick = contextSafe(() => {
    setShowPick(p => !p)
    requestAnimationFrame(() => {
      if (showPick) return
      const opts = formRef.current?.querySelectorAll('.custom-select-dropdown .custom-select-option')
      if (opts?.length && !prefersReduced()) gsap.fromTo(opts, { opacity:0, y:8 }, { opacity:1, y:0, duration:.28, stagger:.04, ease:'power2.out', clearProps:'opacity,transform' })
    })
  })
  const submit=async(e)=>{e.preventDefault();if(!f.username.trim())return;setLoading(true);
    try{const r=await apiFetch(`/users/`,{method:'POST',body:JSON.stringify({username:f.username,nickname:f.nickname||genNick(),password:f.password||undefined,school_id:f.school_id,role:f.role,enrollment_year:f.role==='student'?f.enrollment_year:undefined,class_number:f.role==='student'?f.class_number:undefined,student_number:f.role==='student'?(f.student_number?parseInt(f.student_number):undefined):undefined})});if(!r.ok)throw new Error(await errMsg(r,'注册失败'));const data=await r.json();localStorage.setItem('token',data.access_token);localStorage.setItem('user',JSON.stringify(data.user));toast.success('注册成功');window.location.reload()}catch(e){toast.error(e.message)}finally{setLoading(false)}}
  const preview=`${f.school_id}${f.enrollment_year}${String(f.class_number).padStart(2,'0')}${String(f.student_number).padStart(2,'0')}`; const sel=SCHOOLS.find(s=>s.code===f.school_id);
  return <div className="register-page" ref={formRef}><div className="login-card-glass register-card"><div className="login-header"><span className="login-icon">🪵</span><h1>注册账号</h1><p>填写入学信息，系统将自动生成你的 UID</p></div><form onSubmit={submit} className="login-form"><input value={f.username} onChange={e=>setF({...f,username:e.target.value})} placeholder="用户名（登录用）" className="login-input" required/><input value={f.password} onChange={e=>setF({...f,password:e.target.value})} placeholder="密码（至少 8 位，含字母数字）" className="login-input" required/><input value={f.nickname} onChange={e=>setF({...f,nickname:e.target.value})} placeholder="昵称（可留空，自动生成）" className="login-input" maxLength={20}/><div className="uid-section-glass"><h4>入学信息</h4><div className="role-pick" style={{display:'flex',gap:'.5rem',marginBottom:'.75rem'}}><button type="button" className={`glass-button ${f.role==='student'?'btn-primary':''}`} style={{flex:1,padding:'.45rem'}} onClick={()=>setF({...f,role:'student'})}>🎓 我是学生</button><button type="button" className={`glass-button ${f.role==='teacher'?'btn-primary':''}`} style={{flex:1,padding:'.45rem'}} onClick={()=>setF({...f,role:'teacher'})}>👨‍🏫 我是教师</button></div>{f.role==='teacher'&&<p style={{fontSize:'.74rem',color:'var(--muted)',margin:'0 0 .5rem'}}>教师身份注册后需等待本校校方审核，审核通过前按学生权限使用。</p>}<div className="custom-select" onClick={openPick}><span className="custom-select-label">学校</span><span className="custom-select-value">{sel?.name||'选择学校'}</span><span className="custom-select-arrow">▾</span>{showPick&&<div className="custom-select-dropdown">{SCHOOLS.map(s=><div key={s.code} className={`custom-select-option ${f.school_id===s.code?'active':''}`} onClick={e=>{e.stopPropagation();setF({...f,school_id:s.code});setShowPick(false)}}><span>{s.name}</span><span className="custom-select-code">{s.code}</span></div>)}</div>}</div><div className="uid-inputs" style={{gridTemplateColumns:f.role==='teacher'?'1fr 1fr':'1fr 1fr 1fr',marginTop:'.75rem'}}>{f.role==='teacher'?<div className="uid-input-group"><label>任教学段（展示用）</label><input type="text" value={f.staffNote||''} onChange={e=>setF({...f,staffNote:e.target.value})} className="login-input" placeholder="选填，如：高一物理" maxLength={20}/></div>:<><div className="uid-input-group"><label>入学年份</label><select value={f.enrollment_year} onChange={e=>setF({...f,enrollment_year:parseInt(e.target.value)})} className="login-input">{_years.map(y=><option key={y} value={y}>{y} 年</option>)}</select></div><div className="uid-input-group"><label>班级</label><input type="number" value={f.class_number} onChange={e=>setF({...f,class_number:Math.max(1,Math.min(20,parseInt(e.target.value)||1))})} className="login-input" min="1" max="20" placeholder="1-20"/></div><div className="uid-input-group"><label>学号</label><input type="number" value={f.student_number} onChange={e=>setF({...f,student_number:e.target.value})} className="login-input" min="1" max="55" placeholder="1-55" required/></div></>}</div><div className="uid-preview"><span>{f.role==='teacher'?'你的工号将是：':'你的 UID 将是：'}</span><span className="uid-badge-glass">{f.role==='teacher'?`${f.school_id}T####`:`${f.school_id}${f.enrollment_year}${String(f.class_number).padStart(2,'0')}${String(f.student_number||'··').padStart(2,'0')}`}</span></div></div><button type="submit" className="login-btn" disabled={loading}>{loading?'注册中...':'注册'}</button></form><p className="switch-link">已有账号？<button onClick={onSwitch}>去登录</button></p></div></div>
}

// ── PostForm ──
const PostForm = ({user,visibleForums,onPostCreated}) => {
  const toast=useToast(); const tRef=useRef(null),cRef=useRef(null);   const [forum,setForum]=useState('main');
  const [cats,setCats]=useState(['general']); const [submitting,setSubmitting]=useState(false);
  const [tags,setTags]=useState(''); const [tagInput,setTagInput]=useState('');
  const [imgs,setImgs]=useState([]); const [uploading,setUploading]=useState(false);
  // ── 轻量 Markdown 编辑器（工具栏 + 表情面板 + 实时预览）──
  const [cVal,setCVal]=useState(''); const [emojiOpen,setEmojiOpen]=useState(false); const [showPrev,setShowPrev]=useState(false);
  const MD_EMOJIS=['😀','😂','🥺','😍','😎','🤔','😭','👍','🙏','🔥','💡','✨','🌟','💬','❤️','🎉','🍀','🌈','⚡','💰','📚','🎮','🌙','☕'];
  const wrapSel=(pre,post='')=>{ const ta=cRef.current; if(!ta)return; const s=ta.selectionStart,e=ta.selectionEnd,v=ta.value,sel=v.slice(s,e)||''; ta.value=v.slice(0,s)+pre+sel+post+v.slice(e); ta.focus(); ta.selectionStart=s+pre.length; ta.selectionEnd=s+pre.length+sel.length; setCVal(ta.value); saveDraft() };
  const addLink=()=>{ const ta=cRef.current; if(!ta)return; const s=ta.selectionStart,e=ta.selectionEnd,v=ta.value,sel=v.slice(s,e)||'链接文字'; ta.value=v.slice(0,s)+`[${sel}](https://)`+v.slice(e); ta.focus(); ta.selectionStart=s+1; ta.selectionEnd=s+1+sel.length; setCVal(ta.value); saveDraft() };
  const insertEmoji=(em)=>{ const ta=cRef.current; if(!ta)return; const s=ta.selectionStart,v=ta.value; ta.value=v.slice(0,s)+em+v.slice(ta.selectionEnd); ta.focus(); ta.selectionStart=ta.selectionEnd=s+em.length; setCVal(ta.value); saveDraft() };
  const pickImgs = (e) => { const files=Array.from(e.target.files||[]); const room=9-imgs.length;
    const next=files.slice(0,room).map(f=>({file:f,url:URL.createObjectURL(f)})); setImgs(prev=>[...prev,...next]); e.target.value='' }
  const removeImg = (i) => setImgs(prev=>{ const n=[...prev]; if(n[i].url)URL.revokeObjectURL(n[i].url); n.splice(i,1); return n })
  const isAdmin=user?.role==='founder'||user?.role==='ambassador';
  const [isAnon,setIsAnon]=useState(isAdmin?false:true); // 匿名单开关：勾选=不显示昵称+不显示UID（原两开关合并）
  // 发帖草稿自动保存：标题/正文为 uncontrolled(ref)，其余为 state；刷新或误触返回可恢复，发布成功即清
  const DRAFT_KEY='cervus_post_draft';
  const saveDraft=()=>{ try{
    const title=tRef.current?.value||''; const content=cRef.current?.value||'';
    if(!title.trim()&&!content.trim()){ localStorage.removeItem(DRAFT_KEY); return }
    localStorage.setItem(DRAFT_KEY, JSON.stringify({title,content,forum,cats,tags,isAnon}))
  } catch{} };
  const clearDraft=()=>{ try{ localStorage.removeItem(DRAFT_KEY) }catch{} };
  useEffect(()=>{ try{ const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null'); if(d){
    if(tRef.current)tRef.current.value=d.title||''; if(cRef.current)cRef.current.value=d.content||'';
    if(d.forum)setForum(d.forum); if(Array.isArray(d.cats))setCats(d.cats);
    if(typeof d.tags==='string')setTags(d.tags); if(typeof d.isAnon==='boolean')setIsAnon(d.isAnon)
  } }catch{} },[]);
  useEffect(()=>{ saveDraft() },[forum,cats,tags,isAnon]); // 状态项变化时持久化
  // 标签以逗号/空格/回车分隔，最多 5 个
  const addTag = (raw) => { const t=raw.trim(); if(!t)return; setTags(prev=>{ const arr=prev?prev.split(',').map(x=>x.trim()).filter(Boolean):[]; if(arr.length>=5||arr.includes(t))return prev; return [...arr,t].join(',') }); setTagInput('') }
  const removeTag = (t) => setTags(prev=>{ const arr=(prev||'').split(',').map(x=>x.trim()).filter(Boolean).filter(x=>x!==t); return arr.join(',') })
  const submit=async e=>{e.preventDefault(); if(!user?.id){toast.error('登录已失效，请重新登录');return;} const title=tRef.current?.value?.trim(),content=cRef.current?.value?.trim(); if(!title||!content)return; setSubmitting(true);
    const dn=isAdmin?user.nickname:(isAnon?genNick():user.nickname);
    const hu=isAdmin?false:isAnon;
    let imageUrls=[];
    if(imgs.length){ setUploading(true); try{ const fd=new FormData(); imgs.forEach(it=>fd.append('files',it.file));
        const ur=await apiFetch(`/uploads/`,{method:'POST',body:fd}); if(!ur.ok)throw new Error(await errMsg(ur,'图片上传失败')); imageUrls=(await ur.json()).urls||[] }
      catch(err){ setUploading(false); toast.error(err.message||'图片上传失败'); return } setUploading(false) }
    try{const r=await apiFetch(`/posts/`,{method:'POST',body:JSON.stringify({title,content,category:cats.join(','),forum,tags:tags||null,display_name:dn,hide_uid:hu,images:imageUrls.length?imageUrls:null,is_announcement:false})});if(!r.ok)throw new Error(await errMsg(r,'发布失败'));tRef.current.value='';cRef.current.value='';setCats(['general']);setHideUid(false);setTags('');setTagInput('');setImgs([]);onPostCreated();clearDraft();try{const sb=document.querySelector('.create-post-card .submit-btn');if(sb){spawnBurst(sb,'🎉',12);spawnFloatPlus(sb,'发布成功 🎉')}}catch(_){}toast.success('发布成功')}catch(e){toast.error((e&&e.name==='TypeError')?'网络异常：无法连接服务器，请确认后端已启动于 localhost:8000':(e&&e.message||'发布失败'))}finally{setSubmitting(false)}}
  return <div className="glass-card create-post-card"><h3>发布新帖子</h3><form onSubmit={submit} className="create-post-form"><input ref={tRef} type="text" placeholder="帖子标题" className="glass-input" required onChange={saveDraft}/><div className="md-editor">
  <div className="md-toolbar">
    <button type="button" className="md-btn" onClick={()=>wrapSel('**','**')} title="粗体"><b>B</b></button>
    <button type="button" className="md-btn" onClick={()=>wrapSel('*','*')} title="斜体"><i>I</i></button>
    <button type="button" className="md-btn" onClick={()=>wrapSel('## ','')} title="标题">H</button>
    <button type="button" className="md-btn" onClick={()=>wrapSel('> ','')} title="引用">❝</button>
    <button type="button" className="md-btn" onClick={()=>wrapSel('- ','')} title="列表">•</button>
    <button type="button" className="md-btn" onClick={addLink} title="链接">🔗</button>
    <button type="button" className="md-btn" onClick={()=>setEmojiOpen(o=>!o)} title="表情">😊</button>
    <button type="button" className={`md-btn ${showPrev?'active':''}`} onClick={()=>setShowPrev(p=>!p)} title="预览">{showPrev?'✏️ 编辑':'👁 预览'}</button>
  </div>
  {emojiOpen&&<div className="emoji-panel">{MD_EMOJIS.map(e => <button type="button" key={e} className="emoji-item" onClick={()=>insertEmoji(e)}>{e}</button>)}</div>}
  <textarea ref={cRef} placeholder="分享你的想法（支持 Markdown：**粗体** *斜体* # 标题 > 引用 - 列表 [链接](url)）" className="glass-textarea" required rows={4} onChange={(e)=>{ setCVal(e.target.value); saveDraft() }}/>
  {showPrev&&<div className="md-preview markdown-body">{renderMarkdown(cVal)}</div>}
</div><div className="forum-select"><label className="forum-label">发布到：</label><div className="forum-options">{visibleForums.map(f=><button key={f.code} type="button" className={`forum-option ${forum===f.code?'active':''}`} onClick={()=>setForum(f.code)}>{f.code==='main'?'🏠 ':'🏫 '}{f.name}</button>)}</div></div>{!isAdmin&&!(user?.role==='teacher'||user?.role==='school_official')&&<div className="post-options"><label className="checkbox-label"><input type="checkbox" checked={isAnon} onChange={e=>setIsAnon(e.target.checked)}/><span>匿名发布（不显示昵称与 UID，身份仅站长与大使可见）</span></label></div>}<div className="category-select">{CATEGORIES.map(c=><button key={c.id} type="button" className={`category-option ${cats.includes(c.id)?'active':''}`} onClick={()=>setCats(p=>p.includes(c.id)?p.filter(x=>x!==c.id):[...p,c.id])}>{c.icon} {c.name}</button>)}</div><div className="tag-input-row"><div className="tag-chips">{tags?tags.split(',').map(x=>x.trim()).filter(Boolean).map(t=><span key={t} className="tag-chip" onClick={()=>removeTag(t)}>#{t} ✕</span>):null}<input value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'||e.key===','||e.key===' '){e.preventDefault();addTag(tagInput)}else if(e.key==='Backspace'&&!tagInput&&tags){const arr=tags.split(',').map(x=>x.trim()).filter(Boolean);arr.pop();setTags(arr.join(','))}}} placeholder={tags?'':'添加标签（回车确认，最多5个）'} className="glass-input tag-input"/></div></div><div className="img-upload-row"><label className="img-pick-btn"><input type="file" accept="image/*" multiple onChange={pickImgs} hidden/>📷 添加图片{imgs.length?` (${imgs.length}/9)`:''}</label>{imgs.length>0&&<div className="img-thumbs">{imgs.map((it,i)=><div key={i} className="img-thumb"><img src={it.url} alt=""/><button type="button" className="img-thumb-del" onClick={()=>removeImg(i)}>✕</button></div>)}</div>}</div><button type="submit" className="glass-button submit-btn btn-primary" disabled={submitting||uploading}>{submitting?'发布中...':uploading?'图片上传中...':'发布'}</button></form></div>
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
// 评论楼中楼：把后端返回的平铺评论按 parent_id 建成树，递归渲染并支持嵌套回复
const buildCommentTree = (flat) => {
  const byId = new Map()
  flat.forEach(c => byId.set(c.id, { ...c, replies: [] }))
  const roots = []
  byId.forEach(node => {
    if (node.parent_id != null && byId.has(node.parent_id)) byId.get(node.parent_id).replies.push(node)
    else roots.push(node)
  })
  const sortFn = (a, b) => new Date(a.created_at) - new Date(b.created_at)
  const sortRec = (ns) => { ns.sort(sortFn); ns.forEach(n => sortRec(n.replies)) }
  sortRec(roots)
  return { roots, byId }
}

const PostDetail = ({post,user,onBack,onRefresh,myStars,onToggleStar,myLikes,onToggleLike,onEditPost,setProfileUserId,setSelectedPost,onOpenTag}) => {
  const toast=useToast(); const [comments,setComments]=useState([]); const [nc,setNc]=useState(''); const [loading,setLoading]=useState(false); const [err,setErr]=useState(null); const [submitting,setSubmitting]=useState(false); const [showR,setShowR]=useState(false); const [rt,setRt]=useState({type:'post',id:0}); const [editId,setEditId]=useState(null); const [editText,setEditText]=useState(''); const [savingEdit,setSavingEdit]=useState(false); const [animIds,setAnimIds]=useState([]); const [replyTo,setReplyTo]=useState(null);
  const [cImgs,setCImgs]=useState([]); const [cUploading,setCUploading]=useState(false);
  const [editImgs,setEditImgs]=useState([]);
  const isAdmin=user?.role==='founder'||user?.role==='ambassador';
  const commentInputRef=useRef(null);
  // 评论草稿自动保存：按帖子 id 存，刷新/误触返回可恢复，评论成功即清
  const CDRAFT='cervus_comment_draft_'+post.id;
  useEffect(()=>{ try{ const d=localStorage.getItem(CDRAFT); if(d)setNc(d) }catch{} },[]);
  const onCommentChange=e=>{ const v=e.target.value; setNc(v); try{ if(v.trim())localStorage.setItem(CDRAFT,v); else localStorage.removeItem(CDRAFT) }catch{} };
  const rootRef=useRef(null); const closingRef=useRef(false);
  const close=useCallback(()=>{ if(closingRef.current)return; closingRef.current=true; if(prefersReduced()||!rootRef.current){onBack();return} gsap.to(rootRef.current,{opacity:0,y:20,duration:.22,ease:'power2.in',onComplete:onBack}) },[onBack]);
  const fc=useCallback(async()=>{setLoading(true);try{const r=await apiFetch(`/posts/${post.id}/comments`);if(!r.ok)throw new Error('获取评论失败');setComments(await r.json())}catch(e){setErr(e.message)}finally{setLoading(false)}},[post.id]);
  useEffect(()=>{fc()},[fc]);
  useEffect(()=>{ if(!prefersReduced()&&rootRef.current) gsap.from(rootRef.current,{opacity:0,y:20,duration:.3,ease:'power2.out'}) },[]);
  useEffect(()=>{const h=e=>{if(e.key==='Escape')close()};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h)},[close]);
  // @提及 的用户名 -> 主页（用户名搜索取首个匹配）
  const openMention=useCallback(async(name)=>{ try{ const r=await apiFetch('/users/search?q='+encodeURIComponent(name)); if(r.ok){ const list=await r.json(); if(list&&list.length){ setProfileUserId(list[0].id); setSelectedPost(null) } } }catch{} },[setProfileUserId,setSelectedPost]);
  const { roots:tree, byId }=useMemo(()=>buildCommentTree(comments),[comments]);
  const startReply=(c)=>{ setReplyTo({id:c.id,name:c.display_name||'匿名用户'}); setNc(prev=>prev&&prev.trim()?prev:`@${c.display_name||'匿名用户'} `); try{ localStorage.setItem(CDRAFT,`@${c.display_name||'匿名用户'} `) }catch{}; setTimeout(()=>{ try{ commentInputRef.current?.focus(); commentInputRef.current?.scrollIntoView({behavior:'smooth',block:'center'}) }catch{} },60) };
  const cancelReply=()=>{ setReplyTo(null); setNc(''); try{ localStorage.removeItem(CDRAFT) }catch{} };
  const pickCImgs=(e)=>{ const files=Array.from(e.target.files||[]); const room=9-cImgs.length; const next=files.slice(0,room).map(f=>({file:f,url:URL.createObjectURL(f)})); setCImgs(prev=>[...prev,...next]); e.target.value='' };
  const removeCImg=(i)=>setCImgs(prev=>{ const n=[...prev]; if(n[i].url)URL.revokeObjectURL(n[i].url); n.splice(i,1); return n });
  // 编辑模式下新增插图：立即上传并追加 URL
  const pickEditImg=async(e)=>{ const files=Array.from(e.target.files||[]); e.target.value=''; if(!files.length)return; setCUploading(true); try{ const fd=new FormData(); files.forEach(f=>fd.append('files',f)); const ur=await apiFetch('/uploads/',{method:'POST',body:fd}); if(!ur.ok)throw new Error(await errMsg(ur,'图片上传失败')); const urls=(await ur.json()).urls||[]; setEditImgs(prev=>[...prev,...urls]) }catch(err){ toast.error(err.message||'图片上传失败') }finally{ setCUploading(false) } };
  const removeEditImg=(i)=>setEditImgs(prev=>{ const n=[...prev]; n.splice(i,1); return n });
  const submitComment=async e=>{e.preventDefault();const text=nc.trim();if(!text&&!cImgs.length)return;setSubmitting(true);let cImgUrls=[];if(cImgs.length){setCUploading(true);try{const fd=new FormData();cImgs.forEach(it=>fd.append('files',it.file));const ur=await apiFetch('/uploads/',{method:'POST',body:fd});if(!ur.ok)throw new Error(await errMsg(ur,'图片上传失败'));cImgUrls=(await ur.json()).urls||[]}catch(err){setCUploading(false);toast.error(err.message||'图片上传失败');return}setCUploading(false)}const dn=user?.role==='founder'||user?.role==='ambassador'?user.nickname:genNick();const body={content:text,display_name:dn,images:cImgUrls.length?cImgUrls:null};if(replyTo)body.parent_id=replyTo.id;const tmpId='tmp-'+Date.now();const optimistic={id:tmpId,content:text,display_name:dn,author_avatar:user?.avatar||null,user_id:user?.id,parent_id:replyTo?replyTo.id:null,created_at:new Date().toISOString(),images:cImgUrls,edited:false,_pending:true};setComments(prev=>[...prev,optimistic]);setAnimIds(a=>[...a,String(tmpId)]);setNc('');setReplyTo(null);try{const r=await apiFetch(`/posts/${post.id}/comments`,{method:'POST',body:JSON.stringify(body)});if(!r.ok)throw new Error(await errMsg(r,'评论失败'));const u=await r.json();setComments(prev=>prev.map(x=>x.id===tmpId?u:x));toast.success(replyTo?'回复成功':'评论成功');onRefresh?.();try{localStorage.removeItem(CDRAFT)}catch{}}catch(err){setComments(prev=>prev.filter(x=>x.id!==tmpId));setAnimIds(a=>a.filter(id=>id!==String(tmpId)));toast.error(err.message||'评论失败')}finally{setSubmitting(false);setCImgs([])}};
  const renderNode=(node,depth)=>{
    const isOwner=user?.id===node.user_id;
    const parentName=node.parent_id!=null?(byId.get(node.parent_id)?.display_name||'匿名用户'):null;
    return (
      <div key={node.id} className={`comment-thread ${depth>0?'comment-thread-child':''}`} style={{marginLeft: depth>0 ? Math.min(depth,5)*16 : 0}}>
        <div className={"glass-card comment-card"+(animIds.includes(String(node.id))?" comment-enter":"")+(node._pending?" comment-pending":"")}>
          <div className="comment-header">
            <div className="comment-author-info">
              <Avatar src={node.author_avatar} seed={node.display_name} className="comment-author-avatar" onClick={e=>{e.stopPropagation();setProfileUserId(node.user_id);setSelectedPost(null)}}/>
              <span className="comment-author" onClick={e=>{e.stopPropagation();setProfileUserId(node.user_id);setSelectedPost(null)}}>{node.display_name||'匿名用户'}</span>
              {canSeeUid(user,node)&&<span className="uid-badge">{node.user_uid}</span>}
            </div>
            <div className="comment-actions">
              <span className="comment-time">{fmtTime(node.created_at)}</span>
              {(isOwner||isAdmin)&&<><button onClick={async()=>{const r=await apiFetch(`/posts/${post.id}/comments/${node.id}`,{method:'DELETE'});if(!r.ok){toast.error(await errMsg(r,'删除失败'));return}fc();onRefresh?.()}} className="action-btn delete-btn">🗑️</button>
              <button onClick={()=>{setEditId(node.id);setEditText(node.content);setEditImgs(node.images||[])}} className="action-btn edit-btn">✏️</button></>}
              <button onClick={()=>{setRt({type:'comment',id:node.id});setShowR(true)}} className="action-btn">🚩</button>
            </div>
          </div>
          {parentName&&<div className="comment-reply-to">↳ 回复 @{parentName}</div>}
          {editId===node.id?(<div className="comment-edit"><textarea className="comment-edit-input" value={editText} onChange={e=>setEditText(e.target.value)} rows={3}/>
<div className="comment-edit-img-row">
  <label className="img-pick-btn comment-img-pick">📷<input type="file" accept="image/*" multiple onChange={pickEditImg} hidden/></label>
  {editImgs.length>0&&<div className="img-thumbs comment-img-thumbs">{editImgs.map((src,i)=><div key={i} className="img-thumb"><img src={src} alt=""/><button type="button" className="img-thumb-del" onClick={()=>removeEditImg(i)}>✕</button></div>)}</div>}
</div>
<div className="comment-edit-actions"><button className="glass-button btn-primary" disabled={savingEdit} onClick={async()=>{ if(!editText.trim())return; setSavingEdit(true); try{ const r=await apiFetch(`/posts/${post.id}/comments/${node.id}`,{method:'PUT',body:JSON.stringify({content:editText,images:editImgs})}); if(!r.ok)throw new Error(await errMsg(r,'修改失败')); const u=await r.json(); setComments(prev=>prev.map(x=>x.id===node.id?{...x,content:u.content}:x)); setEditId(null); toast.success('已修改') }catch(e){toast.error(e.message)}finally{setSavingEdit(false)} }}>保存</button><button className="glass-button btn-secondary" onClick={()=>setEditId(null)}>取消</button></div></div>):(<><p className="comment-content markdown-body">{renderMarkdown(node.content,{onMention:openMention})}</p>{node.images&&node.images.length>0&&<CommentImages images={node.images}/>}{node.edited&&<span className="comment-edited-tag">· 已编辑</span>}</>)}
          <div className="comment-footer">
            <button className="comment-reply-btn" onClick={()=>startReply(node)}>💬 回复</button>
          </div>
        </div>
        {node.replies.length>0 && node.replies.map(ch=>renderNode(ch,depth+1))}
      </div>
    )
  };
  return <div className="post-detail" ref={rootRef}><button className="back-btn" onClick={close}>← 返回</button><div className="glass-card post-detail-card"><div className="post-header"><Avatar src={post.author_avatar} seed={post.display_name} className="post-author-avatar" onClick={e=>{e.stopPropagation();setProfileUserId(post.user_id);setSelectedPost(null)}}/><span className="post-author-name" onClick={e=>{e.stopPropagation();setProfileUserId(post.user_id);setSelectedPost(null)}}>{post.display_name||'匿名用户'}</span>{canSeeUid(user,post)&&<span className="uid-badge">{post.user_uid}{post.hide_uid&&' (隐藏)'}</span>}<span className="post-category-badge">{post.category?post.category.split(',').map(c=>{const x=CATEGORIES.find(y=>y.id===c);return x?`${x.icon} ${x.name}`:'📝 综合'}).join(' · '):'📝 综合'}</span>{post.tags&&post.tags.split(',').filter(Boolean).length>0&&<span className="post-tags post-tags-detail">{post.tags.split(',').filter(Boolean).map(t=><button key={t} className="post-tag-chip" onClick={e=>{e.stopPropagation();onOpenTag&&onOpenTag(t.trim())}}>#{t.trim()}</button>)}</span>}</div><h2>{post.title}</h2><div className="post-content markdown-body">{renderMarkdown(post.content)}</div>{post.images&&post.images.length>0&&<PostImages images={post.images}/>}<div className="post-meta"><span className="post-time">{fmtTime(post.created_at)}</span><div className="post-actions"><LikeButton post={post} liked={!!myLikes[post.id]} count={post.like_count} onToggle={onToggleLike}/><StarButton post={post} starred={!!myStars[post.id]} count={post.star_count} onToggle={onToggleStar}/><button onClick={()=>{setRt({type:'post',id:post.id});setShowR(true)}} className="action-btn">🚩</button>{(user?.id===post.user_id||isAdmin)&&<><button onClick={()=>onEditPost&&onEditPost(post)} className="action-btn edit-btn" title="编辑">✏️</button><button onClick={async()=>{if(!confirm('确定删除？'))return;const r=await apiFetch(`/posts/${post.id}`,{method:'DELETE'});if(!r.ok){toast.error(await errMsg(r,'删除失败'));return}toast.success('已删除');onBack()}} className="action-btn delete-btn">🗑️</button></>}</div></div></div><div className="glass-card comments-section"><h3>评论 ({comments.length})</h3><form onSubmit={submitComment} className="comment-form">{replyTo&&<div className="reply-indicator">回复 <b>@{replyTo.name}</b> <button type="button" className="reply-cancel" onClick={cancelReply}>✕</button></div>}<textarea ref={commentInputRef} value={nc} onChange={onCommentChange} placeholder={replyTo?'回复 '+replyTo.name+'…':'说点什么...'} className="comment-input" rows={3}/>
<div className="comment-img-row">
  <label className="img-pick-btn comment-img-pick">📷<input type="file" accept="image/*" multiple onChange={pickCImgs} hidden/></label>
  {cImgs.length>0&&<div className="img-thumbs comment-img-thumbs">{cImgs.map((it,i)=><div key={i} className="img-thumb"><img src={it.url} alt=""/><button type="button" className="img-thumb-del" onClick={()=>removeCImg(i)}>✕</button></div>)}</div>}
</div>
<button type="submit" className="glass-button submit-btn btn-primary" disabled={submitting||cUploading||(!nc.trim()&&!cImgs.length)}>{cUploading?'上传中...':submitting?'发送中...':(replyTo?'回复':'发表评论')}</button></form>{loading?<Spinner/>:err?<ErrorBox msg={err} onRetry={fc}/>:comments.length===0?<Empty icon="💬" title="暂无评论" desc="成为第一个评论的人"/>:<div className="comments-list">{tree.map(n=>renderNode(n,0))}</div>}{showR&&<ReportModal type={rt.type} tid={rt.id} onClose={()=>setShowR(false)}/>}</div></div>
}

// ── 社区公约（单一事实源：首登弹窗与「我的 → 社区公约」共用，避免双份维护）──
const COMMUNITY_PACT = [
  { n: '一、友善交流，尊重他人', d: '我们鼓励真诚的表达，但拒绝一切辱骂、人身攻击、地域歧视与网络暴力。讨论可以有不同的声音，请对事不对人。' },
  { n: '二、保护隐私，严守边界', d: '请勿公开他人真实姓名、电话、住址、证件号、学号等隐私信息；未经同意不得拍摄、传播他人影像。你的匿名，也同样属于他人。' },
  { n: '三、合法合规，健康表达', d: '禁止发布违法、色情、暴力、赌博、自伤诱导及任何危害身心健康的不良信息。涉及严重心理危机的内容，我们会引导你寻求专业帮助。' },
  { n: '四、理性发言，拒绝谣言', d: '不造谣、不传谣，不发布未经核实的校园传闻。你写下的每一句话，都可能影响一个真实的人。' },
  { n: '五、共建共治，彼此守护', d: '发现违规内容请使用举报功能，管理员与大使会按规定处理。社区的安全感，来自每一个人的克制与善意。' },
  { n: '六、责任与边界', d: '鹿鸣回音是校园互助平台，不替代专业心理咨询、医疗或法律服务。遇到紧急情况，请第一时间联系学校、家人与专业机构。' },
]
const RulesModal = ({onClose, title = '📜 鹿鸣回音社区公约'}) => <AnimatedModal onClose={onClose} className="rules-modal login-rules-modal">
  {({ requestClose }) => (<>
    <h2>{title}</h2>
    <p className="rules-subtitle">本公约旨在守护一个安全、温暖、值得信赖的表达空间。进入社区即视为你已阅读并愿意共同遵守。</p>
    <div className="rules-content">{COMMUNITY_PACT.map(r => <p key={r.n}><strong>{r.n}</strong> — {r.d}</p>)}</div>
    <button className="glass-button btn-primary" onClick={requestClose}>我已知晓，开始使用</button>
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


// ── FollowListModal ──
const FollowListModal = ({type, userId, onClose, onOpenUser}) => {
  const [list,setList]=useState([]); const [loading,setLoading]=useState(true);
  useEffect(()=>{ const f=async()=>{ setLoading(true); try{ const r=await apiFetch(`/social/${type}/${userId}`); if(r.ok)setList(await r.json()) }catch{}finally{ setLoading(false) } }; f() },[type,userId]);
  return <AnimatedModal onClose={onClose} className="follow-list-modal">
    {({ requestClose }) => (<>
      <h3>{type==='followers'?'粉丝':'关注'}</h3>
      {loading?<Spinner/>:list.length===0?<Empty icon="👥" title="暂无" desc={type==='followers'?'还没有人关注 TA':'TA 还没有关注别人'}/>:
        <div className="follow-list">{list.map(u=><div key={u.id} className="follow-list-item" onClick={()=>{ onOpenUser&&onOpenUser(u.id); requestClose() }}>
          <Avatar src={u.avatar} seed={u.nickname} className="follow-list-avatar"/>
          <div className="follow-list-info"><span className="follow-list-name">{u.nickname}</span><span className="follow-list-school">{getSchoolName(u.school_id)}</span></div>
        </div>)}</div>}
    </>)}
  </AnimatedModal>
}

// ── PostEditModal ──
const PostEditModal = ({post, boards = CATEGORIES, onClose, onSaved}) => {
  const toast=useToast();
  const [title,setTitle]=useState(post.title||'');
  const [content,setContent]=useState(post.content||'');
  const [cats,setCats]=useState((post.category||'general').split(',').filter(Boolean));
  const [tags,setTags]=useState(post.tags||'');
  const [submitting,setSubmitting]=useState(false);
  const submit=async()=>{ if(!title.trim()||!content.trim()){toast.error('标题和内容不能为空');return} setSubmitting(true);
    try{ const body={title:title.trim(),content:content.trim(),category:cats.join(','),tags:tags||null};
      const r=await apiFetch(`/posts/${post.id}`,{method:'PUT',body:JSON.stringify(body)});
      if(!r.ok)throw new Error(await errMsg(r,'保存失败'));
      const u=await r.json(); toast.success('已保存修改'); onSaved&&onSaved(u) }
    catch(e){ toast.error(e.message||'保存失败') }finally{ setSubmitting(false) } }
  return <AnimatedModal onClose={onClose}>
    {({ requestClose }) => (<>
      <h3>编辑帖子</h3>
      <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="标题" className="glass-input" />
      <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="内容" className="glass-textarea" rows={6}/>
      <div className="category-select">{boards.map(c=><button key={c.key} type="button" className={`category-option ${cats.includes(c.key)?'active':''}`} onClick={()=>setCats(p=>p.includes(c.key)?p.filter(x=>x!==c.key):[...p,c.key])}>{c.icon} {c.name}</button>)}</div>
      <input value={tags} onChange={e=>setTags(e.target.value)} placeholder="标签（逗号分隔，可留空）" className="glass-input" />
      <div className="modal-actions"><button className="glass-button btn-secondary" onClick={requestClose}>取消</button><button className="glass-button btn-primary" onClick={submit} disabled={submitting}>{submitting?'保存中...':'保存'}</button></div>
    </>)}
  </AnimatedModal>
}

// ── 阅后即焚辅助组件 ──
const BURN_MODES = [
  { key: 'any', label: '🔥 任一读后即焚' },
  { key: 'all', label: '👥 全部读完才焚' },
  { key: 'per_user', label: '🙈 按人各自焚' },
];
const BurnPicker = ({ value, onChange }) => (
  <div className="burn-picker">
    <span className="burn-picker-label">阅后即焚</span>
    {BURN_MODES.map(m => <button key={m.key} type="button" className={`burn-opt ${value===m.key?'active':''}`} onClick={()=>onChange(value===m.key?null:m.key)} title={m.key==='per_user'?'默认：你看过只对你消失':''}><span className="burn-opt-label">{m.label}</span></button>)}
    {value&&<button type="button" className="burn-opt burn-opt-clear" onClick={()=>onChange(null)}><span className="burn-opt-label">✕ 取消</span></button>}
  </div>
);
// 焚毁消息渲染：burned=已焚 / pending=待点击查看 / own=发送者自己 / permanent=普通
const BurnMessageContent = ({ m, meId, onView }) => {
  if(!m.burn_mode) return <span className="dm-msg-content">{m.content}</span>;
  if(m.burned) return <span className="burn-card gone">🔥 此消息已焚毁</span>;
  if(m.state==='own') return <span className="burn-card revealed">{m.content}</span>;
  // pending：点击调 view 拿明文
  return <button className="burn-card" onClick={()=>onView(m)}><span>🔥 阅后即焚消息</span><span className="burn-tap">👆 点击查看</span></button>;
};
// ── DirectMessages（1:1 私信）──
const DirectMessages = ({user, openConvId, onOpenConvChange, onOpenUser}) => {
  const toast=useToast();
  const [convs,setConvs]=useState([]);
  const [activeConv,setActiveConv]=useState(null);
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState('');
  const [loadingConv,setLoadingConv]=useState(false);
  const [sending,setSending]=useState(false);
  const [peerTyping,setPeerTyping]=useState(false);
  const [dmSearch,setDmSearch]=useState('');
  const [burnMode,setBurnMode]=useState(null);  // null=永久；any/all/per_user
  const listRef=useRef(null);
  const wsRef=useRef(null);
  const typingTimer=useRef(null);
  const meId=user?.id;
  const loadConvs=useCallback(async()=>{ try{ const r=await apiFetch('/dm/conversations'); if(r.ok)setConvs(await r.json()) }catch{} },[]);
  useEffect(()=>{ loadConvs() },[loadConvs]);
  const openConv=useCallback(async(id)=>{ setActiveConv(id); setLoadingConv(true); setPeerTyping(false); setDmSearch(''); onOpenConvChange&&onOpenConvChange(id);
    try{ const r=await apiFetch(`/dm/conversations/${id}/messages`); if(r.ok)setMessages(await r.json()) }catch{} finally{ setLoadingConv(false) } },[onOpenConvChange]);
  useEffect(()=>{ if(openConvId){ openConv(openConvId) } },[openConvId,openConv]);
  // 会话级 WebSocket：接收「输入中 / 已读 / 新消息」信令（房间 dm/{conv_id}，与聊天共用连接管理器）
  useEffect(()=>{
    if(activeConv==null) return
    let ws
    try{ ws=new WebSocket(`${WS_BASE}/dm/${activeConv}?token=${encodeURIComponent(getToken())}`) }catch(e){ return }
    wsRef.current=ws
    ws.onmessage=(ev)=>{ try{
      const d=JSON.parse(ev.data)
      if(d.type==='typing'){ if(d.sender_id!==meId) setPeerTyping(true) }
      else if(d.type==='stop'){ setPeerTyping(false) }
      else if(d.type==='read'){ const ids=new Set(d.message_ids||[]); setMessages(prev=>prev.map(m=>ids.has(m.id)?{...m,read:true}:m)) }
      else if(d.type==='burned'){ setMessages(prev=>prev.map(m=>m.id===d.id?{...m,burned:true,content:null,state:'burned'}:m)) }
      else if(d.type==='message'){ if(d.sender_id!==meId) setMessages(prev=>prev.some(x=>x.id===d.id)?prev:[...prev,d]) }
    }catch(e){} }
    return ()=>{ try{ ws.close() }catch(e){}; wsRef.current=null }
  },[activeConv,meId]);
  const sendTyping=()=>{ const ws=wsRef.current; if(!ws||ws.readyState!==WebSocket.OPEN)return; try{ ws.send(JSON.stringify({type:'typing'})) }catch(e){}; if(typingTimer.current)clearTimeout(typingTimer.current); typingTimer.current=setTimeout(()=>{ try{ wsRef.current&&wsRef.current.send(JSON.stringify({type:'stop'})) }catch(e){} },1500) };
  const stopTyping=()=>{ if(typingTimer.current)clearTimeout(typingTimer.current); const ws=wsRef.current; if(ws&&ws.readyState===WebSocket.OPEN){ try{ ws.send(JSON.stringify({type:'stop'})) }catch(e){} } };
  const onDmInput=(e)=>{ setInput(e.target.value); sendTyping() };
  const send=async(e)=>{ e.preventDefault(); if(!input.trim()||!activeConv)return; setSending(true); stopTyping();
    const tmpId='tmp-'+Date.now(); const bm=burnMode; const opt={id:tmpId,conversation_id:activeConv,sender_id:meId,content:input,read:false,created_at:new Date().toISOString(),burn_mode:bm,burned:false,state:bm?'own':'permanent',_pending:true};
    setMessages(prev=>[...prev,opt]); setInput('');
    try{ const r=await apiFetch(`/dm/conversations/${activeConv}/messages`,{method:'POST',body:JSON.stringify({content:input,burn_mode:bm})}); if(!r.ok)throw new Error(await errMsg(r,'发送失败')); const u=await r.json(); setMessages(prev=>prev.map(m=>m.id===tmpId?u:m)) }catch(err){ setMessages(prev=>prev.filter(m=>m.id!==tmpId)); toast.error(err.message||'发送失败') }finally{ setSending(false) } };
  // 阅后即焚：点占位卡调 view 拿明文；view 后按模式后端会焚毁/局部焚毁
  const viewBurn=async(m)=>{ try{ const r=await apiFetch(`/burn/dm/${m.id}/view`,{method:'POST'}); if(!r.ok)throw new Error(await errMsg(r,'查看失败')); const v=await r.json();
    if(v.content!=null){ setMessages(prev=>prev.map(x=>x.id===m.id?{...x,content:v.content,state:'revealed',revealed:true}:x)) }
    else if(v.burned){ setMessages(prev=>prev.map(x=>x.id===m.id?{...x,burned:true,content:null,state:'burned'}:x)) }
  }catch(err){ toast.error(err.message) } };
  useEffect(()=>{ const el=listRef.current; if(!el)return; const m=el.querySelector('.dm-message:last-child'); if(m&&!prefersReduced())gsap.fromTo(m,{opacity:0,y:8},{opacity:1,y:0,duration:.25,ease:'power2.out',clearProps:'opacity,transform'}) },[messages.length]);
  if(activeConv==null){
    return <div className="dm-page"><div className="dm-list-head">私信</div>
      {convs.length===0?<Empty icon="✉️" title="还没有私信" desc="去对方主页点「私信」开始对话"/>:
        <div className="dm-list">{convs.map(c=><div key={c.id} className="dm-conv" onClick={()=>openConv(c.id)}>
          <Avatar src={c.peer?.avatar} seed={c.peer?.nickname} className="dm-conv-avatar"/>
          <div className="dm-conv-info"><div className="dm-conv-top"><span className="dm-conv-name">{c.peer?.nickname||'用户'}</span>{c.unread>0&&<span className="notif-badge">{c.unread>99?'99+':c.unread}</span>}</div><span className="dm-conv-last">{c.last_time ? fmtChatTime(c.last_time) + " · " : ""}{c.last_message||""}</span></div>
        </div>)}</div>}
    </div>
  }
  const peer=convs.find(c=>c.id===activeConv)?.peer;
  const q=dmSearch.trim().toLowerCase();
  const shown=q?messages.filter(m=>(m.content||'').toLowerCase().includes(q)):messages;
  return <div className="dm-page dm-thread">
    <div className="dm-thread-head"><button className="dm-back" onClick={()=>{stopTyping();setActiveConv(null);onOpenConvChange&&onOpenConvChange(null);loadConvs()}}>←</button>
      <Avatar src={peer?.avatar} seed={peer?.nickname} className="dm-conv-avatar"/>
      <span className="dm-conv-name" onClick={()=>peer?.id&&onOpenUser&&onOpenUser(peer.id)}>{peer?.nickname||'用户'}</span>
    </div>
    <div className="dm-search-row"><input value={dmSearch} onChange={e=>setDmSearch(e.target.value)} placeholder="搜索对话内容…" className="glass-input dm-search-input"/></div>
    <div className="dm-messages" ref={listRef}>
      {loadingConv?<Spinner/>:shown.length===0?<Empty icon="💬" title={q?'没有匹配的消息':'还没有消息'} desc={q?'换个关键词试试':'发送第一条消息吧'}/>:
        shown.map((m,i)=><div key={m.id??`l-${i}`} className={`dm-message ${m.sender_id===meId?'own':''}`}><BurnMessageContent m={m} meId={meId} onView={viewBurn}/><span className="dm-msg-meta"><span className="dm-msg-time">{fmtChatTime(m.created_at)}</span>{m.sender_id===meId&&!m.burn_mode&&<span className="dm-msg-receipt">{m.read?'已读':'✓'}</span>}</span></div>)}
      {peerTyping&&<div className="dm-typing"><span className="dm-typing-dot"/><span className="dm-typing-text">对方正在输入…</span></div>}
    </div>
    <div className="dm-input-area"><BurnPicker value={burnMode} onChange={setBurnMode}/><form onSubmit={send} className="chat-input-form"><input value={input} onChange={onDmInput} placeholder="输入私信..." className="glass-input chat-input" disabled={sending}/><button type="submit" className="glass-button btn-primary chat-send-btn" disabled={!input.trim()||sending}>发送</button></form></div>
  </div>
}

// ── GroupChat（自建群聊）──
const GroupChat = ({ user, onOpenUser }) => {
  const toast=useToast();
  const [groups,setGroups]=useState([]);
  const [activeGid,setActiveGid]=useState(null);
  const [members,setMembers]=useState([]);
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState('');
  const [burnMode,setBurnMode]=useState(null);
  const [loading,setLoading]=useState(false);
  const [showCreate,setShowCreate]=useState(false);
  const [showManage,setShowManage]=useState(false);
  const [amCreator,setAmCreator]=useState(false);
  const [grpName,setGrpName]=useState('');
  const listRef=useRef(null);
  const wsRef=useRef(null);
  const meId=user?.id;
  const loadGroups=useCallback(async()=>{ try{ const r=await apiFetch('/groups'); if(r.ok)setGroups(await r.json()) }catch{} },[]);
  useEffect(()=>{ loadGroups() },[loadGroups]);
  const openGroup=useCallback(async(gid)=>{ setActiveGid(gid); setLoading(true); setMessages([]);
    try{ const [mr,dr]=await Promise.all([apiFetch(`/groups/${gid}/messages?limit=50`),apiFetch(`/groups/${gid}`)]); if(mr.ok)setMessages(await mr.json()); if(dr.ok){ const d=await dr.json(); setAmCreator(d.am_i_creator); setGrpName(d.name) } }catch{} finally{ setLoading(false) } },[meId]);
  // 群 WS：只收实时推送（新消息/焚毁）；发送走 REST
  useEffect(()=>{
    if(activeGid==null) return
    let ws
    try{ ws=new WebSocket(`${WS_BASE}/group/${activeGid}?token=${encodeURIComponent(getToken())}`) }catch(e){ return }
    wsRef.current=ws
    ws.onmessage=(ev)=>{ try{
      const d=JSON.parse(ev.data)
      if(d.type==='message'){ if(d.sender_id!==meId) setMessages(prev=>prev.some(x=>x.id===d.id)?prev:[...prev,d]) }
      else if(d.type==='burned'){ setMessages(prev=>prev.map(m=>m.id===d.id?{...m,burned:true,content:null,state:'burned'}:m)) }
    }catch(e){} }
    return ()=>{ try{ ws.close() }catch(e){}; wsRef.current=null }
  },[activeGid,meId]);
  const send=async(e)=>{ e.preventDefault(); if(!input.trim()||!activeGid)return;
    const tmpId='tmp-'+Date.now(); const bm=burnMode;
    setMessages(prev=>[...prev,{id:tmpId,user_id:meId,nickname:user.nickname,avatar:user.avatar,content:bm?null:input,burn_mode:bm,burned:false,state:bm?'own':'permanent',created_at:new Date().toISOString()}]); setInput('');
    try{ const r=await apiFetch(`/groups/${activeGid}/messages`,{method:'POST',body:JSON.stringify({content:input,burn_mode:bm})}); if(!r.ok)throw new Error(await errMsg(r,'发送失败')); const u=await r.json(); setMessages(prev=>prev.map(m=>m.id===tmpId?u:m)); loadGroups() }catch(err){ setMessages(prev=>prev.filter(m=>m.id!==tmpId)); toast.error(err.message||'发送失败') } };
  const viewBurn=async(m)=>{ try{ const r=await apiFetch(`/burn/group/${m.id}/view`,{method:'POST'}); if(!r.ok)throw new Error(await errMsg(r,'查看失败')); const v=await r.json();
    if(v.content!=null){ setMessages(prev=>prev.map(x=>x.id===m.id?{...x,content:v.content,state:'revealed',revealed:true}:x)) }
    else if(v.burned){ setMessages(prev=>prev.map(x=>x.id===m.id?{...x,burned:true,content:null,state:'burned'}:x)) }
  }catch(err){ toast.error(err.message) } };
  useEffect(()=>{ if(activeGid==null)return; const f=async()=>{ try{ const r=await apiFetch(`/groups/${activeGid}/members`); if(r.ok)setMembers(await r.json()) }catch{} }; f() },[activeGid,showManage]);
  useEffect(()=>{ const el=listRef.current; if(!el)return; el.scrollTop=el.scrollHeight },[messages.length]);
  if(activeGid==null){
    return <div className="dm-page"><div className="dm-list-head" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span>群聊</span><button className="glass-button btn-primary" style={{padding:'.2rem .6rem',fontSize:'.8rem'}} onClick={()=>setShowCreate(true)}>＋ 建群</button></div>
      {groups.length===0?<Empty icon="👥" title="还没有群聊" desc="点右上角建群，拉上好友一起聊"/>:<div className="dm-list">{groups.map(g=><div key={g.id} className="dm-conv" onClick={()=>openGroup(g.id)}><div className="group-avatar"><svg viewBox="0 0 24 24" fill="currentColor" style={{width:'22px',height:'22px'}} aria-hidden="true"><circle cx="9" cy="8" r="3.4"/><path d="M2.5 19c.7-3.6 3.3-5.5 6.5-5.5s5.8 1.9 6.5 5.5z"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 13.8c2.9.2 5.2 1.9 6 5.2h-5.1c-.2-2-1-3.7-2.3-4.8.5-.3 1-.4 1.4-.4z"/></svg></div><div className="dm-conv-info"><div className="dm-conv-top"><span className="dm-conv-name">{g.name}</span>{g.unread>0&&<span className="notif-badge">{g.unread>99?'99+':g.unread}</span>}</div><span className="dm-conv-last">{g.last_message||(g.member_count>0?`${g.member_count} 人`:'')}</span></div></div>)}</div>}
      {showCreate&&<GroupCreateModal user={user} onClose={()=>setShowCreate(false)} onCreated={(gid)=>{setShowCreate(false);openGroup(gid);loadGroups()}}/>}
    </div>
  }
  const shown=messages;
  return <div className="dm-page dm-thread">
    <div className="dm-thread-head"><button className="dm-back" onClick={()=>{setActiveGid(null);loadGroups()}}>←</button>
      <span className="dm-conv-name">{grpName}</span><span className="group-avatar-sm">👥</span>
      <button className="glass-button" style={{marginLeft:'auto',padding:'.15rem .5rem',fontSize:'0.75rem'}} onClick={()=>setShowManage(true)}>⚙ 管理</button>
    </div>
    <div className="dm-messages" ref={listRef}>
      {loading?<Spinner/>:shown.length===0?<Empty icon="💬" title="还没有消息" desc="发第一条消息吧"/>:
        shown.map((m,i)=>{ const isOwn=m.user_id===meId; return <div key={m.id??`l-${i}`} className={`dm-message ${isOwn?'own':''}`}>
          <div style={{display:'flex',alignItems:'center',gap:'.3rem'}}><Avatar src={m.avatar} seed={m.nickname} className="group-msg-avatar"/><span className="group-msg-sender">{m.nickname||'匿名用户'}</span></div>
          {m.burn_mode?(m.burned?<span className="burn-card gone">🔥 此消息已焚毁</span>:m.state==='own'||m.revealed?<span className="burn-card revealed">{m.content}</span>:<button className="burn-card" onClick={()=>viewBurn(m)}><span>🔥 阅后即焚消息</span><span className="burn-tap">👆 点击查看</span></button>):<span className="dm-msg-content">{m.content}</span>}
        </div> })}
    </div>
    <div className="dm-input-area"><BurnPicker value={burnMode} onChange={setBurnMode}/><form onSubmit={send} className="chat-input-form"><input value={input} onChange={e=>setInput(e.target.value)} placeholder="输入群消息..." className="glass-input chat-input"/><button type="submit" className="glass-button btn-primary chat-send-btn" disabled={!input.trim()}>发送</button></form></div>
    {showManage&&<GroupManageModal user={user} gid={activeGid} name={grpName} members={members} amCreator={amCreator} onClose={()=>setShowManage(false)} onChanged={()=>{loadGroups();openGroup(activeGid)}} onOpenUser={onOpenUser}/>}
  </div>
};

// 建群弹窗：默认直接列出用户名录（点选即加），输入框仅做过滤
const GroupCreateModal = ({ user, onClose, onCreated }) => {
  const toast=useToast();
  const [name,setName]=useState('');
  const [q,setQ]=useState('');
  const [picked,setPicked]=useState([]);
  const [results,setResults]=useState([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  // 打开即拉名录（按 karma 排序），输入时转为过滤
  useEffect(()=>{ let m=true; setLoading(true);
    apiFetch('/users/directory?limit=30'+(q.trim()?`&q=${encodeURIComponent(q.trim())}`:''))
      .then(res=>{ if(!m)return; return res.ok ? res.json() : [] })
      .then(list=>{ if(m){ setResults(Array.isArray(list)?list:[]); setLoading(false) } })
      .catch(()=>{ if(m)setLoading(false) });
    return ()=>{m=false} },[q]);
  const toggle=(u)=>{ setPicked(prev=>prev.some(x=>x.id===u.id)?prev.filter(x=>x.id!==u.id):[...prev,u]) };
  const create=async()=>{ if(!name.trim()){ toast.error('请输入群名'); return } if(picked.length===0){ toast.error('至少选 1 位成员'); return }
    setBusy(true); try{ const r=await apiFetch('/groups',{method:'POST',body:JSON.stringify({name:name.trim(),member_ids:picked.map(u=>u.id)})}); if(!r.ok)throw new Error(await errMsg(r,'建群失败')); const g=await r.json(); toast.success('群已创建'); onCreated&&onCreated(g.id) }catch(e){ toast.error(e.message) }finally{ setBusy(false) } };
  return <AnimatedModal onClose={onClose} className="follow-list-modal">{({requestClose})=>(<>
    <h3>创建群聊</h3>
    <input className="glass-input" placeholder="群名称（最多 64 字）" value={name} maxLength={64} onChange={e=>setName(e.target.value)} style={{marginBottom:'.5rem'}}/>
    <input className="glass-input" placeholder="过滤成员（可不填，直接点下面的人）" value={q} onChange={e=>setQ(e.target.value)}/>
    <div className="group-pick-hint">{picked.length>0?<span>已选 {picked.length} 人：{picked.map(u=>u.nickname).join('、')}</span>:<span>点击下方用户加入你的群</span>}</div>
    {loading?<Spinner/>:(
      <div className="group-member-grid">
        {picked.map(u=><div key={'p'+u.id} className="group-member-item group-member-picked" onClick={()=>toggle(u)} title="点击移除"><Avatar src={u.avatar} seed={u.nickname} className="group-member-avatar"/><span>{u.nickname}</span><b className="group-pick-mark">✓</b></div>)}
        {results.filter(u=>u.id!==user.id&&!picked.some(x=>x.id===u.id)).map(u=><div key={u.id} className="group-member-item group-member-cand" onClick={()=>toggle(u)}><Avatar src={u.avatar} seed={u.nickname} className="group-member-avatar"/><span>{u.nickname}</span><span className="burn-tap">＋</span></div>)}
        {!loading&&results.filter(u=>u.id!==user.id).length===0&&picked.length===0&&<div className="group-empty">没有匹配的用户，换个词试试</div>}
      </div>
    )}
    <div className="modal-actions"><button className="glass-button btn-secondary" onClick={requestClose}>取消</button><button className="glass-button btn-primary" onClick={create} disabled={busy||!name.trim()||picked.length===0}>{busy?'创建中…':'创建'}</button></div>
  </>)}</AnimatedModal>;
};

// 群管理弹窗：成员列表 + 名录选人拉入 + （群主）踢人/改名/解散
const GroupManageModal = ({ user, gid, name, members, amCreator, onClose, onChanged, onOpenUser }) => {
  const toast=useToast();
  const [q,setQ]=useState('');
  const [cands,setCands]=useState([]);
  const [newName,setNewName]=useState(name);
  // 默认列出非成员用户；输入做过滤
  useEffect(()=>{ let m=true;
    apiFetch('/users/directory?limit=30'+(q.trim()?`&q=${encodeURIComponent(q.trim())}`:''))
      .then(res=>{ if(!m)return; return res.ok ? res.json() : [] })
      .then(list=>{ if(m)setCands(Array.isArray(list)?list.filter(u=>!members.some(mm=>mm.id===u.id)):[]) })
      .catch(()=>{ if(m)setCands([]) });
    return ()=>{m=false} },[q,members]);
  const addUser=async(u)=>{ try{ const r=await apiFetch(`/groups/${gid}/members`,{method:'POST',body:JSON.stringify({user_ids:[u.id]})}); if(!r.ok)throw new Error(await errMsg(r,'拉人失败')); toast.success(`${u.nickname} 已入群`); setQ(''); onChanged&&onChanged() }catch(e){ toast.error(e.message) } };
  const kick=async(u)=>{ if(!confirm(`移出 ${u.nickname}？`))return; try{ const r=await apiFetch(`/groups/${gid}/members/${u.id}`,{method:'DELETE'}); if(!r.ok)throw new Error(await errMsg(r,'操作失败')); toast.success('已移出'); onChanged&&onChanged() }catch(e){ toast.error(e.message) } };
  const rename=async()=>{ if(!newName.trim())return; try{ const r=await apiFetch(`/groups/${gid}/name`,{method:'PUT',body:JSON.stringify({name:newName.trim()})}); if(!r.ok)throw new Error(await errMsg(r,'改名失败')); toast.success('已改名'); onChanged&&onChanged() }catch(e){ toast.error(e.message) } };
  const disband=async()=>{ if(!confirm('确定解散此群？所有人将无法再进入。'))return; try{ const r=await apiFetch(`/groups/${gid}`,{method:'DELETE'}); if(!r.ok)throw new Error(await errMsg(r,'解散失败')); toast.success('群已解散'); onClose(); onChanged&&onChanged() }catch(e){ toast.error(e.message) } };
  const leave=async()=>{ if(!confirm('确定退出此群？退出后需重新被拉入。'))return; try{ const r=await apiFetch(`/groups/${gid}/leave`,{method:'POST'}); if(!r.ok)throw new Error(await errMsg(r,'退群失败')); toast.success('已退出群聊'); onClose(); onChanged&&onChanged() }catch(e){ toast.error(e.message) } };
  return <AnimatedModal onClose={onClose} className="follow-list-modal">{({requestClose})=>(<>
    <h3>群管理 · {name}</h3>
    {amCreator&&<div style={{display:'flex',gap:'.4rem',marginBottom:'.5rem'}}><input className="glass-input" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="新群名" style={{flex:1}}/><button className="glass-button" onClick={rename}>改名</button></div>}
    <input className="glass-input" placeholder="过滤并拉人（可不填，直接点下面的人）" value={q} onChange={e=>setQ(e.target.value)}/>
    <div className="group-member-grid">
      {cands.map(u=><div key={u.id} className="group-member-item group-member-cand" onClick={()=>addUser(u)}><Avatar src={u.avatar} seed={u.nickname} className="group-member-avatar"/><span>{u.nickname}</span><span className="burn-tap">＋ 拉入</span></div>)}
      {cands.length===0&&<div className="group-empty">没有可拉的用户</div>}
    </div>
    <div className="group-member-grid" style={{marginTop:'.5rem'}}>
      {members.map(m=><div key={m.id} className="group-member-item"><Avatar src={m.avatar} seed={m.nickname} className="group-member-avatar"/><span>{m.nickname}{m.id===user.id?'（我）':''}</span>{m.id!==user.id&&amCreator&&<button className="burn-opt" style={{fontSize:'.65rem'}} onClick={()=>kick(m)}>移出</button>}</div>)}
    </div>
    <div className="modal-actions">
      <button className="glass-button btn-secondary" onClick={requestClose}>关闭</button>
      {!amCreator&&<button className="glass-button btn-danger" onClick={leave}>退出群聊</button>}
      {amCreator&&<button className="glass-button btn-danger" onClick={disband}>解散群</button>}
    </div>
  </>)}</AnimatedModal>;
};

// ── PollsSection（信息流投票特殊卡片：顶部展示进行中的投票）──
const PollCard = ({ p, picking, setPicking, onVote, onRetract }) => {
  const voted = (p.my_votes || []).length > 0
  const max = Math.max(1, ...(p.results || []))
  const toggle = (idx) => {
    if (voted || p.closed) return
    setPicking(prev => {
      const n = new Set(prev)
      if (p.multi) { n.has(idx) ? n.delete(idx) : n.add(idx) }
      else { n.clear(); n.add(idx) }
      return n
    })
  }
  const sel = [...picking]
  return (
    <div className="glass-card poll-card">
      <div className="poll-head">
        <span className="poll-badge">📊 投票</span>
        {p.closed && <span className="poll-closed">已截止</span>}
      </div>
      <h4 className="poll-q">{p.question}</h4>
      <div className="poll-opts">
        {p.options.map((opt, idx) => {
          const cnt = (p.results || [])[idx] || 0
          const pct = p.total_votes ? Math.round(cnt / p.total_votes * 100) : 0
          const chosen = voted ? p.my_votes.includes(idx) : picking.has(idx)
          return (
            <button key={idx} type="button" className={`poll-opt ${chosen ? 'chosen' : ''} ${voted ? 'voted' : ''}`}
              onClick={() => toggle(idx)} disabled={p.closed && !voted}>
              <span className="poll-opt-label">{p.multi ? (chosen ? '☑' : '▫') : (chosen ? '🔘' : '○')} {opt}</span>
              {voted && <span className="poll-opt-bar"><span className="poll-opt-fill" style={{ width: pct + '%' }} /></span>}
              {voted && <span className="poll-opt-pct">{cnt} 票 · {pct}%</span>}
            </button>
          )
        })}
      </div>
      <div className="poll-foot">
        <span className="poll-total">{p.total_votes} 人参与 · {p.multi ? '多选' : '单选'}</span>
        {!p.closed && (voted
          ? <button className="poll-retract" onClick={() => onRetract(p)}>撤票</button>
          : <button className="poll-vote-btn" disabled={sel.length === 0} onClick={() => onVote(p, sel)}>投票</button>)}
      </div>
    </div>
  )
}

const PollsSection = () => {
  const toast = useToast()
  const [polls, setPolls] = useState([])
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState({})
  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await apiFetch('/polls'); if (r.ok) setPolls(await r.json()) } catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  const vote = async (p, sel) => {
    try {
      const r = await apiFetch(`/polls/${p.id}/vote`, { method: 'POST', body: JSON.stringify({ options: sel }) })
      if (!r.ok) throw new Error(await errMsg(r, '投票失败'))
      const d = await r.json(); setPolls(ps => ps.map(x => x.id === p.id ? d : x))
      setPicking(pk => { const n = { ...pk }; delete n[p.id]; return n })
      toast.success('投票成功')
    } catch (e) { toast.error(e.message || '投票失败') }
  }
  const retract = async (p) => {
    try {
      const r = await apiFetch(`/polls/${p.id}/vote`, { method: 'DELETE' })
      if (!r.ok) throw new Error(await errMsg(r, '撤票失败'))
      const d = await r.json(); setPolls(ps => ps.map(x => x.id === p.id ? d : x))
      toast.success('已撤票')
    } catch (e) { toast.error(e.message || '撤票失败') }
  }
  if (loading) return <Spinner />
  if (!polls.length) return null
  return (
    <div className="polls-section">
      {polls.map(p => (
        <PollCard key={p.id} p={p} picking={picking[p.id] || new Set()}
          setPicking={(s) => setPicking(pk => ({ ...pk, [p.id]: s }))}
          onVote={vote} onRetract={retract} />
      ))}
    </div>
  )
}

// ── 手写 SVG 迷你图表（暗金风，零依赖）──
const StatLine = ({ data, color = '#d4af37', height = 70 }) => {
  const W = 300, H = height
  const vals = data.map(d => d.value != null ? d.value : (d.count || 0))
  const max = Math.max(1, ...vals)
  const n = data.length
  const x = i => (n <= 1 ? 0 : i / (n - 1) * W)
  const y = v => H - (v / max) * (H - 10) - 5
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `0,${H} ${pts} ${W},${H}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="stat-svg" preserveAspectRatio="none" width="100%" height={H}>
      <polygon points={area} fill={color} opacity="0.12" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}
const StatDualLine = ({ data, height = 70 }) => {
  const W = 300, H = height
  const pv = data.map(d => d.posts || 0), cv = data.map(d => d.comments || 0)
  const max = Math.max(1, ...pv, ...cv)
  const n = data.length
  const x = i => (n <= 1 ? 0 : i / (n - 1) * W)
  const y = v => H - (v / max) * (H - 10) - 5
  const line = arr => arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="stat-svg" preserveAspectRatio="none" width="100%" height={H}>
      <polyline points={line(pv)} fill="none" stroke="#d4af37" strokeWidth="2" />
      <polyline points={line(cv)} fill="none" stroke="#9fb4ff" strokeWidth="2" />
    </svg>
  )
}
const StatBars = ({ data, color = '#d4af37', height = 90 }) => {
  const W = 300, H = height
  const max = Math.max(1, ...data.map(d => d.count || 0))
  const n = data.length || 1
  const bw = W / n
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="stat-svg" preserveAspectRatio="none" width="100%" height={H}>
      {data.map((d, i) => {
        const h = (d.count || 0) / max * (H - 16)
        const label = String(d.name || d.spread || '').slice(0, 4)
        return (
          <g key={i}>
            <rect x={i * bw + 3} y={H - h - 14} width={Math.max(2, bw - 6)} height={h} rx="2" fill={color} opacity="0.8" />
            <text x={i * bw + bw / 2} y={H - 3} fontSize="9" fill="#cbb27a" textAnchor="middle">{label}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── AdminPage ──
const AdminPage = ({user}) => {
  const toast=useToast(); const [stats,setStats]=useState(null); const [ulist,setUlist]=useState([]); const [reports,setReports]=useState([]); const [plist,setPlist]=useState([]); const [psearch,setPsearch]=useState(''); const [tab,setTab]=useState('stats'); const [loading,setLoading]=useState(true); const [muteMins,setMuteMins]=useState(60); const [reportStatus,setReportStatus]=useState('')
  const loadReports = useCallback(async()=>{ try{ const r=await apiFetch('/admin/reports'+(reportStatus?`?status=${reportStatus}`:'')); if(r.ok)setReports(await r.json()) }catch{} },[reportStatus])
  useEffect(()=>{ const f=async()=>{ setLoading(true); try{ const [sr,ur,pr]=await Promise.all([apiFetch(`/admin/stats`),apiFetch(`/admin/users`),apiFetch(`/admin/posts`)]); if(sr.ok)setStats(await sr.json()); if(ur.ok)setUlist(await ur.json()); if(pr.ok)setPlist(await pr.json()); await loadReports() }catch(e){toast.error('加载失败')} finally{setLoading(false)} }; f() },[loadReports])
  useEffect(()=>{ if(tab==='reports') loadReports() },[tab,loadReports])
  const [blist,setBlist]=useState([])
  const [bkKey,setBkKey]=useState(''); const [bkName,setBkName]=useState(''); const [bkIcon,setBkIcon]=useState('📝'); const [bkOrder,setBkOrder]=useState(0); const [bkEditId,setBkEditId]=useState(null)
  const loadBoards = useCallback(async()=>{ try{ const r=await apiFetch('/boards?all=1'); if(r.ok)setBlist(await r.json()) }catch{} },[])
  useEffect(()=>{ if(tab==='boards') loadBoards() },[tab,loadBoards])
  const resetBk=()=>{ setBkEditId(null); setBkKey(''); setBkName(''); setBkIcon('📝'); setBkOrder(0) }
  const saveBk=async()=>{ try{ if(!bkKey.trim()||!bkName.trim()){toast.error('key 与名称不能为空');return} const body=JSON.stringify({key:bkKey.trim(),name:bkName.trim(),icon:bkIcon,description:'',sort_order:bkOrder}); let r; if(bkEditId){ r=await apiFetch(`/boards/${bkEditId}`,{method:'PUT',body}) } else { r=await apiFetch('/boards',{method:'POST',body}) } if(!r.ok)throw new Error(await errMsg(r,'保存失败')); await loadBoards(); resetBk(); toast.success('已保存板块') }catch(e){ toast.error(e.message||'保存失败') } }
  const toggleBk=async(b)=>{ try{ const r=await apiFetch(`/boards/${b.id}`,{method:'PUT',body:JSON.stringify({key:b.key,name:b.name,icon:b.icon,description:b.description,sort_order:b.sort_order,active:!b.active})}); if(!r.ok)throw new Error(await errMsg(r,'操作失败')); setBlist(bs=>bs.map(x=>x.id===b.id?{...x,active:!b.active}:x)); toast.success(b.active?'已隐藏板块':'已显示板块') }catch(e){ toast.error(e.message) } }
  const delBk=async(b)=>{ if(!confirm(`确认删除板块「${b.name}」？`))return; try{ const r=await apiFetch(`/boards/${b.id}`,{method:'DELETE'}); if(!r.ok)throw new Error(await errMsg(r,'删除失败')); setBlist(bs=>bs.filter(x=>x.id!==b.id)); toast.success('已删除板块') }catch(e){ toast.error(e.message) } }
  const editBk=(b)=>{ setBkEditId(b.id); setBkKey(b.key); setBkName(b.name); setBkIcon(b.icon); setBkOrder(b.sort_order) }
  // ── 投票管理（创始人 / 大使可发起、截止、删除）──
  const [pollList,setPollList]=useState([])
  const [pq,setPq]=useState(''); const [popts,setPopts]=useState(''); const [pmulti,setPmulti]=useState(false)
  const loadPolls = useCallback(async()=>{ try{ const r=await apiFetch('/polls?all=1'); if(r.ok)setPollList(await r.json()) }catch{} },[])
  useEffect(()=>{ if(tab==='polls') loadPolls() },[tab,loadPolls])
  const savePoll=async()=>{ try{ const opts=popts.split('\n').map(s=>s.trim()).filter(Boolean); if(!pq.trim()){toast.error('问题不能为空');return} if(opts.length<2){toast.error('至少两个选项（每行一个）');return} const body=JSON.stringify({question:pq.trim(),options:opts,multi:pmulti}); const r=await apiFetch('/polls',{method:'POST',body}); if(!r.ok)throw new Error(await errMsg(r,'发起失败')); await loadPolls(); setPq(''); setPopts(''); setPmulti(false); toast.success('已发起投票') }catch(e){ toast.error(e.message||'发起失败') } }
  const closePoll=async(p)=>{ try{ const r=await apiFetch(`/polls/${p.id}/close`,{method:'PUT'}); if(!r.ok)throw new Error(await errMsg(r,'操作失败')); setPollList(ps=>ps.map(x=>x.id===p.id?{...x,closed:!x.closed}:x)); toast.success(p.closed?'已重新开启':'已截止') }catch(e){ toast.error(e.message) } }
  const delPoll=async(p)=>{ if(!confirm(`确认删除投票「${p.question}」？删除后票数一并清除`))return; try{ const r=await apiFetch(`/polls/${p.id}`,{method:'DELETE'}); if(!r.ok)throw new Error(await errMsg(r,'删除失败')); setPollList(ps=>ps.filter(x=>x.id!==p.id)); toast.success('已删除投票') }catch(e){ toast.error(e.message) } }
  const updReport = async(id,st,action='none')=>{ try{ const url=`/admin/reports/${id}/status?status=${st}`+(action!=='none'?`&action=${action}`:''); const r=await apiFetch(url,{method:'PUT'}); if(!r.ok)throw new Error(await errMsg(r,'更新失败')); setReports(rs=>rs.map(x=>x.id===id?{...x,status:st}:x)); toast.success(action!=='none'?'已删除内容并处理举报':'状态已更新') }catch(e){toast.error(e.message||'更新失败')} }
  // ── 教师审批 + 校方账号（founder 专属）──
  const isFounder = user.role==='founder'
  // 教师审核按校下放：本校校方与站长都能审，后端 approver_scope 再收一次口
  const canApproveTeachers = isFounder || (user.role==='school_official' && user.approved!==false)
  const [tApprovals,setTApprovals]=useState([])
  const loadTApprovals = useCallback(async()=>{ if(!canApproveTeachers)return; try{ const r=await apiFetch('/admin/teacher-approvals'); if(r.ok)setTApprovals(await r.json()) }catch{} },[canApproveTeachers])
  useEffect(()=>{ if(tab==='teachers'&&canApproveTeachers) loadTApprovals() },[tab,loadTApprovals,canApproveTeachers])
  const approveT = async(id)=>{ try{ const r=await apiFetch(`/admin/teacher-approvals/${id}/approve`,{method:'POST'}); if(!r.ok)throw new Error(await errMsg(r,'操作失败')); const d=await r.json(); toast.success(d.message||'已批准'); loadTApprovals() }catch(e){ toast.error(e.message) } }
  const rejectT = async(id)=>{ if(!confirm('确认驳回该教师申请？账号将被移除'))return; try{ const r=await apiFetch(`/admin/teacher-approvals/${id}/reject`,{method:'POST'}); if(!r.ok)throw new Error(await errMsg(r,'操作失败')); toast.success('已驳回'); loadTApprovals() }catch(e){ toast.error(e.message) } }
  const [soSchool,setSoSchool]=useState('JSKS')
  const [soResult,setSoResult]=useState(null)
  const createSO = async()=>{ try{ const r=await apiFetch('/admin/school-officials',{method:'POST',body:JSON.stringify({school_id:soSchool})}); if(!r.ok)throw new Error(await errMsg(r,'开通失败')); const d=await r.json(); setSoResult(d); toast.success(d.message) }catch(e){ toast.error(e.message) } }
  const delPost = async(id)=>{ if(!confirm('确认删除该帖子？此操作不可恢复'))return; try{ const r=await apiFetch(`/posts/${id}`,{method:'DELETE'}); if(!r.ok)throw new Error(await errMsg(r,'删除失败')); setPlist(ps=>ps.filter(x=>x.id!==id)); toast.success('帖子已删除') }catch(e){toast.error(e.message)} }
  // 管理范围：founder 管全部；大使只管本校；管理员（founder/ambassador）自身不可被操作
  const isAdminRole = user.role==='founder'||user.role==='ambassador'
  const [userSchoolFilter,setUserSchoolFilter]=useState('')
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
  <div className="admin-tabs">{canApproveTeachers&&<button className={`admin-tab ${tab==='teachers'?'active':''}`} onClick={()=>setTab('teachers')}>教师审批 ({tApprovals.length})</button>}<button className={`admin-tab ${tab==='stats'?'active':''}`} onClick={()=>setTab('stats')}>数据</button><button className={`admin-tab ${tab==='users'?'active':''}`} onClick={()=>setTab('users')}>用户</button><button className={`admin-tab ${tab==='reports'?'active':''}`} onClick={()=>setTab('reports')}>举报 ({reports.filter(r=>r.status==='pending').length})</button><button className={`admin-tab ${tab==='content'?'active':''}`} onClick={()=>setTab('content')}>内容 ({plist.length})</button>{isAdminRole&&<><button className={`admin-tab ${tab==='boards'?'active':''}`} onClick={()=>setTab('boards')}>板块</button><button className={`admin-tab ${tab==='polls'?'active':''}`} onClick={()=>setTab('polls')}>投票</button></>}</div>
  {tab==='teachers'&&canApproveTeachers&&<div className="glass-card" style={{padding:'1rem'}}>
    <h3 style={{margin:'0 0 .75rem'}}>👨‍🏫 教师身份审批{isFounder?'':'（仅限本校）'}</h3>
    {tApprovals.length===0?<Empty icon="✅" title="暂无待审教师" desc="教师注册申请会出现在这里"/>:<div className="t-approval-list">{tApprovals.map(t=><div key={t.id} className="t-approval-item" style={{display:'flex',alignItems:'center',gap:'.6rem',padding:'.5rem 0',borderBottom:'1px solid var(--card-bd)'}}><Avatar src={null} seed={t.nickname} className="nav-avatar"/><div style={{flex:1}}><div><b>{t.nickname}</b> <span style={{fontSize:'.74rem',color:'var(--muted)'}}>{t.username}</span></div><div style={{fontSize:'.72rem',color:'var(--muted)'}}>UID {t.uid} · 学校 {t.school_id}</div></div><button className="glass-button btn-primary" style={{padding:'.3rem .7rem',fontSize:'.8rem'}} onClick={()=>approveT(t.id)}>批准</button><button className="glass-button btn-danger" style={{padding:'.3rem .7rem',fontSize:'.8rem'}} onClick={()=>rejectT(t.id)}>驳回</button></div>)}</div>}
    {isFounder&&<>
    <h3 style={{margin:'1.25rem 0 .5rem'}}>🏫 开通学校官方账号</h3>
    <div style={{display:'flex',flexWrap:'wrap',gap:'.4rem',alignItems:'center'}}>
      <select value={soSchool} onChange={e=>setSoSchool(e.target.value)} className="glass-input" style={{width:'auto'}}>{SCHOOLS.map(s=><option key={s.code} value={s.code}>{s.name}</option>)}</select>
      <button className="glass-button btn-primary" onClick={createSO}>一键开通（自动生成账号密码）</button>
    </div>
    {soResult&&<p style={{fontSize:'.8rem',color:'var(--fg)',margin:'.5rem 0 0'}}>已开通 —— 用户名 <b>{soResult.username}</b>　密码 <b>{soResult.password}</b>（请线下交给学校）</p>}
    <p style={{fontSize:'.72rem',color:'var(--muted)',margin:'.5rem 0 0'}}>12 校已默认开通（用户名 校码official，密码 校码001）。以后新增学校，在此选校一键开通即可。</p>
    </>}
  </div>}
  {tab==='stats'&&stats&&<div className="admin-stats-wrap">
    <div className="admin-stats">
      <div className="glass-card stat-card"><span className="stat-number">{stats.total_users}</span><span className="stat-desc">注册用户</span></div>
      <div className="glass-card stat-card"><span className="stat-number">{stats.total_posts}</span><span className="stat-desc">帖子总数</span></div>
      <div className="glass-card stat-card"><span className="stat-number">{stats.total_comments}</span><span className="stat-desc">评论总数</span></div>
      <div className="glass-card stat-card"><span className="stat-number">{stats.pending_reports}</span><span className="stat-desc">待处理举报</span></div>
      <div className="glass-card stat-card"><span className="stat-number">{stats.new_users_30d}</span><span className="stat-desc">近30天新增用户</span></div>
      <div className="glass-card stat-card"><span className="stat-number">{stats.posts_30d}</span><span className="stat-desc">近30天发帖</span></div>
      <div className="glass-card stat-card"><span className="stat-number">{stats.tarot?.total_draws||0}</span><span className="stat-desc">塔罗总抽牌</span></div>
      <div className="glass-card stat-card"><span className="stat-number">{stats.tarot?.ai_count||0}</span><span className="stat-desc">AI 解读次数</span></div>
    </div>
    <div className="stat-charts">
      <div className="glass-card stat-chart-card"><h4>近 30 天塔罗抽牌</h4><StatLine data={stats.tarot?.daily||[]} /></div>
      <div className="glass-card stat-chart-card"><h4>近 30 天发帖 / 评论</h4><div className="stat-legend"><span className="lg gold">发帖</span><span className="lg blue">评论</span></div><StatDualLine data={stats.activity_daily||[]} /></div>
      <div className="glass-card stat-chart-card"><h4>板块帖子分布</h4><StatBars data={stats.board_dist||[]} /></div>
      <div className="glass-card stat-chart-card"><h4>牌阵占比</h4><StatBars data={(stats.tarot?.spread_dist||[]).map(d=>({name:d.spread,count:d.count}))} color="#b98cff" /></div>
    </div>
    <div className="stat-lists">
      <div className="glass-card stat-list-card"><h4>🔮 最常出现的牌 Top 10</h4>{(stats.tarot?.top_cards||[]).length===0?<p className="stat-empty">暂无抽牌记录</p>:<ol className="stat-top-list">{stats.tarot.top_cards.map(c=><li key={c.name}><span>{c.name}</span><span className="stat-top-count">{c.count}</span></li>)}</ol>}</div>
      <div className="glass-card stat-list-card"><h4>🤖 解读来源</h4><div className="stat-src"><div><span className="stat-number">{stats.tarot?.ai_count||0}</span><span className="stat-desc">AI 解读</span></div><div><span className="stat-number">{stats.tarot?.builtin_count||0}</span><span className="stat-desc">内置解读</span></div></div></div>
    </div>
  </div>}
  {tab==='users'&&<div className="admin-list">
    <div className="mute-bar">学校筛选：
      <select className="glass-input" style={{width:'auto'}} value={userSchoolFilter} onChange={e=>setUserSchoolFilter(e.target.value)}>
        <option value="">全部学校</option>
        {SCHOOLS.map(s=><option key={s.code} value={s.code}>{s.name}</option>)}
      </select>
      <span style={{fontSize:'.72rem',color:'var(--muted)'}}>共 {ulist.filter(u=>!userSchoolFilter||u.school_id===userSchoolFilter).length} 人</span>
    </div>
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
    {ulist.filter(u=>!userSchoolFilter||u.school_id===userSchoolFilter).map(u=><div key={u.id} className="glass-card admin-user-card">
      <div className="admin-user-info"><span className="uid-badge">{u.uid||'------'}</span><span className="admin-username">@{u.username}</span><span className="admin-nickname">{u.nickname}</span>{u.role==='founder'&&<span className="role-badge founder">创始人</span>}{u.role==='ambassador'&&<span className="role-badge ambassador">大使</span>}{u.role==='teacher'&&u.approved!==false&&<span className="role-badge teacher">👨‍🏫 教师</span>}{u.role==='teacher'&&u.approved===false&&<span className="role-badge teacher">教师（审核中）</span>}{u.role==='school_official'&&<span className="role-badge school_official">🏫 学校官方</span>}{u.banned&&<span className="role-badge banned">已封禁</span>}<span className="admin-school">{getSchoolName(u.school_id)}</span></div>
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
  {tab==='boards'&&<div className="admin-list">
    <div className="board-edit-bar">
      <input className="glass-input" placeholder="key(英文)" value={bkKey} onChange={e=>setBkKey(e.target.value)} />
      <input className="glass-input" placeholder="名称" value={bkName} onChange={e=>setBkName(e.target.value)} />
      <input className="glass-input board-icon-input" placeholder="图标" value={bkIcon} onChange={e=>setBkIcon(e.target.value)} />
      <input className="glass-input board-order-input" type="number" placeholder="排序" value={bkOrder} onChange={e=>setBkOrder(Number(e.target.value))} />
      <button className="save-btn" onClick={saveBk}>{bkEditId?'保存修改':'添加板块'}</button>
      {bkEditId&&<button className="glass-button btn-secondary" onClick={resetBk}>取消</button>}
    </div>
    {blist.length===0?<Empty icon="📋" title="暂无板块" desc="在上方添加第一个板块"/>:blist.map(b=><div key={b.id} className="glass-card admin-board-card">
      <span className="board-icon">{b.icon}</span>
      <span className="board-name">{b.name}</span>
      <span className="board-key">{b.key}</span>
      {!b.active&&<span className="board-hidden">已隐藏</span>}
      <div className="admin-board-actions">
        <button className="save-btn" onClick={()=>toggleBk(b)}>{b.active?'隐藏':'显示'}</button>
        <button className="glass-button btn-secondary" onClick={()=>editBk(b)}>编辑</button>
        <button className="danger-btn" onClick={()=>delBk(b)}>删除</button>
      </div>
    </div>)}
  </div>}
  {tab==='polls'&&<div className="admin-list">
    <div className="poll-edit-bar">
      <input className="glass-input" placeholder="投票问题" value={pq} onChange={e=>setPq(e.target.value)} />
      <textarea className="glass-input poll-opts-input" rows={3} placeholder="选项，每行一个" value={popts} onChange={e=>setPopts(e.target.value)} />
      <label className="checkbox-label"><input type="checkbox" checked={pmulti} onChange={e=>setPmulti(e.target.checked)} /><span>允许多选</span></label>
      <button className="save-btn" onClick={savePoll}>发起投票</button>
    </div>
    {pollList.length===0?<Empty icon="📊" title="暂无投票" desc="在上方发起第一个投票"/>:pollList.map(p=><div key={p.id} className="glass-card admin-poll-card">
      <div className="admin-poll-q">{p.question}</div>
      <div className="admin-poll-meta">{p.options.length} 个选项 · {p.total_votes} 票 · {p.multi?'多选':'单选'}{p.closed&&' · 已截止'}</div>
      <div className="admin-poll-opts">{p.options.map((o,i)=>{ const c=(p.results||[])[i]||0; const pct=p.total_votes?Math.round(c/p.total_votes*100):0; return <div key={i} className="admin-poll-opt"><span>{o}</span><span className="admin-poll-opt-pct">{c} 票 · {pct}%</span></div> })}</div>
      <div className="report-actions"><button className="save-btn" onClick={()=>closePoll(p)}>{p.closed?'重新开启':'截止'}</button><button className="danger-btn" onClick={()=>delPoll(p)}>删除</button></div>
    </div>)}
  </div>}
  </div>
}

// ── UserProfile（他人/自己主页：公开信息 + TA 的帖子）──
const UserProfile = ({userId, user, onBack, onOpenPost, onOpenUser, onStartDM}) => {
  const toast=useToast(); const [info,setInfo]=useState(null); const [posts,setPosts]=useState([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState(null); const [tick,setTick]=useState(0)
  const [followState,setFollowState]=useState(false); const [followBusy,setFollowBusy]=useState(false)
  const [socialStats,setSocialStats]=useState({followers:0,following:0}); const [showFollow,setShowFollow]=useState(null)
  useEffect(()=>{ const f=async()=>{ try{ const [st,stt]=await Promise.all([apiFetch(`/social/stats/${userId}`), user?.id?apiFetch(`/social/follow-state?ids=${userId}`):Promise.resolve({ok:false})]); if(st.ok)setSocialStats(await st.json()); if(stt.ok){ const j=await stt.json(); setFollowState((j.following_ids||[]).includes(userId)) } }catch{} }; f() },[userId,user])
  const toggleFollow=async()=>{ if(!user)return; setFollowBusy(true); try{ const r=await apiFetch(`/social/follow/${userId}`,{method:followState?'DELETE':'POST'}); if(!r.ok)throw new Error(await errMsg(r,'操作失败')); setFollowState(s=>!s); setSocialStats(s=>({...s, followers: s.followers + (followState?-1:1)})) }catch(e){ toast.error(e.message) }finally{ setFollowBusy(false) } }
  const openFollow=(t)=>setShowFollow(t)
  const load = useCallback(async()=>{ setLoading(true); setErr(null);
    try{ const [u,p]=await Promise.all([apiFetch(`/users/${userId}`),apiFetch(`/posts/?user_id=${userId}&limit=60`)]);
      if(!u.ok)throw new Error('加载失败'); const uj=await u.json(); const pj=p.ok?await p.json():[];
      setInfo(uj); setPosts(pj) }catch(e){ setErr(e.message||'加载失败') }finally{ setLoading(false) } },[userId,tick])
  useEffect(()=>{ load() },[load])
  return <div className="app"><button className="back-btn" onClick={onBack}>← 返回</button>
    <div className="glass-card profile-view-card">
      <Avatar src={info?.avatar} seed={info?.nickname} className="profile-view-avatar" />
      <div className="profile-view-info"><h3>{info?info.nickname:'加载中…'}</h3>
        <div className="profile-view-meta">
          {info?.role==='founder'&&<span className="role-badge founder">创始人</span>}
          {info?.role==='ambassador'&&<span className="role-badge ambassador">大使</span>}
          {info?.role==='teacher'&&info?.approved!==false&&<span className="role-badge teacher">👨‍🏫 教师</span>}
          {info?.role==='school_official'&&info?.approved!==false&&<span className="role-badge school_official">🏫 学校官方</span>}
          <span className="school-badge">{getSchoolName(info?.school_id)}</span>
          <span className="karma-badge">Karma {info?.karma||0}</span>
        </div>
      </div>
    </div>
    <div className="profile-view-actions">
      {userId!==user?.id && <><button className={`follow-btn ${followState?'following':''}`} onClick={toggleFollow} disabled={followBusy}>{followState?'已关注':'+ 关注'}</button><button className="msg-btn" onClick={()=>onStartDM&&onStartDM(userId)}>✉️ 私信</button></>}
      <button className="follow-count-btn" onClick={()=>openFollow('followers')}>粉丝 {socialStats.followers}</button>
      <button className="follow-count-btn" onClick={()=>openFollow('following')}>关注 {socialStats.following}</button>
    </div>
    {showFollow&&<FollowListModal type={showFollow} userId={userId} onClose={()=>setShowFollow(null)} onOpenUser={onOpenUser}/>}
    <h4 className="profile-view-section">TA 的帖子（{posts.length}）</h4>
    {loading?<Spinner/>:err?<ErrorBox msg={err} onRetry={()=>setTick(t=>t+1)}/>:posts.length===0?<Empty icon="📭" title="暂无帖子" desc="这个人还没有发过帖"/>:
      <div className="posts-list">{posts.map(p=><div key={p.id} className="glass-card post-card" onClick={()=>onOpenPost(p)}>
        {p.is_announcement&&<div className="announcement-badge">📢 公告</div>}
        <h4 className="post-title">{p.title}</h4><p className="post-preview">{p.content?.slice(0,100)}{p.content?.length>100?'...':''}</p>
        {p.images&&p.images.length>0&&<PostImages images={p.images}/>}
        <div className="post-footer"><span className="post-time">{fmtTime(p.created_at)}</span><span className="action-text">💬 {p.comment_count}</span><span className="action-text">⭐ {p.star_count}</span></div>
      </div>)}</div>}
  </div>
}

// ── ProfilePage ──
const PROFILE_BGS = [
  {key:'none', label:'默认', css:''},
  {key:'aurora', label:'极光', css:'linear-gradient(135deg,#1e3a8a,#7c3aed)'},
  {key:'sunset', label:'晚霞', css:'linear-gradient(135deg,#f97316,#db2777)'},
  {key:'mint', label:'薄荷', css:'linear-gradient(135deg,#059669,#06b6d4)'},
  {key:'rose', label:'蔷薇', css:'linear-gradient(135deg,#e11d48,#f43f5e)'},
  {key:'ocean', label:'海洋', css:'linear-gradient(135deg,#0ea5e9,#2563eb)'},
  {key:'bloom', label:'樱粉', css:'linear-gradient(135deg,#f9a8d4,#fbcfe8)'},
  {key:'midnight', label:'午夜', css:'linear-gradient(135deg,#0f172a,#334155)'},
]
const ProfilePage = ({user,setUser,onOpenPost,onOpenUser,setStoryOpen}) => {
  const toast=useToast(); const [nick,setNick]=useState(user.nickname); const [pw,setPw]=useState(''); const [profileBg,setProfileBg]=useState(user.profile_bg||''); const [bgOpen,setBgOpen]=useState(false)
  const isAdmin=user.role==='founder'||user.role==='ambassador'; const [isAnon,setIsAnon]=useState(isAdmin?false:user.is_anonymous!==false)
  const [ptab,setPtab]=useState('posts'); const [myPosts,setMyPosts]=useState([]); const [myComments,setMyComments]=useState([]); const [myStars,setMyStars]=useState([]); const [loadingTab,setLoadingTab]=useState(false)
  const [myStats,setMyStats]=useState({followers:0,following:0}); const [showMyFollow,setShowMyFollow]=useState(null)
  const [showDelete,setShowDelete] = useState(false); const [delPw,setDelPw]=useState(''); const [delBusy,setDelBusy]=useState(false)
  const [showPact,setShowPact] = useState(false)
  // 多端同步：服务器拉到的新背景即时覆盖本地编辑态，避免手机改完电脑仍显示旧背景
  useEffect(()=>{ setProfileBg(user.profile_bg||'') },[user.profile_bg])
  useEffect(()=>{ const f=async()=>{ try{ const r=await apiFetch(`/social/stats/${user.id}`); if(r.ok)setMyStats(await r.json()) }catch{} }; f() },[user.id])
  const deleteAccount=async()=>{ if(!confirm('确定要注销账号吗？此操作不可恢复'))return; setDelBusy(true); try{ const r=await apiFetch('/users/me',{method:'DELETE',body:JSON.stringify({password:delPw})}); if(!r.ok)throw new Error(await errMsg(r,'注销失败')); localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null); toast.success('账号已注销') }catch(e){ toast.error(e.message) }finally{ setDelBusy(false) } }
  useEffect(()=>{ let m=true; (async()=>{ setLoadingTab(true);
    try{ const [p,c,s]=await Promise.all([apiFetch(`/posts/?user_id=${user.id}&limit=60`),apiFetch('/users/me/comments'),apiFetch('/posts/starred')]);
      if(m){ setMyPosts(p.ok?await p.json():[]); setMyComments(c.ok?await c.json():[]); setMyStars(s.ok?await s.json():[]) } }catch{}finally{ if(m)setLoadingTab(false) } })();
    return ()=>{m=false} },[user.id])
  const openCommentPost = async (postId) => { if(!postId)return; try{ const r=await apiFetch(`/posts/${postId}`); if(r.ok)onOpenPost(await r.json()) }catch{} }
  const save=async(extra={})=>{ if(!nick?.trim()){toast.error('账户名不能为空');return}
    try{ const body={nickname:nick.trim(),is_anonymous:isAdmin?false:isAnon,...extra}; if(pw?.trim())body.password=pw.trim()
      const r=await apiFetch(`/users/${user.id}`,{method:'PUT',body:JSON.stringify(body)})
      if(!r.ok)throw new Error(await errMsg(r,'保存失败'))
      const u=await r.json(); setUser(u); localStorage.setItem('user',JSON.stringify(u)); setPw(''); toast.success(pw?.trim()?'保存成功，密码已更新':'保存成功') }catch(e){toast.error(e.message)} }
  const applyBg=(css)=>{ setProfileBg(css); save({profile_bg:css}) }
  const bgColorValue = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(profileBg) ? profileBg : '#7c3aed'
  const isImgBg = profileBg && !profileBg.startsWith('linear-gradient') && !profileBg.startsWith('#')
  return <div className="profile-page"><div className={`glass-card profile-card ${isImgBg?'profile-card-img-bg':''}`} style={profileBg?(/^#/.test(profileBg)?{backgroundColor:profileBg}:{backgroundImage:profileBg}):undefined}><label className="avatar-upload"><img src={avatarUrl(user.avatar) || fallbackAvatar(user.username)} alt="头像"/><div className="avatar-upload-overlay">📷</div><input type="file" accept="image/*" onChange={async e=>{const f=e.target.files[0];if(!f)return;const fd=new FormData();fd.append('file',f);try{const r=await apiFetch(`/users/${user.id}/avatar`,{method:'POST',body:fd});if(!r.ok)throw new Error(await errMsg(r,'头像更新失败'));const u=await r.json();u.avatar=(u.avatar||'')+'?t='+Date.now();setUser(u);localStorage.setItem('user',JSON.stringify(u));toast.success('头像已更新')}catch(err){toast.error(err.message||'头像更新失败')}}}/></label><div className="profile-info"><h3>{user.nickname}</h3><p className="profile-username">@{user.username}</p><span className="uid-badge">UID: {user.uid}</span>{user.role==='founder'&&<span className="role-badge founder">创始人</span>}{user.role==='ambassador'&&<span className="role-badge ambassador">大使</span>}{user.role==='teacher'&&<span className="role-badge teacher">👨‍🏫 教师{user.approved===false?'（审核中）':''}</span>}{user.role==='school_official'&&<span className="role-badge school_official">🏫 学校官方</span>}<div className="profile-stats"><div className="stat-item"><span className="stat-value">{user.star_count||0}</span><span className="stat-label">Star</span></div><div className="stat-item"><span className="stat-value">{user.karma||0}</span><span className="stat-label">Karma</span></div></div><div className="profile-follow-row"><button className="follow-count-btn" onClick={()=>setShowMyFollow('followers')}>粉丝 {myStats.followers}</button><button className="follow-count-btn" onClick={()=>setShowMyFollow('following')}>关注 {myStats.following}</button></div>{showMyFollow&&<FollowListModal type={showMyFollow} userId={user.id} onClose={()=>setShowMyFollow(null)} onOpenUser={onOpenUser}/>}<div className="karma-level" style={{marginTop:'.5rem',fontSize:'.85rem',opacity:.9}}>{['🌫️ 初来乍到','🌱 成长中的声音','🔥 活跃核心','🌟 鹿鸣之光'][Math.min(3,Math.floor((user.karma||0)/20))]}</div></div>
  <div className="profile-bg-row"><button className="bg-toggle-btn" onClick={()=>setBgOpen(!bgOpen)}>{profileBg?'更换背景':'设置背景'} {bgOpen?'▲':'▼'}</button>{bgOpen&&<div className="bg-panel glass-card"><div className="bg-panel-head"><span>卡片背景</span><button className="bg-clear" onClick={()=>{applyBg('');setBgOpen(false)}}>清除</button></div><div className="bg-swatches">{PROFILE_BGS.map(b=><button key={b.key} className={`bg-swatch ${profileBg===b.css?'active':''}`} style={{background:b.css||'rgba(255,255,255,0.18)'}} title={b.label} onClick={()=>applyBg(b.css)}/>)}<label className="bg-swatch bg-custom" title="自定义颜色"><input type="color" value={bgColorValue} onChange={e=>applyBg(e.target.value)}/></label><label className="bg-swatch bg-upload" title="上传图片"><input type="file" accept="image/*" onChange={async e=>{const f=e.target.files[0];if(!f)return;const fd=new FormData();fd.append('file',f);try{const r=await apiFetch(`/users/${user.id}/background`,{method:'POST',body:fd});if(!r.ok)throw new Error(await errMsg(r,'背景上传失败'));const u=await r.json();setUser(u);localStorage.setItem('user',JSON.stringify(u));setProfileBg(u.profile_bg);toast.success('背景已更新')}catch(err){toast.error(err.message||'背景上传失败')}}}/>}</label></div></div>}</div>
</div><div className="glass-card settings-card"><h3>设置</h3><div className="settings-list">{!isAdmin&&<div className="setting-row"><span>匿名发布</span><div className={`toggle-switch ${isAnon?'active':''}`} onClick={()=>setIsAnon(!isAnon)}/></div>}<div className="setting-row"><span>账户名</span><input value={nick} onChange={e=>setNick(e.target.value)}/></div><div className="setting-row"><span>修改密码</span><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="留空不修改"/></div><button className="save-btn" onClick={()=>save()}>保存设置</button></div><div className="settings-section"><h4>其他</h4><div className="settings-list"><div className="settings-item" onClick={()=>setStoryOpen(true)}><span>🌌 树洞手记</span><span className="settings-arrow">→</span></div><div className="settings-item" onClick={()=>setShowPact(true)}><span>📜 社区公约</span><span className="settings-arrow">→</span></div><div className="settings-item" onClick={()=>{setUser(null);localStorage.removeItem('token');localStorage.removeItem('user');toast.info('已退出登录')}}><span>退出登录</span><span className="settings-arrow">→</span></div><div className="settings-item danger-item" onClick={()=>setShowDelete(true)}><span>注销账号</span><span className="settings-arrow">→</span></div></div></div>{showPact&&<RulesModal onClose={()=>setShowPact(false)} title="📜 鹿鸣回音社区公约"/>}{showDelete&&<AnimatedModal onClose={()=>setShowDelete(false)} className="delete-account-modal">{({requestClose})=>(<><h3>注销账号</h3><p className="delete-warn">此操作不可恢复，将永久删除你的账号、帖子与评论。</p><input type="password" value={delPw} onChange={e=>setDelPw(e.target.value)} placeholder="请输入密码确认" className="glass-input"/><div className="modal-actions"><button className="glass-button btn-secondary" onClick={requestClose}>取消</button><button className="glass-button btn-danger" onClick={deleteAccount} disabled={delBusy}>{delBusy?'注销中...':'确认注销'}</button></div></>)}</AnimatedModal>}</div>
<div className="glass-card my-stuff-card">
  <div className="my-tabs"><button className={`my-tab ${ptab==='posts'?'active':''}`} onClick={()=>setPtab('posts')}>我的帖子（{myPosts.length}）</button><button className={`my-tab ${ptab==='comments'?'active':''}`} onClick={()=>setPtab('comments')}>我的评论（{myComments.length}）</button><button className={`my-tab ${ptab==='stars'?'active':''}`} onClick={()=>setPtab('stars')}>我的收藏（{myStars.length}）</button></div>
  {loadingTab?<Spinner/>:ptab==='posts'?(myPosts.length===0?<Empty icon="📝" title="还没有发帖" desc="去首页分享点什么吧"/>:<div className="posts-list">{myPosts.map(p=><div key={p.id} className="glass-card post-card my-post-card" onClick={()=>onOpenPost(p)}><div className="my-item-del-row"><h4 className="post-title">{p.title}</h4>{<button className="action-btn delete-btn my-item-del" onClick={async e=>{e.stopPropagation();if(!confirm('确定删除这篇帖子？此操作不可恢复'))return;try{const r=await apiFetch(`/posts/${p.id}`,{method:'DELETE'});if(!r.ok)throw new Error(await errMsg(r,'删除失败'));setMyPosts(prev=>prev.filter(x=>x.id!==p.id));toast.success('帖子已删除')}catch(err){toast.error(err.message)}}}>🗑️</button>}</div><p className="post-preview">{p.content?.slice(0,80)}{p.content?.length>80?'...':''}</p>{p.images&&p.images.length>0&&<PostImages images={p.images}/>}<div className="post-footer"><span className="post-time">{fmtTime(p.created_at)}</span><span className="action-text">💬 {p.comment_count}</span><span className="action-text">⭐ {p.star_count}</span></div></div>)}</div>):ptab==='comments'?(myComments.length===0?<Empty icon="💬" title="还没有评论" desc="去帖子下聊聊吧"/>:<div className="my-comments-list">{myComments.map(c=><div key={c.id} className="glass-card my-comment-card" onClick={()=>openCommentPost(c.post_id)}><div className="my-comment-post">{c.post_title?`「${c.post_title}」`:'（帖子已删除）'}</div><p className="my-comment-content">{c.content}</p><span className="post-time">{fmtTime(c.created_at)}</span>{<button className="action-btn delete-btn my-item-del" onClick={async e=>{e.stopPropagation();if(!confirm('确定删除这条评论？此操作不可恢复'))return;try{const r=await apiFetch(`/users/me/comments/${c.id}`,{method:'DELETE'});if(!r.ok)throw new Error(await errMsg(r,'删除失败'));setMyComments(prev=>prev.filter(x=>x.id!==c.id));toast.success('评论已删除')}catch(err){toast.error(err.message)}}}>🗑️</button>}</div>)}</div>):(myStars.length===0?<Empty icon="⭐" title="还没有收藏" desc="去帖子点 ⭐ 收藏喜欢的内容吧"/>:<div className="posts-list">{myStars.map(p=><div key={p.id} className="glass-card post-card" onClick={()=>onOpenPost(p)}><h4 className="post-title">{p.title}</h4><p className="post-preview">{p.content?.slice(0,80)}{p.content?.length>80?'...':''}</p>{p.images&&p.images.length>0&&<PostImages images={p.images}/>}<div className="post-footer"><span className="post-time">{fmtTime(p.created_at)}</span><span className="action-text">💬 {p.comment_count}</span><span className="action-text">⭐ {p.star_count}</span></div></div>)}</div>)}
</div>
</div>
}

// ── TagDetail（话题标签聚合页）──
const TagDetail = ({ tag, user, onBack, onOpenPost, onOpenTag, setProfileUserId, myStars, myLikes, toggleStar, toggleLike }) => {
  const [data,setData] = useState(null)
  const [loading,setLoading] = useState(true)
  const [err,setErr] = useState(null)
  const [sort,setSort] = useState('latest')
  const rootRef = useRef(null)
  const load = useCallback(async()=>{
    setLoading(true)
    try{
      const r = await apiFetch(`/posts/tags/${encodeURIComponent(tag)}?sort=${sort}`)
      if(!r.ok) throw new Error('获取话题失败')
      setData(await r.json())
    }catch(e){ setErr(e.message) }finally{ setLoading(false) }
  },[tag,sort])
  useEffect(()=>{ load() },[load])
  useEffect(()=>{ if(!prefersReduced()&&rootRef.current) gsap.from(rootRef.current,{opacity:0,y:18,duration:.3,ease:'power2.out'}) },[tag])
  const openParticipant = (id) => { setProfileUserId(id); onBack() }
  return (
    <div className="app">
      <nav className="glass-nav"><button className="nav-back" onClick={onBack}>← 返回</button><h2 className="nav-title">话题 #{tag}</h2></nav>
      <main className="main-content" ref={rootRef}>
        {loading?<Spinner/>:err?<ErrorBox msg={err} onRetry={load}/>:!data||data.post_count===0?<Empty icon="🏷️" title="暂无相关帖子" desc="这个标签下还没有内容"/>:(
          <div className="tag-detail-page">
            <div className="glass-card tag-detail-head">
              <div className="tag-detail-title"># {data.tag}</div>
              <div className="tag-detail-stats"><span>📝 {data.post_count} 帖</span><span>👥 {data.participant_count} 人参与</span></div>
              {data.participants&&data.participants.length>0&&<div className="tag-participants">{data.participants.slice(0,36).map(u=><button key={u.id} className="tag-participant" title={u.display_name} onClick={(e)=>{e.stopPropagation();openParticipant(u.id)}}><Avatar src={u.avatar} seed={u.display_name} className="tag-participant-avatar"/></button>)}</div>}
            </div>
            <div className="category-tabs"><button className={`category-tab ${sort==='latest'?'active':''}`} onClick={()=>setSort('latest')}>🕒 最新</button><button className={`category-tab ${sort==='hot'?'active':''}`} onClick={()=>setSort('hot')}>🔥 热门</button></div>
            <div className="posts-list">{data.posts.map(p=><div key={p.id} data-post-id={p.id} data-post-author={p.user_id} className={`glass-card post-card ${p.is_announcement?'post-announcement':''}`} onClick={()=>onOpenPost(p)}>{p.is_announcement&&<div className="announcement-badge">📢 公告</div>}<div className="post-card-header"><Avatar src={p.author_avatar} seed={p.display_name} className="post-author-avatar" onClick={e=>{e.stopPropagation();openParticipant(p.user_id)}}/><span className="post-author-name-small" onClick={e=>{e.stopPropagation();openParticipant(p.user_id)}}>{p.display_name||'匿名用户'}</span>{canSeeUid(user,p)&&<span className="uid-badge">{p.user_uid}{p.hide_uid&&' (隐藏)'}</span>}<span className="post-forum-badge">{getSchoolName(p.forum)}</span></div><h4 className="post-title">{p.title}</h4><p className="post-preview">{p.content?.slice(0,100)}{p.content?.length>100?'...':''}</p>{p.images&&p.images.length>0&&<PostImages images={p.images}/>}<div className="post-tags">{p.tags&&p.tags.split(',').filter(Boolean).map(t=><button key={t} className="post-tag-chip" onClick={e=>{e.stopPropagation();onOpenTag&&onOpenTag(t.trim())}}>#{t.trim()}</button>)}</div><div className="post-footer"><span className="post-time">{fmtTime(p.created_at)}</span><div className="post-actions"><LikeButton post={p} liked={!!myLikes[p.id]} count={p.like_count} onToggle={toggleLike}/><StarButton post={p} starred={!!myStars[p.id]} count={p.star_count} onToggle={toggleStar}/></div></div></div>)}</div>
          </div>
        )}
      </main>
    </div>
  )
}

// ── App main ──
function App() {
  const [curPage,setCurPage] = useState('home')
  const [user,setUser] = useState(null)
  const [posts,setPosts] = useState([])
  const [selectedPost,setSelectedPost] = useState(null)
  const [profileUserId,setProfileUserId] = useState(null)
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState(null)
  const [activeCat,setActiveCat] = useState('all')
  const [boards,setBoards] = useState(CATEGORIES)
  // 未登录时不请求 /boards（该接口需鉴权，否则登录页会刷出 401 控制台报错）
  useEffect(()=>{ if(!localStorage.getItem('token'))return; const f=async()=>{ try{ const r=await apiFetch('/boards'); if(r.ok)setBoards(await r.json()) }catch{} }; f() },[])
  // 学校列表以后端 schools 表为准：启动后拉取一次，新增学校只需后端操作，前端零改动
  const [schoolsVer,setSchoolsVer] = useState(0)
  useEffect(()=>{ const f=async()=>{ try{ const r=await apiFetch('/schools/'); if(r.ok){ const list=await r.json(); if(Array.isArray(list)&&list.length){ SCHOOLS = list.map(s=>({code:s.code, name:s.name, short:s.short_name||s.short||s.name})); setSchoolsVer(v=>v+1) } } }catch{} }; f() },[])
  const [activeForum,setActiveForum] = useState('main')
  const [searchQ,setSearchQ] = useState('')
  const [debouncedQ,setDebouncedQ] = useState('')
  const [gsOpen,setGsOpen] = useState(false)
  const [gsSeed,setGsSeed] = useState('')
  const [isRegister,setIsRegister] = useState(false)
  const [showRules,setShowRules] = useState(false)
  // 新用户先看完开屏动画，再弹社区公约（否则公约盖住动画，看起来像「没有开屏动画」）
  const [pendingRules,setPendingRules] = useState(false)
  const [showWelcome,setShowWelcome] = useState(false)
  const [activeSort,setActiveSort] = useState('latest')
  const [myStars,setMyStars] = useState({})
  const [myLikes,setMyLikes] = useState({})
  const [tagDetail,setTagDetail] = useState('')   // 话题标签聚合页：非空时进入独立 TagDetail 视图
  const [storyOpen,setStoryOpen] = useState(false) // 社区故事页（B 版：手记画册）
  const [trendingTags,setTrendingTags] = useState([])
  const [notifOpen,setNotifOpen] = useState(false)
  const [notifs,setNotifs] = useState([])
  const [unread,setUnread] = useState(()=>{ try{ return parseInt(localStorage.getItem('cervus_unread')||'0',10)||0 }catch{ return 0 } })
  const [tarotOpen,setTarotOpen] = useState(false)
  const [sessionExpired,setSessionExpired] = useState(false)
  const [listKey,setListKey] = useState(0)   // 仅在一次真实的帖子列表加载后 +1，避免点赞/取消星标触发整列表重播动画
  const notifPanelRef = useRef(null)
  const PAGE_SIZE = 12
  const postsSkipRef = useRef(0)
  const [hasMore,setHasMore] = useState(false)
  // 主题切换（浅/深）：手动覆盖星空自动昼夜间，localStorage 持久化
  // 三态主题：auto(跟随时间) / light(白天) / dark(夜晚)
  const [theme,setTheme] = useState(() => { try { return localStorage.getItem('cervus_theme') || 'auto' } catch { return 'auto' } })
  const isNightByTime = () => { const h = new Date().getHours(); return h >= 19 || h < 6 }
  const isLight = theme === 'light' || (theme === 'auto' && !isNightByTime())
  const applyTheme = (t) => {
    const night = t === 'dark' || (t === 'auto' && isNightByTime())
    document.body.dataset.time = night ? 'night' : 'day'
  }
  const toggleTheme = () => {
    const next = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto'
    setTheme(next)
    try { localStorage.setItem('cervus_theme', next) } catch {}
    applyTheme(next)
  }
  useEffect(() => { applyTheme(theme) }, [theme])
  // auto 模式下每分钟检查时间变化
  useEffect(() => {
    if (theme !== 'auto') return
    const iv = setInterval(() => applyTheme(theme), 60000)
    return () => clearInterval(iv)
  }, [theme])
  const [loadingMore,setLoadingMore] = useState(false)
  const [followingFeed,setFollowingFeed] = useState(false)
  const [chatTab,setChatTab] = useState('global')
  // 教师/校方（无论是否已批准）都不进公共聊天室：隐藏标签 + 默认落到私信。
  // 后端 can_join_room 是真正的闸门，这里只保证界面不给出错误入口。
  const isStaffRole = user?.role==='teacher'||user?.role==='school_official'
  useEffect(()=>{ if(isStaffRole&&chatTab==='global') setChatTab('dm') },[isStaffRole,chatTab])
  const [editPost,setEditPost] = useState(null)
  const [openConvId,setOpenConvId] = useState(null)
  const [dmUnread,setDmUnread] = useState(()=>{ try{ return parseInt(localStorage.getItem('cervus_dmunread')||'0',10)||0 }catch{ return 0 } })

  // mode='replace' 重新拉首页（切换分类/搜索/发帖后）；mode='more' 在末尾追加下一页
  const fetchPosts = useCallback(async(mode='replace')=>{ const replace=mode!=='more'
    if(replace) postsSkipRef.current=0
    const skip=replace?0:postsSkipRef.current
    setLoading(replace); setLoadingMore(!replace)
    try{ let url=`/posts/?skip=${skip}&limit=${PAGE_SIZE}`; if(activeCat!=='all')url+=`&category=${activeCat}`; if(activeForum!=='all')url+=`&forum=${activeForum}`; if(activeSort==='hot')url+=`&sort=hot`; if(debouncedQ.trim())url+=`&search=${encodeURIComponent(debouncedQ.trim())}`; if(followingFeed)url+='&following=true'; const r=await apiFetch(url); if(!r.ok)throw new Error('获取帖子失败'); const data=await r.json()
      if(replace){ setPosts(data); setListKey(k=>k+1) } else { setPosts(prev=>[...prev,...data]) }
      postsSkipRef.current=skip+data.length; setHasMore(data.length===PAGE_SIZE)
    }catch(e){ if(replace) setError(e.message) }finally{ setLoading(false); setLoadingMore(false) } },[activeCat,activeForum,activeSort,debouncedQ,user,followingFeed])

  useEffect(()=>{ const t=setTimeout(()=>setDebouncedQ(searchQ),300); return ()=>clearTimeout(t) },[searchQ])
  useEffect(()=>{ const el=document.querySelector('.main-content'); if(!el)return; if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return; gsap.fromTo(el,{opacity:0,y:12},{opacity:1,y:0,duration:.3,ease:'power2.out'}) },[curPage])
  // 分类标签错落入场（与帖子卡片呼应）
  useEffect(()=>{ const el=document.querySelector('.category-tabs'); if(!el)return; if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return; const ctx=gsap.context(()=>{ gsap.from('.category-tab',{opacity:0,y:10,duration:.35,ease:'power2.out',stagger:.04,clearProps:'opacity,transform'}) }); return ()=>ctx.revert(); },[activeCat])
  // 多端同步：从服务器拉取当前用户最新数据，覆盖可能滞后的本地缓存
  const refreshUser = useCallback(async () => {
    const tk = getToken(); if (!tk) return
    try {
      const r = await apiFetch('/users/me')
      if (!r.ok) return
      const u = await r.json()
      if (!u || typeof u.id !== 'number') return
      const saved = localStorage.getItem('user')
      if (saved === JSON.stringify(u)) return  // 数据一致则不触发重复渲染
      setUser(u); localStorage.setItem('user', JSON.stringify(u))
    } catch {}
  }, [setUser])
  // 启动：从本地缓存恢复身份，并立即向服务器同步最新用户
  useEffect(()=>{
    const saved=localStorage.getItem('user');
    if(saved){ try{ const u=JSON.parse(saved); if(u&&typeof u.id==='number'){ setUser(u) } else { localStorage.removeItem('user'); localStorage.removeItem('token') } }catch{ localStorage.removeItem('user') } }
    refreshUser();
  },[refreshUser])
  // 切回标签页时再同步一次（手机改完，电脑切回来即更新）
  useEffect(()=>{ const onVis=()=>{ if(document.visibilityState==='visible') refreshUser() }; document.addEventListener('visibilitychange',onVis); return ()=>document.removeEventListener('visibilitychange',onVis) },[refreshUser])

  // token 失效时由请求层回调，统一清身份并回到登录页
  useEffect(()=>{ setUnauthorizedHandler(()=>{ localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null); setCurPage('home'); setSessionExpired(true) }); return ()=>setUnauthorizedHandler(null) },[])
  useEffect(()=>{ if(!sessionExpired) return; const t=setTimeout(()=>setSessionExpired(false),4000); return ()=>clearTimeout(t) },[sessionExpired])
  useEffect(()=>{ if(user) fetchPosts() },[user,fetchPosts])

  // 载入当前用户的星标记录（localStorage 持久化，避免刷新后丢失高亮）
  useEffect(()=>{ if(!user){ setMyStars({}); return } const k='cervus_stars_'+user.id; try{ setMyStars(JSON.parse(localStorage.getItem(k)||'{}')) }catch{ setMyStars({}) } },[user])

  // 载入当前用户的点赞记录（本地持久化，用于按钮高亮）
  useEffect(()=>{ if(!user){ setMyLikes({}); return } const k='cervus_likes_'+user.id; try{ setMyLikes(JSON.parse(localStorage.getItem(k)||'{}')) }catch{ setMyLikes({}) } },[user])

  // 热门标签（点标签即可筛选帖子）
  useEffect(()=>{ const f=async()=>{ try{ const r=await apiFetch('/posts/tags/trending'); if(r.ok)setTrendingTags(await r.json()) }catch{} }; f() },[])

  // 通知：加载未读数 + 每 20s 轮询（轻量）；面板打开时拉取完整列表
  const fetchUnread = useCallback(async()=>{ if(!user) return; try{ const r=await apiFetch('/notifications/unread-count'); if(r.ok){ const n=(await r.json()).unread||0; setUnread(n); try{localStorage.setItem('cervus_unread',String(n))}catch{} } }catch{} },[user])
  const fetchNotifs = useCallback(async()=>{ try{ const r=await apiFetch('/notifications'); if(r.ok)setNotifs(await r.json()) }catch{} },[])
  useEffect(()=>{ if(!user){ setUnread(0); setNotifs([]); try{localStorage.removeItem('cervus_unread');localStorage.removeItem('cervus_dmunread')}catch{}; return } fetchUnread(); const t=setInterval(fetchUnread,20000); return ()=>clearInterval(t) },[user,fetchUnread])
  const fetchDmUnread=useCallback(async()=>{ if(!user)return; try{ const r=await apiFetch('/dm/conversations'); if(r.ok){ const cs=await r.json(); const n=cs.reduce((a,c)=>a+(c.unread||0),0); setDmUnread(n); try{localStorage.setItem('cervus_dmunread',String(n))}catch{} } }catch{} },[user])
  useEffect(()=>{ if(!user){setDmUnread(0);return} fetchDmUnread(); const t=setInterval(fetchDmUnread,20000); return ()=>clearInterval(t) },[user,fetchDmUnread])
  // 切回标签页时即时刷新未读，避免红点滞后（依赖已声明的 fetchUnread/fetchDmUnread）
  useEffect(()=>{ const onVis=()=>{ if(document.visibilityState==='visible'){ fetchUnread(); fetchDmUnread() } }; document.addEventListener('visibilitychange',onVis); return ()=>document.removeEventListener('visibilitychange',onVis) },[fetchUnread,fetchDmUnread])
  // 未读持久化「做到不用改动为止」：任意来源（乐观标记/轮询/切端同步）导致 unread/dmUnread 变化时即时写回 localStorage，
  // 保证刷新或切端后红点与显示完全一致，不会因轮询间隔出现旧值回弹。
  useEffect(()=>{ try{ localStorage.setItem('cervus_unread', String(unread)) }catch{} },[unread])
  useEffect(()=>{ try{ localStorage.setItem('cervus_dmunread', String(dmUnread)) }catch{} },[dmUnread])
  const closeNotif = ()=>{ const el=notifPanelRef.current; if(!el||prefersReduced()){ setNotifOpen(false); return } gsap.to(el,{opacity:0,y:-8,scale:.98,duration:.18,ease:'power2.in',onComplete:()=>setNotifOpen(false)}) }
  const toggleNotif = async()=>{ if(notifOpen){ closeNotif(); return } await fetchNotifs(); setNotifOpen(o=>!o) }
  const markRead = async(id)=>{ setNotifs(ns=>ns.map(n=>n.id===id?{...n,read:true}:n)); setUnread(u=>Math.max(0,u-1)); try{ await apiFetch(`/notifications/${id}/read`,{method:'POST'}) }catch{} }
  const markAll = async()=>{ setNotifs(ns=>ns.map(n=>({...n,read:true}))); setUnread(0); try{ await apiFetch('/notifications/read-all',{method:'POST'}) }catch{} }
  const clickNotif = async(n)=>{ await markRead(n.id); if(n.type==='dm'){ if(n.post_id){ setOpenConvId(n.post_id); setChatTab('dm'); setCurPage('chat'); setNotifOpen(false) } return } if(n.type==='follow'){ if(n.actor_id){ setProfileUserId(n.actor_id); setNotifOpen(false) } return } if(n.post_id){ try{ const r=await apiFetch(`/posts/${n.post_id}`); if(r.ok){ setSelectedPost(await r.json()); setNotifOpen(false) } }catch{} } }
  const notifText = (n)=> n.type==='like' ? `${n.actor_name||'有人'} 赞了你的帖子` : n.type==='star' ? `${n.actor_name||'有人'} 收藏了你的帖子` : n.type==='mention' ? `${n.actor_name||'有人'} 在评论中提到了你` : n.type==='follow' ? `${n.actor_name||'有人'} 关注了你` : n.type==='dm' ? `${n.actor_name||'有人'} 给你发了私信` : `${n.actor_name||'有人'} 回复了你的帖子`
  // 通知面板入场：缩放回弹 + 列表项错落淡入；尊重 prefers-reduced-motion
  // 面板默认可见(opacity:1)，GSAP 仅作「增强」：即便动效子系统因任何原因(异常/被拦)未跑，
  // 点击铃铛也一定能看到面板，杜绝「点击没反应」的单点失效。
  useLayoutEffect(()=>{ if(!notifOpen) return; const el=notifPanelRef.current; if(!el) return
    try {
      if(prefersReduced()){ gsap.set(el,{opacity:1,y:0,scale:1}); return }
      const ctx=gsap.context(()=>{ gsap.fromTo(el,{opacity:0,y:-10,scale:.96},{opacity:1,y:0,scale:1,duration:.26,ease:'back.out(1.7)'})
        gsap.from(el.querySelectorAll('.notif-item'),{opacity:0,x:14,duration:.28,ease:'power2.out',stagger:.05,clearProps:'opacity,transform'}) },el)
      return ()=>ctx.revert()
    } catch { /* 动效失败绝不影响面板可见性 */ }
  },[notifOpen])

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

  const startDMFromProfile = async (peerId) => { try{ const r=await apiFetch('/dm/conversations',{method:'POST',body:JSON.stringify({peer_id:peerId})}); if(!r.ok)throw new Error(await errMsg(r,'操作失败')); const d=await r.json(); setOpenConvId(d.id); setChatTab('dm'); setCurPage('chat'); setProfileUserId(null) }catch(e){ toast.error(e.message) } }

  const handleLogin = (data) => { localStorage.setItem('token',data.access_token); localStorage.setItem('user',JSON.stringify(data.user)); setUser(data.user); if(!localStorage.getItem('rules_accepted'))setPendingRules(true); setShowWelcome(true) }

  // 页面切换过渡：main 挂 key={curPage} 重挂载后做一次上浮淡入（GSAP；尊重 reduced-motion）
  useEffect(() => {
    const el = document.querySelector('.main-content')
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .38, ease: 'power2.out', clearProps: 'opacity,transform' })
  }, [curPage])

  // 星标/点赞统一切换：乐观更新 + 本地高亮 + 计数回退；star/like 共用一份逻辑，避免重复实现
  const toggleReaction = async (kind, post) => {
    const uid = user?.id
    if(!uid) return
    const active = kind === 'star' ? !!myStars[post.id] : !!myLikes[post.id]
    const method = active ? 'DELETE' : 'POST'
    try {
      const r = await apiFetch(`/posts/${post.id}/${kind}`, {method})
      const d = await r.json().catch(()=>({}))
      if(!r.ok){ if(d.detail) toast.error(d.detail); return }
      const nowActive = !active
      const setMap = kind === 'star' ? setMyStars : setMyLikes
      setMap(s => ({...s, [post.id]: nowActive}))
      const key = 'cervus_' + kind + 's_' + uid
      try{ const saved = JSON.parse(localStorage.getItem(key)||'{}'); saved[post.id]=nowActive; localStorage.setItem(key, JSON.stringify(saved)) }catch{}
      const countKey = kind === 'star' ? 'star_count' : 'like_count'
      const count = (typeof d[countKey]==='number') ? d[countKey] : (post[countKey] + (nowActive?1:-1))
      setPosts(prev => prev.map(x=>x.id===post.id?{...x, [countKey]:count}:x))
      if(selectedPost && selectedPost.id===post.id) setSelectedPost(sp=>({...sp, [countKey]:count}))
    } catch(e){ toast.error('操作失败，请重试') }
  }
  const toggleStar = (post) => toggleReaction('star', post)
  const toggleLike = (post) => toggleReaction('like', post)

  if(isRegister&&!user) return <ToastProvider><Starfield/><RegisterForm onSwitch={()=>setIsRegister(false)}/></ToastProvider>

  return <ToastProvider>
    <Starfield/>
    {showRules&&<RulesModal onClose={()=>{localStorage.setItem('rules_accepted','true');setShowRules(false)}}/>}
    {showWelcome&&user&&<WelcomeHello nickname={user.nickname} onDone={()=>{ setShowWelcome(false); if(pendingRules){ setShowRules(true); setPendingRules(false) } }}/>}
    {editPost&&<PostEditModal post={editPost} boards={boards} onClose={()=>setEditPost(null)} onSaved={(p)=>{ setPosts(prev=>prev.map(x=>x.id===p.id?p:x)); setEditPost(null); fetchPosts() }}/>}
    {sessionExpired&&<div className="session-expired-banner">登录已过期，请重新登录</div>}
    {!user ? <LoginPage onLogin={handleLogin} onSwitchRegister={()=>setIsRegister(true)}/>
    : storyOpen ? <CommunityStory onBack={()=>setStoryOpen(false)}/>
    : tagDetail ? <TagDetail tag={tagDetail} user={user} onBack={()=>setTagDetail('')} onOpenPost={(p)=>{setSelectedPost(p);setTagDetail('')}} onOpenTag={(t)=>setTagDetail(t)} setProfileUserId={setProfileUserId} myStars={myStars} myLikes={myLikes} toggleStar={toggleStar} toggleLike={toggleLike}/>
    : selectedPost ? <div className="app"><PostDetail post={selectedPost} user={user} onBack={()=>setSelectedPost(null)} onRefresh={fetchPosts} myStars={myStars} onToggleStar={toggleStar} myLikes={myLikes} onToggleLike={toggleLike} onEditPost={setEditPost} setProfileUserId={setProfileUserId} setSelectedPost={setSelectedPost} onOpenTag={(t)=>setTagDetail(t)}/></div>
    : profileUserId ? <UserProfile userId={profileUserId} user={user} onBack={()=>setProfileUserId(null)} onOpenPost={(p)=>{setSelectedPost(p);setProfileUserId(null)}} onOpenUser={setProfileUserId} onStartDM={startDMFromProfile}/>

    : <div className="app">
      <nav className="glass-nav"><div className="nav-brand"><h2 className="nav-title brand-title">鹿鸣回音</h2><span className="brand-subtitle-en nav-subtitle-en">Cervus Echo</span></div><div className="nav-links"><button className={curPage==='home'?'active':''} onClick={()=>setCurPage('home')}>首页</button>{(isAdmin||(user?.role==='school_official'&&user?.approved!==false))&&<button className={curPage==='admin'?'active':''} onClick={()=>setCurPage('admin')}>管理</button>}<button className={curPage==='chat'?'active':''} onClick={()=>setCurPage('chat')}>消息{dmUnread>0&&<span key={'dm'+dmUnread} className="notif-badge">{dmUnread>99?'99+':dmUnread}</span>}</button><button className={curPage==='profile'?'active':''} onClick={()=>setCurPage('profile')}>我的</button><button className={`nav-bell ${notifOpen?'active':''}`} onClick={toggleNotif}>通知{unread>0&&<span key={unread} className="notif-badge">{unread>99?'99+':unread}</span>}</button>
        <button className="nav-search" onClick={()=>{setGsSeed('');setGsOpen(true)}} title="搜索" aria-label="搜索"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:'15px',height:'15px',display:'block'}} aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button>        <button className="nav-theme" onClick={toggleTheme} title="点击切换">{theme==='auto'?'自动':isLight?'白天':'夜间'}</button>
      </div><div className="user-info">{isAdmin&&<span className="role-indicator">{user.role==='founder'?'👑':'🏅'}</span>}{(user.role==='teacher'||user.role==='school_official')&&<span className="role-indicator">{user.role==='teacher'?'👨‍🏫':'🏫'}</span>}<Avatar src={user.avatar} seed={user.username} className="nav-avatar" /><span className="user-nickname">{user.nickname}</span></div></nav>
        {notifOpen&&<div ref={notifPanelRef} className="notif-panel glass-card"><div className="notif-panel-head"><span className="notif-panel-title"><span className="notif-panel-glyph">🔔</span>通知{notifs.some(n=>!n.read)&&<span className="notif-head-badge">{notifs.filter(n=>!n.read).length}</span>}</span><button className="notif-markall" onClick={markAll}>全部已读</button></div>{notifs.length===0?<Empty icon="🔔" title="暂无通知" desc="有人回复、点赞、收藏或 @ 你时会在这里提醒"/>:<div className="notif-list">{notifs.map(n=><div key={n.id} className={`notif-item ${n.read?'read':''} notif-${n.type}`} onClick={()=>clickNotif(n)}><span className="notif-icon-badge">{n.type==='like'?'❤️':n.type==='star'?'⭐':n.type==='mention'?'@':n.type==='follow'?'➕':'💬'}</span><div className="notif-body"><p className="notif-text">{notifText(n)}</p>{n.post_title&&<p className="notif-post">「{n.post_title}」</p>}<span className="notif-time">{fmtTime(n.created_at)}</span></div>{!n.read&&<span className="notif-dot"/>}</div>)}</div>}</div>}
      <main className="main-content" key={curPage} data-page={curPage}>
        {curPage==='home'&&<div className="home-page">
          {user&&<div className="glass-card create-post-card"><h3>发布新帖子</h3><PostForm user={user} visibleForums={getVisibleForums()} onPostCreated={fetchPosts}/></div>}
          <div className="forum-tabs"><button className={`forum-tab ${activeForum==='all'?'active':''}`} onClick={()=>setActiveForum('all')}>全部</button>{getVisibleForums().map(f=><button key={f.code} className={`forum-tab ${activeForum===f.code?'active':''}`} onClick={()=>setActiveForum(f.code)}>{f.code==='main'?'🏠':'🏫'} {f.name}</button>)}</div>
          <div className="search-bar"><input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="搜索帖子..." className="glass-input search-input" onKeyDown={e=>{if(e.key==='Enter'){setGsSeed(searchQ);setGsOpen(true)}}}/><button className="search-go" onClick={()=>{setGsSeed(searchQ);setGsOpen(true)}} title="全局搜索">🔍</button>{searchQ&&<button className="search-clear" onClick={()=>setSearchQ('')}>✕</button>}</div>
          <div className="category-tabs"><button className={`category-tab ${activeCat==='all'?'active':''}`} onClick={()=>setActiveCat('all')}>全部</button>{boards.map(c=><button key={c.key} className={`category-tab ${activeCat===c.key?'active':''}`} onClick={()=>setActiveCat(c.key)}><span className="category-icon">{c.icon}</span><span className="category-name">{c.name}</span></button>)}</div>
          <div className="category-tabs"><button className={`category-tab ${activeSort==='latest'?'active':''}`} onClick={()=>setActiveSort('latest')}>🕒 最新</button><button className={`category-tab ${activeSort==='hot'?'active':''}`} onClick={()=>setActiveSort('hot')}>🔥 热门</button><button className={`category-tab ${followingFeed?'active':''}`} onClick={()=>setFollowingFeed(f=>!f)}>👥 关注</button></div>
          {trendingTags.length>0&&<div className="tag-filter-row"><span className="tag-filter-label">🔥 热门标签</span><div className="tag-filter-chips">{trendingTags.slice(0,12).map(t=><button key={t.tag} className="tag-filter-chip" onClick={()=>setTagDetail(t.tag)}>#{t.tag}<span className="tag-count">{t.count}</span></button>)}</div></div>}
          <PollsSection/>
          {loading?<SkeletonList/>:error?<ErrorBox msg={error} onRetry={fetchPosts}/>:posts.length===0?<Empty icon="📝" title="暂无帖子" desc="成为第一个发帖的人吧"/>: <><div className="posts-list">{posts.map((p,i)=><div key={p.id} data-post-id={p.id} data-post-author={p.user_id} className={`glass-card post-card ${p.is_announcement?'post-announcement':''}`} onClick={()=>setSelectedPost(p)}>{p.is_announcement&&<div className="announcement-badge">📢 公告</div>}<div className="post-card-header"><Avatar src={p.author_avatar} seed={p.display_name} className="post-author-avatar" onClick={e=>{e.stopPropagation();setProfileUserId(p.user_id);setSelectedPost(null)}}/><span className="post-author-name-small" onClick={e=>{e.stopPropagation();setProfileUserId(p.user_id);setSelectedPost(null)}}>{p.display_name||'匿名用户'}</span>{canSeeUid(user,p)&&<span className="uid-badge">{p.user_uid}{p.hide_uid&&' (隐藏)'}</span>}<span className="post-forum-badge">{getSchoolName(p.forum)}</span><span className="post-category-mini">{p.category?p.category.split(',').map(c=>boards.find(x=>x.key===c)?.icon||'📝').join(' '):'📝'}</span></div><h4 className="post-title">{p.title}</h4><p className="post-preview">{p.content?.slice(0,100)}{p.content?.length>100?'...':''}</p>{p.images&&p.images.length>0&&<PostImages images={p.images}/>}<div className="post-footer"><span className="post-time">{fmtTime(p.created_at)}</span><div className="post-actions">{(user?.id===p.user_id||user?.role==='founder'||(user?.role==='ambassador'&&p.user_school===user.school_id))&&<><button onClick={e=>{e.stopPropagation();setEditPost(p)}} className="action-btn edit-btn" title="编辑">✏️</button><button onClick={e=>{e.stopPropagation();if(!confirm('确定删除？'))return;apiFetch(`/posts/${p.id}`,{method:'DELETE'}).then(fetchPosts)}} className="action-btn delete-btn">🗑️</button></>}<LikeButton post={p} liked={!!myLikes[p.id]} count={p.like_count} onToggle={toggleLike}/><StarButton post={p} starred={!!myStars[p.id]} count={p.star_count} onToggle={toggleStar}/><span className="action-text">💬 {p.comment_count}</span></div></div>{p.tags&&p.tags.split(',').filter(Boolean).length>0&&<div className="post-tags">{p.tags.split(',').filter(Boolean).map(t=><button key={t} className="post-tag-chip" onClick={e=>{e.stopPropagation();setTagDetail(t.trim())}}>#{t.trim()}</button>)}</div>}}</div>)}</div>{hasMore&&!loading&&<div className="load-more-wrap"><button className="load-more-btn" onClick={()=>fetchPosts('more')} disabled={loadingMore}>{loadingMore?'加载中…':'加载更多'}</button></div>}</>}
        </div>}
        {curPage==='chat'&&<div className="chat-page"><div className="chat-tabs">{isStaffRole?null:<button className={`chat-tab ${chatTab==='global'?'active':''}`} onClick={()=>setChatTab('global')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:'14px',height:'14px',verticalAlign:'-2px'}} aria-hidden="true"><path d="M21 12a8.5 8.5 0 0 1-8.5 8.5c-1.3 0-2.6-.3-3.7-.8L3.5 21l1.4-4.2A8.5 8.5 0 1 1 21 12z"/></svg> 聊天室</button>}<button className={`chat-tab ${chatTab==='dm'?'active':''}`} onClick={()=>setChatTab('dm')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:'14px',height:'14px',verticalAlign:'-2px'}} aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg> 私信</button><button className={`chat-tab ${chatTab==='group'?'active':''}`} onClick={()=>setChatTab('group')}><svg viewBox="0 0 24 24" fill="currentColor" style={{width:'14px',height:'14px',verticalAlign:'-2px'}} aria-hidden="true"><circle cx="9" cy="8" r="3.4"/><path d="M2.5 19c.7-3.6 3.3-5.5 6.5-5.5s5.8 1.9 6.5 5.5z"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 13.8c2.9.2 5.2 1.9 6 5.2h-5.1c-.2-2-1-3.7-2.3-4.8.5-.3 1-.4 1.4-.4z"/></svg> 群聊</button></div>{chatTab==='global'&&!isStaffRole?<div className="glass-card chat-container"><ChatRoom/></div>:chatTab==='dm'?<DirectMessages user={user} openConvId={openConvId} onOpenConvChange={setOpenConvId} onOpenUser={setProfileUserId}/>:<GroupChat user={user} onOpenUser={setProfileUserId}/>}</div>}
        {curPage==='admin'&&(isAdmin||(user?.role==='school_official'&&user?.approved!==false))&&<AdminPage user={user}/>}
        {curPage==='profile'&&<ProfilePage user={user} setUser={setUser} onOpenPost={setSelectedPost} onOpenUser={setProfileUserId} setStoryOpen={setStoryOpen}/>}
      </main>
      <nav className="mobile-nav">
        <button className={`mobile-nav-item ${curPage==='home'?'active':''}`} onClick={()=>setCurPage('home')}><span className="nav-icon">🏠</span><span className="nav-label">首页</span></button>
        {(isAdmin||(user?.role==='school_official'&&user?.approved!==false))&&<button className={`mobile-nav-item ${curPage==='admin'?'active':''}`} onClick={()=>setCurPage('admin')}><span className="nav-icon">🛡️</span><span className="nav-label">管理</span></button>}
        <button className={`mobile-nav-item ${curPage==='chat'?'active':''}`} onClick={()=>setCurPage('chat')}><span className="nav-icon">💬</span><span className="nav-label">消息</span>{dmUnread>0&&<span key={'dm'+dmUnread} className="notif-badge">{dmUnread>99?'99+':dmUnread}</span>}</button>
        <button className={`mobile-nav-item ${curPage==='profile'?'active':''}`} onClick={()=>setCurPage('profile')}><span className="nav-icon">👤</span><span className="nav-label">我的</span></button>
        <button className={`mobile-nav-item ${notifOpen?'active':''}`} onClick={toggleNotif}><span className="nav-icon">🔔</span><span className="nav-label">通知</span>{unread>0&&<span key={unread} className="notif-badge">{unread>99?'99+':unread}</span>}</button>
        <button className="mobile-nav-item" onClick={()=>{setGsSeed('');setGsOpen(true)}}><span className="nav-icon">🔍</span><span className="nav-label">搜索</span></button>
        <button className="mobile-nav-item" onClick={toggleTheme}><span className="nav-icon">{theme==='auto'?'🌗':isLight?'☀️':'🌙'}</span><span className="nav-label">{theme==='auto'?'自动':isLight?'白天':'夜间'}</span></button>
      </nav>
    </div>}
    {user && <><TarotOrb onOpen={() => setTarotOpen(true)} />
    <TarotOverlay open={tarotOpen} onClose={() => setTarotOpen(false)} /></>}
    {user && gsOpen && <GlobalSearch initial={gsSeed} onClose={()=>setGsOpen(false)} Avatar={Avatar} onOpenUser={(id)=>{setProfileUserId(id);setGsOpen(false)}} onOpenPost={(p)=>{setSelectedPost(p);setGsOpen(false)}} />}
  </ToastProvider>
}

export default App