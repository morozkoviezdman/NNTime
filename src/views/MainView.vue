<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { recordWorkSession } from '@/utils/db'

const authStore = useAuthStore()
const router = useRouter()

const loading = ref(false)
const error = ref('')

const normHours = import.meta.env.VITE_NORM_HOURS ?? 18

const handleRecord = async () => {
  error.value = ''
  loading.value = true
  try {
    await recordWorkSession()
    router.push('/report')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await authStore.loadSession()
  if (!authStore.isAuthenticated) {
    router.push('/')
  }
})
</script>

<template>
  <div class="screen main">
    <header class="topbar">
      <h1>Активность</h1>
      <button class="link-btn" @click="router.push('/report')">Отчёт</button>
    </header>

    <section class="record-card">
      <p class="meta">
        {{ authStore.user?.email ?? 'Пользователь' }}
        <span class="dot">·</span>
        <span v-if="authStore.user">{{ authStore.user.id.slice(0, 8) }}</span>
      </p>

      <p class="norm-line">
        Окончание нормы:
        <strong :data-mins="normHours * 60">{{ normHours }}:00</strong>
      </p>

      <h2>Зафиксировать работу</h2>

      <button class="big-btn" @click="handleRecord" :disabled="loading">
        <span v-if="!loading">+ Зафиксировать</span>
        <span v-else>сохраняю...</span>
      </button>

      <p class="hint">Нажатие — конец смены. Время сохраняется автоматически в БД.</p>

      <p v-if="error" class="error">{{ error }}</p>
    </section>
  </div>
</template>

<style scoped>
.screen.main {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f6f7f9;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: #ffffff;
  border-bottom: 1px solid #e3e6ea;
}

.topbar h1 {
  margin: 0;
  font-size: 18px;
  color: #1a1d21;
}

.link-btn {
  background: none;
  border: none;
  color: #2563eb;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 8px;
}

.link-btn:hover {
  text-decoration: underline;
}

.record-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  max-width: 560px;
  margin: 0 auto;
  text-align: center;
}

.meta {
  color: #555b66;
  font-size: 13px;
}

.norm-line {
  margin-top: 4px;
  color: #4b5563;
  font-size: 13px;
}

.norm-line strong {
  color: #111827;
  font-variant-numeric: tabular-nums;
}

.record-card h2 {
  font-size: 22px;
  color: #111827;
  margin: 24px 0 16px;
}

.big-btn {
  font-size: 20px;
  font-weight: 700;
  color: #ffffff;
  background: #2563eb;
  border: none;
  border-radius: 999px;
  padding: 18px 48px;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.35);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}

.big-btn:hover:not(:disabled) {
  transform: scale(1.04);
  box-shadow: 0 10px 26px rgba(37, 99, 235, 0.45);
}

.big-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.big-btn:disabled {
  opacity: 0.7;
  cursor: wait;
}

.hint {
  margin-top: 12px;
  color: #6b7280;
  font-size: 13px;
}

.error {
  margin-top: 12px;
  color: #b91c1c;
  font-size: 13px;
}
</style>
