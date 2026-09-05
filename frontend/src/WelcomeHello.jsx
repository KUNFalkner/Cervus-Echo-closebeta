import { useState, useEffect, useRef } from 'react'
import { animate, createDrawable, stagger } from 'animejs'

/**
 * 登录欢迎遮罩：Apple 风手写 "hello" 一笔一划顺出来，然后昵称与品牌落款依次浮现。
 *
 * 按 animejs skill 规范：createDrawable(path) + draw:['0 0','0 1'] + stagger(延迟)，
 * React 侧用 useEffect + 显式 cleanup（context.revert 思路），prefers-reduced-motion 时跳过动画直接显示成品。
 *
 * hello 的 SVG path：每个字母一条独立 path，stroke-linecap:round 让笔画端点圆润，像手写。
 * 字母路径为手绘连笔风格（h 先竖后拱、e 一笔、l 竖、o 一笔回环）。
 */
const HELLO_PATHS = [
  // h
  'M10 68 V20 C12 14 20 10 26 16 C31 21 30 30 30 38 V68',
  // e
  'M52 44 C40 38 34 44 36 52 C38 60 48 62 55 56 C60 51 60 44 55 40 C52 38 48 38 46 40',
  // l (1)
  'M76 68 V20',
  // l (2)
  'M100 68 V20',
  // o
  'M122 42 C118 32 108 30 103 38 C99 45 100 56 108 60 C116 63 124 57 125 48 C126 40 120 34 113 34',
];

const HelloSVG = () => (
  <svg viewBox="0 0 145 80" className="welcome-hello-svg" aria-label="hello">
    {HELLO_PATHS.map((d, i) => (
      <path key={i} className="welcome-hello-stroke" d={d}
        fill="none" stroke="currentColor" strokeWidth="6"
        strokeLinecap="round" strokeLinejoin="round" />
    ))}
  </svg>
);

export default function WelcomeHello({ nickname, onDone, duration = 3400 }) {
  const rootRef = useRef(null);
  const [phase, setPhase] = useState('drawing'); // drawing -> name -> brand -> fade
  const timerRef = useRef(null);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = rootRef.current;
    if (!root) return;

    // 点击 / 按键可跳过
    const skip = () => { if (timerRef.current) clearTimeout(timerRef.current); onDone && onDone(); };
    root.addEventListener('click', skip);
    const keySkip = (e) => { if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') { e.preventDefault(); skip(); } };
    window.addEventListener('keydown', keySkip);

    if (reduce) {
      // 减少动态：不描边，直接展示成品，短延迟后淡出
      setPhase('name');
      timerRef.current = setTimeout(() => { setPhase('brand'); timerRef.current = setTimeout(() => onDone && onDone(), 900); }, 500);
      return () => { root.removeEventListener('click', skip); window.removeEventListener('keydown', keySkip); if (timerRef.current) clearTimeout(timerRef.current); };
    }

    // 动画序列：hello 逐笔 -> 昵称淡入 -> 品牌落款淡入 -> 整层淡出
    const strokes = root.querySelectorAll('.welcome-hello-stroke');
    const drawables = [...strokes].map((p) => createDrawable(p));
    // 先全部藏起（stroke 画线起点）
    strokes.forEach((p) => { p.style.strokeDasharray = 'none'; });

    const anim = animate(drawables, {
      draw: ['0 0', '0 1'],
      delay: stagger(160),
      duration: 850,
      ease: 'inOutQuad',
    });
    anim.finished.then(() => {
      setPhase('name');
      const t1 = setTimeout(() => setPhase('brand'), 700);
      const t2 = setTimeout(() => { setPhase('fade'); const t3 = setTimeout(() => onDone && onDone(), 800); timerRef.current = t3; }, 2300);
      timerRef.current = t2;
      // 清理 t1（若组件提前卸载）
      timerRef.current._t1 = t1;
    });

    return () => {
      root.removeEventListener('click', skip);
      window.removeEventListener('keydown', keySkip);
      if (timerRef.current) { clearTimeout(timerRef.current); if (timerRef.current._t1) clearTimeout(timerRef.current._t1); }
      try { anim.pause(); } catch (e) {}
    };
  }, [onDone]);

  return (
    <div ref={rootRef} className={`welcome-overlay ${phase === 'fade' ? 'welcome-fade' : ''}`} role="dialog" aria-label="欢迎">
      <div className="welcome-inner">
        <div className="welcome-hello"><HelloSVG /></div>
        <div className={`welcome-name ${phase === 'name' || phase === 'brand' || phase === 'fade' ? 'on' : ''}`}>
          {nickname ? `欢迎，${nickname}` : '欢迎回来'}
        </div>
        <div className={`welcome-brand ${phase === 'brand' || phase === 'fade' ? 'on' : ''}`}>
          鹿鸣回音 · Cervus Echo
        </div>
        <div className="welcome-skip-hint">点击或按任意键跳过</div>
      </div>
    </div>
  );
}
