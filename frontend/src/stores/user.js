import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../utils/api'

export const useUserStore = defineStore('user', () => {
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))
  const token = ref(localStorage.getItem('token') || '')

  const isLoggedIn = computed(() => !!token.value && !!user.value)
  const isAdmin = computed(() => ['founder', 'ambassador'].includes(user.value?.role))

  function saveAuth(t, u) {
    token.value = t
    user.value = u
    localStorage.setItem('token', t)
    localStorage.setItem('user', JSON.stringify(u))
  }

  async function login(username, password) {
    const res = await api(`/users/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '登录失败')
    saveAuth(data.access_token, data.user)
    return data.user
  }

  async function wechatLogin(code) {
    const res = await api('/users/wechat-login', { method: 'POST', body: { code } })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '微信登录失败')
    saveAuth(data.access_token, data.user)
    return data.user
  }

  async function register(body) {
    const res = await api('/users/', { method: 'POST', body })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '注册失败')
    saveAuth(data.access_token, data.user)
    return data.user
  }

  function logout() {
    user.value = null
    token.value = ''
    localStorage.removeItem('user')
    localStorage.removeItem('token')
  }

  return { user, token, isLoggedIn, isAdmin, login, wechatLogin, register, logout }
})
