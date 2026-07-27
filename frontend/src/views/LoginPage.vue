<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user.js'

const router = useRouter()
const userStore = useUserStore()
const isRegister = ref(false)
const username = ref('')
const password = ref('')
const nickname = ref('')
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  loading.value = true; error.value = ''
  try {
    await userStore.login(username.value, password.value)
    router.replace({ name: 'home' })
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}

async function handleRegister() {
  loading.value = true; error.value = ''
  try {
    await userStore.register({ username: username.value, password: password.value, nickname: nickname.value })
    router.replace({ name: 'home' })
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card glass-card">
      <h1 class="login-title">校园树洞</h1>
      <p class="login-desc">匿名、安全、自由地表达自己</p>

      <div v-if="error" class="error-msg">{{ error }}</div>

      <template v-if="!isRegister">
        <input v-model="username" type="text" placeholder="用户名" class="glass-input" @keyup.enter="handleLogin" />
        <input v-model="password" type="password" placeholder="密码" class="glass-input" @keyup.enter="handleLogin" />
        <button class="glass-btn primary" :disabled="loading" @click="handleLogin">
          {{ loading ? '登录中...' : '登录' }}
        </button>
        <p class="switch-link" @click="isRegister = true">没有账号？去注册 →</p>
      </template>

      <template v-else>
        <input v-model="username" type="text" placeholder="用户名" class="glass-input" />
        <input v-model="nickname" type="text" placeholder="昵称（选填）" class="glass-input" />
        <input v-model="password" type="password" placeholder="密码" class="glass-input" />
        <button class="glass-btn primary" :disabled="loading" @click="handleRegister">
          {{ loading ? '注册中...' : '注册' }}
        </button>
        <p class="switch-link" @click="isRegister = false">← 已有账号？去登录</p>
      </template>
    </div>
    <p class="login-footer">🌳 说出你的故事，无需担心被认出</p>
  </div>
</template>
