import React, { createContext, useContext, useState, useRef } from 'react'

// 全局 Toast 上下文：从 App.jsx 抽出，避免 TarotExperience 反向依赖 App 造成的循环引用。
export const ToastCtx = createContext()

export const useToast = () => useContext(ToastCtx)

// 命令式 toast 单例：供未被 ToastProvider 包裹的最外层代码（如 App 自身）直接调用，
// 无需在组件树内。Provider 挂载时把 push 接上，因此仅在应用已渲染后才可用（本项目调用时机均满足）。
let externalPush = null
export const toast = {
  success: (m) => externalPush && externalPush('success', m),
  error: (m) => externalPush && externalPush('error', m),
  info: (m) => externalPush && externalPush('info', m),
}

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([])
  const tidRef = useRef(0)
  const push = (type, m) => {
    const id = ++tidRef.current
    setToasts(p => [...p, { id, msg: m, type }])
    // 先标记离场（触发 CSS 退出动画），再真正移除
    setTimeout(() => setToasts(p => p.map(t => t.id === id ? { ...t, leaving: true } : t)), 2700)
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000)
  }
  const toast = { success: m => push('success', m), error: m => push('error', m), info: m => push('info', m) }
  externalPush = push
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => <div key={t.id} className={`toast toast-${t.type}${t.leaving ? ' leaving' : ''}`}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  )
}
