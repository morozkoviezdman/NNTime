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

// Глобальный guard: загружаем сессию, затем проверяем авторизацию
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()

  // 1. Если сессии ещё нет — загружаем
  if (!authStore.session) {
    await authStore.loadSession()
  }

  // 2. Если переходим на /app и пользователь не авторизован — редирект на /login
  if (to.name === 'app' && !authStore.isAuthenticated) {
    next({ name: 'login' })
    return
  }

  next()
})
