import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import LoginView from '@/views/LoginView.vue'
import MainView from '@/views/MainView.vue'
import ReportView from '@/views/ReportView.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'login',
    component: LoginView,
  },
  {
    path: '/app',
    name: 'app',
    component: MainView,
  },
  {
    path: '/report',
    name: 'report',
    component: ReportView,
  },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// Переход на /app только если пользователь авторизован
router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore()
  if (to.name === 'app' && !authStore.isAuthenticated) {
    next({ name: 'login' })
  } else {
    next()
  }
})

// Хук, который подгружает сессию при старте
router.beforeEach(async (_to, _from, next) => {
  const authStore = useAuthStore()
  if (!authStore.session) {
    await authStore.loadSession()
  }
  next()
})
