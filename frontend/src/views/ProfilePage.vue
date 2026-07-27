<script setup>
import { ref, inject } from 'vue'
import { useUserStore } from '../stores/user.js'
import { api } from '../utils/api.js'

const userStore = useUserStore()
const toast = inject('toast', () => {})

const nickname = ref(userStore.user?.nickname || '')
const password = ref('')
const saving = ref(false)

async function save() {
  saving.value = true
  try {
    const body = { nickname: nickname.value }
    if (password.value) body.password = password.value
    const res = await api(`/users/${userStore.user.id}`, { method: 'PUT', body })
    if (!res.ok) { const d = await res.json(); throw new Error(d.detail || '保存失败') }
    // Update local user
    const updated = await res.json()
    userStore.user = updated
    localStorage.setItem('user', JSON.stringify(updated))
    password.value = ''
    toast('保存成功', 'success')
  } catch (e) { toast(e.message, 'error') }
  finally { saving.value = false }
}
</script>

<template>
  <div class="profile-page">
    <div class="glass-card profile-card">
      <div class="profile-header">
        <img :src="userStore.user?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'" class="profile-avatar" alt="avatar" />
        <div class="profile-info">
          <h3>{{ userStore.user?.nickname }}</h3>
          <p>@{{ userStore.user?.username }}</p>
          <span class="uid-badge">UID: {{ userStore.user?.uid }}</span>
          <span v-if="userStore.isAdmin" class="role-badge">{{ userStore.user.role === 'founder' ? '创始人' : '大使' }}</span>
          <div class="profile-stats">
            <div class="stat-item"><span class="stat-value">{{ userStore.user?.star_count || 0 }}</span><span class="stat-label">Star</span></div>
            <div class="stat-item"><span class="stat-value">{{ userStore.user?.karma || 0 }}</span><span class="stat-label">Karma</span></div>
          </div>
        </div>
      </div>
    </div>

    <div class="glass-card settings-card">
      <h3>设置</h3>
      <div class="setting-row">
        <span>昵称</span>
        <input v-model="nickname" class="glass-input" />
      </div>
      <div class="setting-row">
        <span>修改密码</span>
        <input v-model="password" type="password" class="glass-input" placeholder="留空不修改" />
      </div>
      <button class="glass-btn primary" :disabled="saving" @click="save">
        {{ saving ? '保存中...' : '保存设置' }}
      </button>
    </div>

    <div class="glass-card" style="margin-top: 1rem;">
      <button class="glass-btn danger" @click="userStore.logout(); $router.push('/')">退出登录</button>
    </div>
  </div>
</template>
