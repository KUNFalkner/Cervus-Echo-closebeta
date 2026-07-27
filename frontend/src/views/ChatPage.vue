<script setup>
import { ref, onMounted, onUnmounted, inject } from 'vue'
import { useUserStore } from '../stores/user.js'
import { wsUrl } from '../utils/api.js'

const userStore = useUserStore()
const toast = inject('toast', () => {})

const messages = ref([])
const input = ref('')
let ws = null

onMounted(() => {
  ws = new WebSocket(wsUrl('/ws/chat/main'))
  ws.onmessage = (e) => {
    try { messages.value.push(JSON.parse(e.data)) }
    catch { messages.value.push({ user: 'system', text: e.data, time: new Date().toISOString() }) }
  }
  ws.onerror = () => toast('连接失败', 'error')
})

onUnmounted(() => { ws?.close() })

function send() {
  if (!input.value.trim() || !ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ user_id: userStore.user.id, user: userStore.user.nickname, text: input.value }))
  input.value = ''
}
</script>

<template>
  <div class="chat-page">
    <div class="glass-card chat-container">
      <div class="chat-messages">
        <div v-for="(m, i) in messages" :key="i" class="chat-msg">
          <span class="chat-user">{{ m.user || '系统' }}:</span>
          <span class="chat-text">{{ m.text }}</span>
        </div>
        <div v-if="messages.length === 0" class="state-box empty">
          <p>💬 欢迎来到聊天室！</p>
        </div>
      </div>
      <div class="chat-input-row">
        <input v-model="input" class="glass-input" placeholder="输入消息..." @keyup.enter="send" />
        <button class="glass-btn primary" @click="send">发送</button>
      </div>
    </div>
  </div>
</template>
