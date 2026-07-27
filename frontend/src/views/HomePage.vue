<script setup>
import { ref, onMounted, onUnmounted, inject } from 'vue'
import { useUserStore } from '../stores/user.js'
import { api } from '../utils/api.js'
import { animateList, pageEnter, navScroll } from '../utils/animations.js'
import PostCard from '../components/PostCard.vue'

const userStore = useUserStore()
const toast = inject('toast', () => {})

const posts = ref([])
const loading = ref(true)
const error = ref('')
const title = ref('')
const content = ref('')
const posting = ref(false)
let cleanupNav = null

onMounted(() => {
  fetchPosts()
  cleanupNav = navScroll()
})

onUnmounted(() => { cleanupNav?.() })

async function fetchPosts() {
  loading.value = true; error.value = ''
  try {
    const res = await api(`/posts/?user_id=${userStore.user?.id}`)
    if (!res.ok) throw new Error('加载失败')
    posts.value = await res.json()
    pageEnter()
    setTimeout(() => animateList('.post-card', 60), 200)
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}

async function createPost() {
  if (!title.value.trim() || !content.value.trim()) return
  posting.value = true
  try {
    const res = await api('/posts/', {
      method: 'POST',
      body: { user_id: userStore.user.id, title: title.value, content: content.value, forum: 'main' }
    })
    if (!res.ok) { const d = await res.json(); throw new Error(d.detail || '发布失败') }
    title.value = ''; content.value = ''
    toast('发布成功！', 'success')
    await fetchPosts()
  } catch (e) { toast(e.message, 'error') }
  finally { posting.value = false }
}
</script>

<template>
  <div class="home-page">
    <div class="glass-card create-card">
      <input v-model="title" class="glass-input" placeholder="标题..." maxlength="100" />
      <textarea v-model="content" class="glass-input" placeholder="说点什么吧..." rows="3" maxlength="2000" />
      <button class="glass-btn primary" :disabled="posting || !title.trim() || !content.trim()" @click="createPost">
        {{ posting ? '发布中...' : '发布帖子' }}
      </button>
    </div>

    <div v-if="loading" class="state-box"><div class="spinner" /><p>加载中...</p></div>
    <div v-else-if="error" class="state-box error">
      <p>{{ error }}</p>
      <button class="glass-btn" @click="fetchPosts">重试</button>
    </div>
    <div v-else-if="posts.length === 0" class="state-box empty">
      <p>🌱 还没有帖子，来发第一条吧！</p>
    </div>

    <PostCard v-for="p in posts" :key="p.id" :post="p" @refresh="fetchPosts" />
  </div>
</template>
