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

const showOAuthModal = ref(false)
const oauthLoading = ref(false)

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

// Открыть модальное окно с пояснением
const openOAuthModal = () => {
  showOAuthModal.value = true
}

// Закрыть модальное окно
const closeOAuthModal = () => {
  showOAuthModal.value = false
}

// Запустить вход через Google из модального окна
const handleOAuthFromModal = async () => {
  oauthLoading.value = true
  try {
    await signInWithOAuth('google')
  } catch (err: any) {
    oauthLoading.value = false
    error.value = err.message || 'Ошибка входа через провайдера'
  }
}

const handleSubmit = async (e: Event) => {
  e.preventDefault()
  error.value = ''
  loading.value = true

  try {
    if (mode.value === 'login') {
      await authStore.signInWithPassword(email.value, password.value)
    } else {
      await authStore.signUp(email.value, password.value)
    }
    router.push('/app')
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

      <div class="oauth-buttons">
        <p>Или войдите через:</p>
        <button type="button" class="oauth-btn" @click="openOAuthModal">
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

  <!-- Модальное окно для Google OAuth -->
  <div v-if="showOAuthModal" class="modal-overlay" @click.self="closeOAuthModal">
    <div class="modal">
      <div class="modal-header">
        <h2>Вход через Google</h2>
        <button class="modal-close" @click="closeOAuthModal">&times;</button>
      </div>
      <div class="modal-body">
        <p>
          При входе через Google может возникнуть ошибка
          <strong>404</strong> из-за особенностей развёртки приложения
          на GitHub Pages.
        </p>
        <p>
          Если после нажатия кнопки вы видите ошибку 404, выполните следующие действия:
        </p>
        <ol class="modal-steps">
          <li>В адресной строке браузера добавьте <strong>/NNTime/</strong> в конец URL</li>
          <li>Перезагрузите страницу</li>
          <li>Повторите вход через Google</li>
        </ol>
        <div class="modal-images">
          <img
            src="https://s6.iimage.su/s/06/g7kSE16xz1vjE1Rua0HyzzVLmgJ1Hl9MrfSw6j40p.png"
            alt="До"
            class="modal-screenshot"
          />
          <img
            src="https://s6.iimage.su/s/06/gkyIAsUx24v8WtpeL0rhddyR33D3mOqXgKyBH27yR.png"
            alt="После"
            class="modal-screenshot"
          />
        </div>
        <button class="modal-oauth-btn" @click="handleOAuthFromModal" :disabled="oauthLoading">
          {{ oauthLoading ? 'Загрузка...' : 'Войти через Google' }}
        </button>
        <p v-if="oauthLoading" class="spinner">Загружаем...</p>
      </div>
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

/* Модальное окно для Google OAuth */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #ffffff;
  border-radius: 12px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  color: #111827;
}

.modal-close {
  background: none;
  border: none;
  font-size: 20px;
  color: #6b7280;
  cursor: pointer;
  padding: 0 4px;
}

.modal-close:hover {
  color: #111827;
}

.modal-body {
  padding: 20px;
}

.modal-body p {
  color: #4b5563;
  font-size: 14px;
  line-height: 1.6;
}

.modal-body strong {
  color: #111827;
}

.modal-steps {
  margin: 12px 0 16px;
  padding-left: 24px;
}

.modal-steps li {
  margin-bottom: 8px;
  color: #374151;
}

.modal-images {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 16px 0;
}

.modal-screenshot {
  width: 100%;
  max-width: 400px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  display: block;
}

.modal-oauth-btn {
  width: 100%;
  padding: 12px;
  background: #4285F4;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.modal-oauth-btn:hover {
  background: #3367D6;
}

.modal-oauth-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

@media (max-width: 600px) {
  .modal {
    width: 100%;
    border-radius: 0;
  }
}
</style>
