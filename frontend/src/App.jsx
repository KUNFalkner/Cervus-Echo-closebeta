import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react'
import gsap from 'gsap'
import './App.css'

const API_BASE = import.meta.env.DEV ? 'http://localhost:8000/api' : `http://${window.location.hostname}:8000/api`
const WS_BASE = import.meta.env.DEV ? 'ws://localhost:8000/ws' : `ws://${window.location.hostname}:8000/ws`

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
  const [toasts, setToasts] = useState([]); let tid = 0
  const toast = { success: m => { const id=++tid; setToasts(p=>[...p,{id,msg:m,type:'success'}]); setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3000) },
    error: m => { const id=++tid; setToasts(p=>[...p,{id,msg:m,type:'error'}]); setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3000) },
    info: m => { const id=++tid; setToasts(p=>[...p,{id,msg:m,type:'info'}]); setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3000) } }
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
        ctx.fillStyle='#e7edf4';ctx.fillRect(0,0,w,h);
        const lg=ctx.createRadialGradient(w*.05,h*.02,0,w*.4,h*.35,Math.max(w,h)*.9);lg.addColorStop(0,'rgba(255,255,255,.75)');lg.addColorStop(.5,'rgba(236,243,250,.22)');lg.addColorStop(1,'rgba(206,218,232,0)');ctx.fillStyle=lg;ctx.fillRect(0,0,w,h);
        ctx.fillStyle='#9fb0c4';grains.forEach(g=>{ctx.globalAlpha=g.a;ctx.fillRect(g.x,g.y,g.s,g.s)});ctx.globalAlpha=1;
        dust.forEach(d=>{d.y-=d.sp;d.x+=Math.sin(time*d.sw+d.ph)*.3;if(d.y<-10){d.y=h+10;d.x=Math.random()*w;}ctx.fillStyle=`rgba(90,112,140,${d.a})`;ctx.beginPath();ctx.arc(d.x,d.y,d.r,0,Math.PI*2);ctx.fill()});
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
  const submit=async e=>{e.preventDefault(); const title=tRef.current?.value?.trim(),content=cRef.current?.value?.trim(); if(!title||!content)return; setSubmitting(true);
    const dn=isAdmin?user.nickname:(isAnon?genNick():user.nickname);
    const hu=isAdmin?false:(isAnon||hideUid);
    try{const r=await fetch(`${API_BASE}/posts/`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,content,category:cats.join(','),forum,user_id:user.id,display_name:dn,user_uid:user.uid,user_school:user.school_id,hide_uid:hu,is_announcement:false})});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.detail||'发布失败')}tRef.current.value='';cRef.current.value='';setCats(['general']);setHideUid(false);onPostCreated();toast.success('发布成功')}catch(e){toast.error(e.message)}finally{setSubmitting(false)}}
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

