import React, { useEffect, useRef } from 'react'
import gsap from 'gsap'
import TarotExperience from './TarotExperience'

// 全屏沉浸式塔罗：深空背景，从右下角水晶球展开（GSAP），内含 TarotExperience。
const TarotOverlay = ({ open, onClose }) => {
  const overlayRef = useRef(null)
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const el = overlayRef.current
    if (!el) return
    if (open) {
      document.body.style.overflow = 'hidden'
      el.style.display = 'flex'
      if (reduce()) { gsap.set(el, { opacity: 1, scale: 1 }); return }
      gsap.fromTo(el,
        { opacity: 0, scale: 0.25, transformOrigin: 'bottom right' },
        { opacity: 1, scale: 1, duration: 0.42, ease: 'power3.out' })
    } else {
      document.body.style.overflow = ''
      if (reduce()) { el.style.display = 'none'; return }
      gsap.to(el, {
        opacity: 0, scale: 0.92, duration: 0.3, ease: 'power2.in',
        onComplete: () => { el.style.display = 'none' }
      })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose() }

  return (
    <div
      ref={overlayRef}
      className="tarot-overlay"
      style={{ display: 'none' }}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="塔罗占卜"
    >
      <div className="tarot-overlay-space" aria-hidden>
        <div className="tarot-nebula" />
        <div className="tarot-nebula tarot-nebula-2" />
      </div>
      <button className="tarot-overlay-close" onClick={onClose} aria-label="关闭">×</button>
      <div className="tarot-overlay-scroll">
        <TarotExperience />
      </div>
    </div>
  )
}

export default TarotOverlay
