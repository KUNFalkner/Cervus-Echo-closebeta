<script setup>
import { watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from './stores/user.js'
import ToastContainer from './components/ToastContainer.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const pages = [
  { name: 'home', label: '首页', icon: '🏠' },
  { name: 'chat', label: '聊天', icon: '💬' },
  { name: 'admin', label: '管理', icon: '⚙️', admin: true },
  { name: 'profile', label: '我的', icon: '👤' },
]

// Route guard: redirect to login if not authenticated
watch(() => [route.path, userStore.isLoggedIn], () => {
  if (!userStore.isLoggedIn && route.name !== 'login') {
    router.replace({ name: 'login' })
  }
}, { immediate: true })
</script>

<template>
  <div class="app">
    <div class="app-bg" />
    <ToastContainer />

    <template v-if="userStore.isLoggedIn">
      <nav class="glass-nav">
        <h2 class="nav-title">校园树洞</h2>
        <div class="nav-links">
          <button
            v-for="p in pages"
            v-show="!p.admin || userStore.isAdmin"
            :key="p.name"
            :class="{ active: route.name === p.name }"
            @click="router.push({ name: p.name })"
          >{{ p.icon }} {{ p.label }}</button>
        </div>
        <div class="nav-user" @click="router.push({ name: 'profile' })">
          <span v-if="userStore.isAdmin" class="role-badge">{{ userStore.user.role === 'founder' ? '👑' : '🏅' }}</span>
          <span class="user-nickname">{{ userStore.user?.nickname }}</span>
        </div>
      </nav>

      <main class="main-content">
        <router-view />
      </main>

      <nav class="mobile-nav">
        <button
          v-for="p in pages"
          v-show="!p.admin || userStore.isAdmin"
          :key="p.name"
          :class="{ active: route.name === p.name }"
          @click="router.push({ name: p.name })"
        >
          <span class="nav-icon">{{ p.icon }}</span>
          <span class="nav-label">{{ p.label }}</span>
        </button>
      </nav>
    </template>

    <!-- Login route (no nav) -->
    <router-view v-else />
  </div>
</template>
