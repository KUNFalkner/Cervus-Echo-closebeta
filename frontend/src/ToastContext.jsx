import React, { createContext, useContext, useState, useRef } from 'react'

// 全局 Toast 上下文：从 App.jsx 抽出，避免 TarotExperience 反向依赖 App 造成的循环引用。
export const ToastCtx = createContext()

export const useToast = () => useContext(ToastCtx)

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([])
  const tidRef = useRef(0)
  const push = (type, m) => {
    const id = ++tidRef.current
    setToasts(p => [...p, { id, msg: m, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000)
  }
  const toast = { success: m => push('success', m), error: m => push('error', m), info: m => push('info', m) }
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  )
}
