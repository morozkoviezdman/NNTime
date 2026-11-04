import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { router } from '@/router'
import App from './App.vue'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// инициализируем стор авторизации после установки Pinia
const authStore = useAuthStore()

// загружаем сессию сразу после инициализации
authStore.loadSession().then(() => {
  console.log('[main] Session loaded:', authStore.session?.user?.id ? 'AUTHORIZED' : 'ANONYMOUS')
})

app.mount('#app')
