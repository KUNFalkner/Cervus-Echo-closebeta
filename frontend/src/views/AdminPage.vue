<script setup>
import { ref, onMounted, inject } from 'vue'
import { useUserStore } from '../stores/user.js'
import { api } from '../utils/api.js'

const userStore = useUserStore()
const toast = inject('toast', () => {})

const activeTab = ref('reports')
const reports = ref([])
const stats = ref({})
const loading = ref(false)

onMounted(() => { fetchReports(); fetchStats() })

async function fetchReports() {
  loading.value = true
  try {
    const res = await api(`/admin/reports?user_id=${userStore.user.id}`)
    reports.value = res.ok ? await res.json() : []
  } catch (e) { toast(e.message, 'error') }
  finally { loading.value = false }
}

async function fetchStats() {
  try {
    const res = await api(`/admin/stats?user_id=${userStore.user.id}`)
    stats.value = res.ok ? await res.json() : {}
  } catch {}
}

async function handleReport(reportId, status) {
  try {
    await api(`/admin/reports/${reportId}/status?user_id=${userStore.user.id}&status=${status}`, { method: 'PUT' })
    toast(status === 'approved' ? '已通过' : '已驳回', 'success')
    fetchReports()
  } catch (e) { toast(e.message, 'error') }
}

async function deletePost(postId) {
  if (!confirm('确定删除该帖子？')) return
  try {
    await api(`/posts/${postId}?user_id=${userStore.user.id}`, { method: 'DELETE' })
    toast('帖子已删除', 'success')
    fetchReports()
  } catch (e) { toast(e.message, 'error') }
}
</script>

<template>
  <div class="admin-page">
    <h2 class="page-title">管理后台</h2>

    <!-- Stats -->
    <div class="stats-row">
      <div class="glass-card stat-card">
        <span class="stat-num">{{ stats.total_users || 0 }}</span>
        <span class="stat-label">用户</span>
      </div>
      <div class="glass-card stat-card">
        <span class="stat-num">{{ stats.total_posts || 0 }}</span>
        <span class="stat-label">帖子</span>
      </div>
      <div class="glass-card stat-card">
        <span class="stat-num">{{ stats.total_comments || 0 }}</span>
        <span class="stat-label">评论</span>
      </div>
      <div class="glass-card stat-card">
        <span class="stat-num highlight">{{ stats.pending_reports || 0 }}</span>
        <span class="stat-label">待处理举报</span>
      </div>
    </div>

    <!-- Reports -->
    <div class="glass-card">
      <h3>举报列表</h3>
      <div v-if="loading" class="state-box"><div class="spinner" />加载中...</div>
      <div v-else-if="reports.length === 0" class="state-box empty"><p>✅ 暂无待处理举报</p></div>
      <div v-for="r in reports" :key="r.id" class="report-item">
        <div class="report-info">
          <span class="report-badge" :class="r.status">{{ r.status === 'pending' ? '待处理' : r.status === 'approved' ? '已通过' : '已驳回' }}</span>
          <span>举报人: {{ r.reporter_nickname || r.reporter_uid }}</span>
          <span>类型: {{ r.target_type }}</span>
          <span>理由: {{ r.reason }}</span>
        </div>
        <div v-if="r.status === 'pending'" class="report-actions">
          <button class="glass-btn" @click="handleReport(r.id, 'approved')">✓ 通过</button>
          <button class="glass-btn danger" @click="handleReport(r.id, 'rejected')">✕ 驳回</button>
          <button class="glass-btn danger" @click="deletePost(r.target_id)">🗑️ 删帖</button>
        </div>
      </div>
    </div>
  </div>
</template>
