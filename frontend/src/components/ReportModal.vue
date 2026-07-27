<script setup>
import { ref } from 'vue'
import { api } from '../utils/api.js'

const props = defineProps({ targetType: String, targetId: Number, userId: Number })
const emit = defineEmits(['close', 'done'])
const reason = ref('')
const loading = ref(false)

async function submit() {
  if (!reason.value.trim()) return
  loading.value = true
  try {
    await api('/reports/', { method: 'POST', body: { reporter_id: props.userId, target_type: props.targetType, target_id: props.targetId, reason: reason.value } })
    emit('done')
  } finally { loading.value = false }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal glass-card">
      <h3>举报{{ targetType === 'post' ? '帖子' : '评论' }}</h3>
      <textarea v-model="reason" class="glass-input" placeholder="请描述举报理由..." rows="3" />
      <div class="modal-actions">
        <button class="glass-btn" @click="emit('close')">取消</button>
        <button class="glass-btn primary" :disabled="loading || !reason.trim()" @click="submit">
          {{ loading ? '提交中...' : '提交举报' }}
        </button>
      </div>
    </div>
  </div>
</template>
