import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'home', component: () => import('../views/HomePage.vue') },
  { path: '/login', name: 'login', component: () => import('../views/LoginPage.vue') },
  { path: '/post/:id', name: 'post', component: () => import('../views/PostDetail.vue') },
  { path: '/chat', name: 'chat', component: () => import('../views/ChatPage.vue') },
  { path: '/admin', name: 'admin', component: () => import('../views/AdminPage.vue') },
  { path: '/profile', name: 'profile', component: () => import('../views/ProfilePage.vue') },
]

export default createRouter({ history: createWebHistory(), routes })
