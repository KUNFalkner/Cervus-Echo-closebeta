<script setup>
import { ref, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user.js'
import { api } from '../utils/api.js'

const props = defineProps({ post: Object, showForum: Boolean })
const emit = defineEmits(['refresh'])
const router = useRouter()
const userStore = useUserStore()
const toast = inject('toast', () => {})
const starLoading = ref(false)

function openPost() { router.push({ name: 'post', params: { id: props.post.id } }) }

async function toggleStar(e) {
  e.stopPropagation(); starLoading.value = true
  try {
    const res = await api(`/posts/${props.post.id}/star?user_id=${userStore.user?.id}`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '加星失败')
    emit('refresh')
  } catch (e) { toast(e.message, 'error') }
  finally { starLoading.value = false }
}

async function reportPost(e) {
  e.stopPropagation()
  const reason = prompt('举报理由：')
  if (!reason) return
  try {
    await api('/reports/', { method: 'POST', body: { reporter_id: userStore.user.id, target_type: 'post', target_id: props.post.id, reason } })
    toast('举报已提交', 'success')
  } catch (e) { toast('举报失败', 'error') }
}
</script>

<template>
  <div class="post-card glass-card" @click="openPost">
    <div class="post-header">
      <span v-if="post.is_announcement" class="announce-badge">📢 公告</span>
      <span class="post-forum" v-if="showForum">{{ post.forum }}</span>
      <span class="post-user">{{ post.display_name || '匿名用户' }}</span>
      <span class="post-time">{{ new Date(post.created_at).toLocaleDateString() }}</span>
    </div>
    <h3 class="post-title">{{ post.title }}</h3>
    <p class="post-content">{{ post.content?.slice(0, 200) }}{{ post.content?.length > 200 ? '...' : '' }}</p>
    <div class="post-footer">
      <span class="post-stat">❤️ {{ post.like_count || 0 }}</span>
      <span class="post-stat">⭐ {{ post.star_count || 0 }}</span>
      <span class="post-stat">💬 {{ post.comment_count || 0 }}</span>
      <button class="action-btn" @click="reportPost">🚩</button>
      <button class="action-btn star-btn" :disabled="starLoading" @click="toggleStar">⭐</button>
    </div>
  </div>
</template>
