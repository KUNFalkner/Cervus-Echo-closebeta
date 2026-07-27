<script setup>
import { ref, provide } from 'vue'

const toasts = ref([])
let id = 0

function addToast(text, type = 'info') {
  const tid = ++id
  toasts.value.push({ id: tid, text, type })
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== tid) }, 3500)
}

provide('toast', addToast)
</script>

<template>
  <div class="toast-container">
    <div v-for="t in toasts" :key="t.id" :class="['toast', `toast-${t.type}`]">
      {{ t.text }}
    </div>
  </div>
</template>
