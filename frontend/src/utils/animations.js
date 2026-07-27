// Shared animation helpers for anime.js + GSAP
import anime from 'animejs'
import gsap from 'gsap'

// Staggered list entrance
export function animateList(selector, delay = 60) {
  return anime({
    targets: selector,
    translateY: [20, 0],
    opacity: [0, 1],
    delay: anime.stagger(delay),
    duration: 500,
    easing: 'easeOutCubic',
  })
}

// Card hover (GSAP for performance)
export function cardHover(el, enter) {
  gsap.to(el, {
    y: enter ? -4 : 0,
    scale: enter ? 1.01 : 1,
    boxShadow: enter
      ? '0 12px 40px rgba(31,38,135,0.4)'
      : '0 8px 32px rgba(31,38,135,0.37)',
    duration: 0.25,
    ease: 'power2.out',
  })
}

// Page entrance
export function pageEnter() {
  gsap.fromTo('.main-content', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' })
}

// Nav scroll shrink
export function navScroll() {
  const nav = document.querySelector('.glass-nav')
  if (!nav) return
  const onScroll = () => {
    gsap.to(nav, {
      padding: window.scrollY > 40 ? '0.5rem 1rem' : '0.75rem 1.5rem',
      duration: 0.3,
      ease: 'power2.out',
    })
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  return () => window.removeEventListener('scroll', onScroll)
}

// Toast pop-in
export function animateToast(el) {
  anime({
    targets: el,
    translateX: [60, 0],
    opacity: [0, 1],
    duration: 400,
    easing: 'easeOutCubic',
  })
}

// Pulse attention
export function pulse(el) {
  anime({ targets: el, scale: [1, 1.05, 1], duration: 600, easing: 'easeInOutCubic' })
}