// ── PostDetail ──
const PostDetail = ({post,user,onBack,onRefresh,myStars,onToggleStar}) => {
  const toast=useToast(); const [comments,setComments]=useState([]); const [nc,setNc]=useState(''); const [loading,setLoading]=useState(false); const [err,setErr]=useState(null); const [submitting,setSubmitting]=useState(false); const [showR,setShowR]=useState(false); const [rt,setRt]=useState({type:'post',id:0});
  const isAdmin=user?.role==='founder'||user?.role==='ambassador';
  const fc=useCallback(async()=>{setLoading(true);try{const r=await fetch(`${API_BASE}/posts/${post.id}/comments`);if(!r.ok)throw new Error('获取评论失败');setComments(await r.json())}catch(e){setErr(e.message)}finally{setLoading(false)}},[post.id]);
  useEffect(()=>{fc()},[fc]);
  useEffect(()=>{const h=e=>{if(e.key==='Escape')onBack()};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h)},[onBack]);
  const submitComment=async e=>{e.preventDefault();if(!nc.trim())return;setSubmitting(true);const dn=user?.role==='founder'||user?.role==='ambassador'?user.nickname:genNick();try{const r=await fetch(`${API_BASE}/posts/${post.id}/comments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:nc,user_id:user.id,post_id:post.id,display_name:dn,user_uid:user.uid})});if(!r.ok)throw new Error('评论失败');setNc('');fc();onRefresh?.();toast.success('评论成功')}catch(e){toast.error(e.message)}finally{setSubmitting(false)}}
  return <div className="post-detail"><button className="back-btn" onClick={onBack}>← 返回</button><div className="glass-card post-detail-card"><div className="post-header"><span className="post-author-name">{post.display_name||'匿名用户'}</span>{canSeeUid(user,post)&&<span className="uid-badge">{post.user_uid}{post.hide_uid&&' (隐藏)'}</span>}<span className="post-category-badge">{post.category?post.category.split(',').map(c=>{const x=CATEGORIES.find(y=>y.id===c);return x?`${x.icon} ${x.name}`:'📝 综合'}).join(' · '):'📝 综合'}</span></div><h2>{post.title}</h2><p className="post-content">{post.content}</p><div className="post-meta"><span className="post-time">{fmtTime(post.created_at)}</span><div className="post-actions"><button onClick={()=>onToggleStar(post)} className={`action-btn star-btn ${myStars[post.id]?'starred':''}`}>{myStars[post.id]?'⭐':'☆'} {post.star_count||0}</button><button onClick={()=>{setRt({type:'post',id:post.id});setShowR(true)}} className="action-btn">🚩</button>{(user?.id===post.user_id||isAdmin)&&<button onClick={async()=>{if(!confirm('确定删除？'))return;await fetch(`${API_BASE}/posts/${post.id}?user_id=${user.id}`,{method:'DELETE'});toast.success('已删除');onBack()}} className="action-btn delete-btn">🗑️</button>}</div></div></div><div className="glass-card comments-section"><h3>评论 ({comments.length})</h3><form onSubmit={submitComment} className="comment-form"><textarea value={nc} onChange={e=>setNc(e.target.value)} placeholder="说点什么..." className="comment-input" rows={3}/><button type="submit" className="glass-button submit-btn btn-primary" disabled={submitting||!nc.trim()}>{submitting?'发送中...':'发表评论'}</button></form>{loading?<Spinner/>:err?<ErrorBox msg={err} onRetry={fc}/>:comments.length===0?<Empty icon="💬" title="暂无评论" desc="成为第一个评论的人"/>:<div className="comments-list">{comments.map(c=><div key={c.id} className="glass-card comment-card"><div className="comment-header"><div className="comment-author-info"><span className="comment-author">{c.display_name||'匿名用户'}</span>{canSeeUid(user,c)&&<span className="uid-badge">{c.user_uid}</span>}</div><div className="comment-actions"><span className="comment-time">{fmtTime(c.created_at)}</span>{(user?.id===c.user_id||isAdmin)&&<button onClick={async()=>{await fetch(`${API_BASE}/posts/${post.id}/comments/${c.id}?user_id=${user.id}`,{method:'DELETE'});fc()}} className="action-btn delete-btn">🗑️</button>}<button onClick={()=>{setRt({type:'comment',id:c.id});setShowR(true)}} className="action-btn">🚩</button></div></div><p className="comment-content">{c.content}</p></div>)}</div>}</div>{showR&&<ReportModal type={rt.type} tid={rt.id} uid={user?.id} onClose={()=>setShowR(false)}/>}</div>
}

// ── RulesModal ──
const RulesModal = ({onClose}) => <div className="modal-overlay" onClick={onClose}><div className="glass-card modal-card rules-modal login-rules-modal" onClick={e=>e.stopPropagation()}><h2>📜 社区规则</h2><p className="rules-subtitle">欢迎来到校园树洞！请仔细阅读以下规则：</p><div className="rules-content"><p><strong>1. 友善交流</strong> — 尊重他人，禁止辱骂、人身攻击。</p><p><strong>2. 保护隐私</strong> — 请勿公开他人真实姓名、联系方式等隐私信息。</p><p><strong>3. 合理发言</strong> — 禁止发布违法、色情、暴力等不良信息。</p><p><strong>4. 举报机制</strong> — 发现违规内容请及时举报，管理员会尽快处理。</p><p><strong>5. 共同维护</strong> — 让我们一起营造温暖、安全的校园社区。</p></div><button className="glass-button btn-primary" onClick={onClose}>我已阅读，开始使用</button></div></div>

// ── ChatRoom ──
const ChatRoom = () => {
  const [msgs,setMsgs] = useState([]); const [input,setInput] = useState(''); const [ws,setWs] = useState(null); const endRef = useRef(null)
  const usr = JSON.parse(localStorage.getItem('user')||'{}')
  useEffect(()=>{ const s=new WebSocket(`${WS_BASE}/chat/main`); s.onopen=()=>setWs(s); s.onmessage=e=>{try{setMsgs(p=>[...p,JSON.parse(e.data)])}catch{}}; return ()=>s.close() },[])
  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:'smooth'}) },[msgs])
  const send = e=>{ e.preventDefault(); if(!input.trim()||!ws) return; ws.send(JSON.stringify({user_id:usr.id,nickname:usr.nickname,content:input,timestamp:new Date().toISOString()})); setInput('') }
  return <div className="chat-room"><div className="chat-messages">{msgs.length===0?<Empty icon="💬" title="暂无消息" desc="来说点什么吧"/>:msgs.map((m,i)=><div key={i} className={`chat-message ${m.user_id===usr.id?'own':''}`}><span className="chat-nickname">{m.nickname}</span><span className="chat-content">{m.content}</span><span className="chat-time">{new Date(m.timestamp).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</span></div>)}<div ref={endRef}/></div><form onSubmit={send} className="chat-input-form"><input value={input} onChange={e=>setInput(e.target.value)} placeholder="输入消息..." className="glass-input chat-input"/><button type="submit" className="glass-button btn-primary chat-send-btn" disabled={!input.trim()}>发送</button></form></div>
}

// ── AdminPage ──
const AdminPage = ({user}) => {
  const toast=useToast(); const [stats,setStats]=useState(null); const [ulist,setUlist]=useState([]); const [reports,setReports]=useState([]); const [tab,setTab]=useState('stats'); const [loading,setLoading]=useState(true)
  useEffect(()=>{ const f=async()=>{ setLoading(true); try{ const [sr,ur,rr]=await Promise.all([fetch(`${API_BASE}/admin/stats?user_id=${user.id}`),fetch(`${API_BASE}/admin/users?user_id=${user.id}`),fetch(`${API_BASE}/admin/reports?user_id=${user.id}`)]); if(sr.ok)setStats(await sr.json()); if(ur.ok)setUlist(await ur.json()); if(rr.ok)setReports(await rr.json()) }catch(e){toast.error('加载失败')} finally{setLoading(false)} }; f() },[])
  const updReport = async(id,st)=>{ try{ await fetch(`${API_BASE}/admin/reports/${id}/status?user_id=${user.id}&status=${st}`,{method:'PUT'}); setReports(rs=>rs.map(x=>x.id===id?{...x,status:st}:x)); toast.success('状态已更新') }catch{toast.error('更新失败')} }
  if(loading) return <Spinner/>
  return <div className="admin-page"><h2 className="admin-title">管理后台</h2>
  <div className="admin-tabs"><button className={`admin-tab ${tab==='stats'?'active':''}`} onClick={()=>setTab('stats')}>数据</button><button className={`admin-tab ${tab==='users'?'active':''}`} onClick={()=>setTab('users')}>用户</button><button className={`admin-tab ${tab==='reports'?'active':''}`} onClick={()=>setTab('reports')}>举报 ({reports.filter(r=>r.status==='pending').length})</button></div>
  {tab==='stats'&&stats&&<div className="admin-stats"><div className="glass-card stat-card"><span className="stat-number">{stats.total_users}</span><span className="stat-desc">注册用户</span></div><div className="glass-card stat-card"><span className="stat-number">{stats.total_posts}</span><span className="stat-desc">帖子总数</span></div><div className="glass-card stat-card"><span className="stat-number">{stats.total_comments}</span><span className="stat-desc">评论总数</span></div><div className="glass-card stat-card"><span className="stat-number">{stats.pending_reports}</span><span className="stat-desc">待处理举报</span></div></div>}
  {tab==='users'&&<div className="admin-list">{ulist.map(u=><div key={u.id} className="glass-card admin-user-card"><div className="admin-user-info"><span className="uid-badge">{u.uid||'------'}</span><span className="admin-username">@{u.username}</span><span className="admin-nickname">{u.nickname}</span>{u.role==='founder'&&<span className="role-badge founder">创始人</span>}{u.role==='ambassador'&&<span className="role-badge ambassador">大使</span>}<span>{getSchoolName(u.school_id)}</span></div><div className="admin-user-meta"><span>匿名: {u.is_anonymous?'是':'否'}</span><span>注册: {u.created_at?new Date(u.created_at).toLocaleDateString('zh-CN'):'-'}</span></div></div>)}</div>}
  {tab==='reports'&&<div className="admin-list">{reports.length===0?<Empty icon="✅" title="暂无举报" desc="一切正常"/>:reports.map(r=><div key={r.id} className="glass-card admin-report-card"><div className="report-header"><span className={`report-status ${r.status}`}>{r.status==='pending'?'待处理':r.status==='reviewed'?'已审核':'已解决'}</span><span className="report-time">{r.created_at?new Date(r.created_at).toLocaleString('zh-CN'):'-'}</span></div><div className="report-body"><p><strong>举报者:</strong> {r.reporter_nickname} ({r.reporter_uid})</p><p><strong>目标:</strong> {r.target_type==='post'?'帖子':'评论'} #{r.target_id}</p><p><strong>原因:</strong> {r.reason}</p></div>{r.status==='pending'&&<div className="report-actions"><button className="save-btn" onClick={()=>updReport(r.id,'reviewed')}>标记已审核</button><button className="save-btn" onClick={()=>updReport(r.id,'resolved')}>标记已解决</button></div>}</div>)}</div>}
  </div>
}

// ── ProfilePage ──
const ProfilePage = ({user,setUser}) => {
  const toast=useToast(); const [nick,setNick]=useState(user.nickname); const [pw,setPw]=useState(''); const isAdmin=user.role==='founder'||user.role==='ambassador'; const [isAnon,setIsAnon]=useState(isAdmin?false:user.is_anonymous!==false)
  const save=async()=>{ if(!nick?.trim()){toast.error('账户名不能为空');return}
    try{ const body={nickname:nick.trim(),is_anonymous:isAdmin?false:isAnon}; if(pw?.trim())body.password=pw.trim()
      const r=await fetch(`${API_BASE}/users/${user.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.detail||'保存失败')}
      const u=await r.json(); setUser(u); localStorage.setItem('user',JSON.stringify(u)); setPw(''); toast.success('保存成功') }catch(e){toast.error(e.message)} }
  return <div className="profile-page"><div className="glass-card profile-card"><label className="avatar-upload"><img src={user.avatar||`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} alt="头像"/><div className="avatar-upload-overlay">📷</div><input type="file" accept="image/*" onChange={async e=>{const f=e.target.files[0];if(!f)return;const reader=new FileReader();reader.onload=async ev=>{const r=await fetch(`${API_BASE}/users/${user.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({avatar:ev.target.result})});if(r.ok){const u=await r.json();setUser(u);localStorage.setItem('user',JSON.stringify(u));toast.success('头像已更新')}};reader.readAsDataURL(f)}}/></label><div className="profile-info"><h3>{user.nickname}</h3><p className="profile-username">@{user.username}</p><span className="uid-badge">UID: {user.uid}</span>{user.role==='founder'&&<span className="role-badge founder">创始人</span>}{user.role==='ambassador'&&<span className="role-badge ambassador">大使</span>}<div className="profile-stats"><div className="stat-item"><span className="stat-value">{user.star_count||0}</span><span className="stat-label">Star</span></div><div className="stat-item"><span className="stat-value">{user.karma||0}</span><span className="stat-label">Karma</span></div></div><div className="karma-level" style={{marginTop:'.5rem',fontSize:'.85rem',opacity:.9}}>{['🌫️ 初来乍到','🌱 成长中的声音','🔥 活跃核心','🌟 树洞之光'][Math.min(3,Math.floor((user.karma||0)/20))]}</div></div></div><div className="glass-card settings-card"><h3>设置</h3><div className="settings-list">{!isAdmin&&<div className="setting-row"><span>匿名发布</span><div className={`toggle-switch ${isAnon?'active':''}`} onClick={()=>setIsAnon(!isAnon)}/></div>}<div className="setting-row"><span>账户名</span><input value={nick} onChange={e=>setNick(e.target.value)}/></div><div className="setting-row"><span>修改密码</span><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="留空不修改"/></div><button className="save-btn" onClick={save}>保存设置</button></div><div className="settings-section"><h4>其他</h4><div className="settings-list"><div className="settings-item" onClick={()=>{setUser(null);localStorage.removeItem('token');localStorage.removeItem('user');toast.info('已退出登录')}}><span>退出登录</span><span className="settings-arrow">→</span></div></div></div></div></div>
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

  const fetchPosts = useCallback(async()=>{ setLoading(true); try{ let url=`${API_BASE}/posts/?user_id=${user?.id||''}`; if(activeCat!=='all')url+=`&category=${activeCat}`; if(activeForum!=='all')url+=`&forum=${activeForum}`; if(activeSort==='hot')url+=`&sort=hot`; if(debouncedQ.trim())url+=`&search=${encodeURIComponent(debouncedQ.trim())}`; const r=await fetch(url); if(!r.ok)throw new Error('获取帖子失败'); setPosts(await r.json()) }catch(e){setError(e.message)}finally{setLoading(false)} },[activeCat,activeForum,activeSort,debouncedQ,user])

  useEffect(()=>{ const t=setTimeout(()=>setDebouncedQ(searchQ),300); return ()=>clearTimeout(t) },[searchQ])
  useEffect(()=>{ const el=document.querySelector('.main-content'); if(!el)return; if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return; gsap.fromTo(el,{opacity:0,y:12},{opacity:1,y:0,duration:.3,ease:'power2.out'}) },[curPage])
  // 分类标签错落入场（与帖子卡片呼应）
  useEffect(()=>{ const el=document.querySelector('.category-tabs'); if(!el)return; if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return; const ctx=gsap.context(()=>{ gsap.from('.category-tab',{opacity:0,y:10,duration:.35,ease:'power2.out',stagger:.04,clearProps:'opacity,transform'}) }); return ()=>ctx.revert(); },[activeCat])
  useEffect(()=>{ const saved=localStorage.getItem('user'); if(saved){try{setUser(JSON.parse(saved))}catch{localStorage.removeItem('user')}} },[])
  useEffect(()=>{ if(user) fetchPosts() },[user,fetchPosts])

  // 载入当前用户的星标记录（localStorage 持久化，避免刷新后丢失高亮）
  useEffect(()=>{ if(!user){ setMyStars({}); return } const k='treehole_stars_'+user.id; try{ setMyStars(JSON.parse(localStorage.getItem(k)||'{}')) }catch{ setMyStars({}) } },[user])

  // 帖子卡片错落入场（GSAP stagger）；尊重 prefers-reduced-motion
  useEffect(()=>{
    if(!posts.length) return;
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx=gsap.context(()=>{
      gsap.from('.post-card',{opacity:0,y:18,duration:.45,ease:'power2.out',stagger:.06,clearProps:'opacity,transform'});
    });
    return ()=>ctx.revert();
  },[posts])

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

  if(isRegister&&!user) return <ToastProvider><RegisterForm onSwitch={()=>setIsRegister(false)}/></ToastProvider>

  return <ToastProvider>
    <Starfield/>
    {showRules&&<RulesModal onClose={()=>{localStorage.setItem('rules_accepted','true');setShowRules(false)}}/>}
    {!user ? <LoginPage onLogin={handleLogin} onSwitchRegister={()=>setIsRegister(true)}/>
    : selectedPost ? <div className="app"><PostDetail post={selectedPost} user={user} onBack={()=>setSelectedPost(null)} onRefresh={fetchPosts} myStars={myStars} onToggleStar={toggleStar}/></div>
    : <div className="app">
      <nav className="glass-nav"><h2 className="nav-title">校园树洞</h2><div className="nav-links"><button className={curPage==='home'?'active':''} onClick={()=>setCurPage('home')}>首页</button><button className={curPage==='chat'?'active':''} onClick={()=>setCurPage('chat')}>聊天室</button>{isAdmin&&<button className={curPage==='admin'?'active':''} onClick={()=>setCurPage('admin')}>管理</button>}<button className={curPage==='profile'?'active':''} onClick={()=>setCurPage('profile')}>我的</button></div><div className="user-info">{isAdmin&&<span className="role-indicator">{user.role==='founder'?'👑':'🏅'}</span>}<span className="user-nickname">{user.nickname}</span></div></nav>
      <main className="main-content">
        {curPage==='home'&&<div className="home-page">
          {user&&<div className="glass-card create-post-card"><h3>发布新帖子</h3><PostForm user={user} visibleForums={getVisibleForums()} onPostCreated={fetchPosts}/></div>}
          <div className="forum-tabs"><button className={`forum-tab ${activeForum==='all'?'active':''}`} onClick={()=>setActiveForum('all')}>全部</button>{getVisibleForums().map(f=><button key={f.code} className={`forum-tab ${activeForum===f.code?'active':''}`} onClick={()=>setActiveForum(f.code)}>{f.code==='main'?'🏠':'🏫'} {f.name}</button>)}</div>
          <div className="search-bar"><input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="搜索帖子..." className="glass-input search-input"/>{searchQ&&<button className="search-clear" onClick={()=>setSearchQ('')}>✕</button>}</div>
          <div className="category-tabs"><button className={`category-tab ${activeCat==='all'?'active':''}`} onClick={()=>setActiveCat('all')}>全部</button>{CATEGORIES.map(c=><button key={c.id} className={`category-tab ${activeCat===c.id?'active':''}`} onClick={()=>setActiveCat(c.id)}><span className="category-icon">{c.icon}</span><span className="category-name">{c.name}</span></button>)}</div>
          <div className="category-tabs"><button className={`category-tab ${activeSort==='latest'?'active':''}`} onClick={()=>setActiveSort('latest')}>🕒 最新</button><button className={`category-tab ${activeSort==='hot'?'active':''}`} onClick={()=>setActiveSort('hot')}>🔥 热门</button></div>
          {loading?<SkeletonList/>:error?<ErrorBox msg={error} onRetry={fetchPosts}/>:posts.length===0?<Empty icon="📝" title="暂无帖子" desc="成为第一个发帖的人吧"/>:<div className="posts-list">{posts.map((p,i)=><div key={p.id} className={`glass-card post-card ${p.is_announcement?'post-announcement':''}`} onClick={()=>setSelectedPost(p)}>{p.is_announcement&&<div className="announcement-badge">📢 公告</div>}<div className="post-card-header"><span className="post-author-name-small">{p.display_name||'匿名用户'}</span>{canSeeUid(user,p)&&<span className="uid-badge">{p.user_uid}{p.hide_uid&&' (隐藏)'}</span>}<span className="post-forum-badge">{getSchoolName(p.forum)}</span><span className="post-category-mini">{p.category?p.category.split(',').map(c=>CATEGORIES.find(x=>x.id===c)?.icon||'📝').join(' '):'📝'}</span></div><h4 className="post-title">{p.title}</h4><p className="post-preview">{p.content?.slice(0,100)}{p.content?.length>100?'...':''}</p><div className="post-footer"><span className="post-time">{fmtTime(p.created_at)}</span><div className="post-actions">{(user?.id===p.user_id||user?.role==='founder'||(user?.role==='ambassador'&&p.user_school===user.school_id))&&<button onClick={e=>{e.stopPropagation();if(!confirm('确定删除？'))return;fetch(`${API_BASE}/posts/${p.id}?user_id=${user.id}`,{method:'DELETE'}).then(fetchPosts)}} className="action-btn delete-btn">🗑️</button>}<button onClick={e=>{e.stopPropagation();toggleStar(p)}} className={`action-btn star-btn ${myStars[p.id]?'starred':''}`}>{myStars[p.id]?'⭐':'☆'} {p.star_count||0}</button><span className="action-text">💬 {p.comment_count}</span></div></div></div>)}</div>}
        </div>}
        {curPage==='chat'&&<div className="chat-page"><div className="glass-card chat-container"><ChatRoom/></div></div>}
        {curPage==='admin'&&isAdmin&&<AdminPage user={user}/>}
        {curPage==='profile'&&<ProfilePage user={user} setUser={setUser}/>}
      </main>
      <nav className="mobile-nav"><button className={`mobile-nav-item ${curPage==='home'?'active':''}`} onClick={()=>setCurPage('home')}><span className="nav-icon">🏠</span><span className="nav-label">首页</span></button><button className={`mobile-nav-item ${curPage==='chat'?'active':''}`} onClick={()=>setCurPage('chat')}><span className="nav-icon">💬</span><span className="nav-label">聊天</span></button>{isAdmin&&<button className={`mobile-nav-item ${curPage==='admin'?'active':''}`} onClick={()=>setCurPage('admin')}><span className="nav-icon">⚙️</span><span className="nav-label">管理</span></button>}<button className={`mobile-nav-item ${curPage==='profile'?'active':''}`} onClick={()=>setCurPage('profile')}><span className="nav-icon">👤</span><span className="nav-label">我的</span></button></nav>
    </div>}
  </ToastProvider>
}

export default App
