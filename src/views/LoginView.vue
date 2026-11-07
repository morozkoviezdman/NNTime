<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const router = useRouter()

const email = ref('')
const password = ref('')
const mode = ref<'login' | 'signup'>('login')
const loading = ref(false)
const error = ref('')
const notice = ref('')

const switchMode = () => {
  mode.value = mode.value === 'login' ? 'signup' : 'login'
  error.value = ''
}

const signInWithOAuth = async (provider: 'google') => {
  try {
    await authStore.signInWithOAuth(provider)
  } catch (err: any) {
    error.value = err.message || 'Ошибка входа через провайдера'
  }
}

const handleSubmit = async (e: Event) => {
  e.preventDefault()
  error.value = ''
  notice.value = ''
  loading.value = true

  try {
    if (mode.value === 'login') {
      await authStore.signInWithPassword(email.value, password.value)
      router.push('/app')
    } else {
      // ссылка в письме подтверждения должна вести на /NNTime/, а не на корень
      const base = import.meta.env.BASE_URL || '/'
      const res = await authStore.signUp(email.value, password.value, {
        emailRedirectTo: `${window.location.origin}${base}`,
      })
      if (!res.session) {
        notice.value = `Аккаунт создан. Мы отправили письмо на ${email.value} — подтвердите адрес, затем войдите.`
        mode.value = 'login'
        password.value = ''
      } else {
        router.push('/app')
      }
    }
  } catch (err: any) {
    error.value = err.message || 'Ошибка авторизации'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await authStore.loadSession()
  if (authStore.isAuthenticated) {
    router.push('/app')
  }
})
</script>

<template>
  <div class="screen auth">
    <div class="card">
      <div class="brand">
        <span class="brand-name">NNTime</span>
        <span class="brand-sub">учёт сверхнормативного времени</span>
      </div>
      <h1 class="title">
        {{ mode === 'login' ? 'Войти' : 'Создать аккаунт' }}
      </h1>

      <form @submit.prevent="handleSubmit" class="form">
        <input
          v-model="email"
          type="email"
          placeholder="Электронный адрес"
          autocomplete="email"
          required
        />
        <input
          v-model="password"
          :type="mode === 'login' ? 'password' : 'password'"
          placeholder="Пароль"
          autocomplete="current-password"
          required
          minlength="6"
        />
        <button type="submit" :disabled="loading">
          {{ mode === 'login' ? 'Войти' : 'Зарегистрироваться' }}
        </button>
        <p v-if="loading" class="spinner">Сохраняем...</p>
      </form>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="notice" class="notice">{{ notice }}</p>

      <div class="oauth-buttons">
        <p>Или войдите через:</p>
        <button type="button" class="oauth-btn" @click="signInWithOAuth('google')">
          <span class="oauth-icon">🔍</span> Google
        </button>
      </div>

      <p class="switch">
        {{ mode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?' }}
        <button class="link" @click="switchMode">
          {{ mode === 'login' ? 'Зарегистрироваться' : 'Войти' }}
        </button>
      </p>
    </div>
  </div>

</template>

<style scoped>
.screen.auth {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f6f7f9;
}

.card {
  width: 100%;
  max-width: 400px;
  padding: 28px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
}

.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  margin-bottom: 18px;
}

.brand-name {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: #2563eb;
}

.brand-sub {
  font-size: 12px;
  color: #8b93a1;
  letter-spacing: 0.2px;
}

.title {
  margin: 0 0 20px;
  font-size: 20px;
  color: #111827;
  text-align: center;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
}

.form input:focus {
  outline: 2px solid #2563eb;
  border-color: #2563eb;
}

.form button {
  width: 100%;
  padding: 12px;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.form button:disabled {
  opacity: 0.7;
  cursor: wait;
}

.spinner {
  text-align: center;
  color: #4b5563;
  font-size: 13px;
}

.error {
  margin: 12px 0 0;
  color: #b91c1c;
  font-size: 13px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 8px 10px;
}

.notice {
  margin: 12px 0 0;
  color: #1e40af;
  font-size: 13px;
  line-height: 1.5;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 8px 10px;
}

.oauth-buttons {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 12px;
}
.oauth-buttons p {
  color: #4b5563;
  font-size: 13px;
  margin: 0 0 8px;
}
.oauth-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #ffffff;
  color: #374151;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}
.oauth-btn:hover {
  background: #f9fafb;
  border-color: #9ca3af;
}
.oauth-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
.oauth-icon {
  font-size: 18px;
}

.switch {
  text-align: center;
  margin-top: 16px;
  color: #4b5563;
  font-size: 14px;
}

.switch .link {
  color: #2563eb;
  font-weight: 600;
  border-bottom: 1px dotted #2563eb;
  cursor: pointer;
}

.switch .link:hover {
  color: #1d4ed8;
}

</style>
