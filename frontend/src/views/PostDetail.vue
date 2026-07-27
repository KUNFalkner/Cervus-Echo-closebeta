<script setup>
import { ref, onMounted, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores/user.js'
import { api } from '../utils/api.js'
import { pageEnter, animateList } from '../utils/animations.js'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const toast = inject('toast', () => {})

const post = ref(null)
const comments = ref([])
const newComment = ref('')
const loading = ref(true)
const commentLoading = ref(false)

onMounted(async () => {
  await fetchPost()
  await fetchComments()
  pageEnter()
  setTimeout(() => animateList('.comment', 40), 300)
})

async function fetchPost() {
  loading.value = true
  try {
    const res = await api(`/posts/${route.params.id}`)
    if (!res.ok) throw new Error('帖子不存在')
    post.value = await res.json()
  } catch (e) { toast(e.message, 'error'); router.push({ name: 'home' }) }
  finally { loading.value = false }
}

async function fetchComments() {
  try {
    const res = await api(`/posts/${route.params.id}/comments`)
    comments.value = res.ok ? await res.json() : []
  } catch { comments.value = [] }
}

async function addComment() {
  if (!newComment.value.trim()) return
  commentLoading.value = true
  try {
    const res = await api(`/posts/${route.params.id}/comments`, {
      method: 'POST',
      body: { post_id: Number(route.params.id), user_id: userStore.user.id, content: newComment.value }
    })
    if (!res.ok) { const d = await res.json(); throw new Error(d.detail) }
    newComment.value = ''
    await fetchComments()
    post.value.comment_count = (post.value.comment_count || 0) + 1
    toast('评论成功', 'success')
  } catch (e) { toast(e.message, 'error') }
  finally { commentLoading.value = false }
}

async function deleteComment(id) {
  if (!confirm('确定删除这条评论？')) return
  try {
    const res = await api(`/posts/${route.params.id}/comments/${id}?user_id=${userStore.user.id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('删除失败')
    fetchComments()
    toast('已删除', 'success')
  } catch (e) { toast(e.message, 'error') }
}
</script>

<template>
  <div class="post-detail-page">
    <button class="glass-btn back-btn" @click="router.push({ name: 'home' })">← 返回</button>

    <div v-if="loading" class="state-box"><div class="spinner" /><p>加载中...</p></div>

    <template v-else-if="post">
      <div class="glass-card post-detail-card">
        <div class="post-header">
          <span class="post-user">{{ post.display_name || '匿名用户' }}</span>
          <span class="post-time">{{ new Date(post.created_at).toLocaleString() }}</span>
        </div>
        <h2 class="post-title">{{ post.title }}</h2>
        <p class="post-content">{{ post.content }}</p>
        <div class="post-footer">
          <span>❤️ {{ post.like_count || 0 }}</span>
          <span>⭐ {{ post.star_count || 0 }}</span>
          <span>💬 {{ post.comment_count || 0 }}</span>
        </div>
      </div>

      <div class="comments-section">
        <h3>评论 ({{ comments.length }})</h3>
        <div v-for="c in comments" :key="c.id" class="comment glass-card">
          <div class="comment-header">
            <span class="comment-user">{{ c.display_name || '匿名用户' }}</span>
            <span class="comment-time">{{ new Date(c.created_at).toLocaleString() }}</span>
          </div>
          <p class="comment-content">{{ c.content }}</p>
          <button v-if="c.user_id === userStore.user?.id || userStore.isAdmin"
            class="delete-btn" @click="deleteComment(c.id)">🗑️</button>
        </div>
        <div v-if="comments.length === 0" class="state-box empty"><p>💬 还没有评论，抢沙发吧！</p></div>
      </div>

      <div class="comment-form glass-card">
        <textarea v-model="newComment" class="glass-input" placeholder="写下你的评论..." rows="2" />
        <button class="glass-btn primary" :disabled="commentLoading || !newComment.trim()" @click="addComment">
          {{ commentLoading ? '发送中...' : '发表评论' }}
        </button>
      </div>
    </template>
  </div>
</template>
