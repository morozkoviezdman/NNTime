<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getWorkLogs, getSettings } from '@/utils/db'
import type { SettingsRow } from '@/utils/db'

const router = useRouter()

const logs = ref<any[]>([])
const loading = ref(true)
const error = ref('')
const settings = ref<SettingsRow | null>(null)
const periodStart = ref<string | null>(null)
const periodEnd = ref<string | null>(null)
const periodError = ref('')
const totalOvertime = ref(0)
const totalRecords = ref(0)
const totalDays = ref(0)

const loadSettings = async () => {
  try {
    const data = await getSettings()
    if (data) {
      settings.value = data
      periodStart.value = data.period_start
      periodEnd.value = data.period_end
    }
  } catch (e: any) {
    periodError.value = e.message || 'Не удалось загрузить настройки'
  }
}

const loadLogs = async () => {
  loading.value = true
  error.value = ''
  try {
    const rows = await getWorkLogs()
    logs.value = rows.map((r: any) => ({
      ...r,
      press_time: new Date(r.press_time),
      overtime_minutes: Number(r.overtime_minutes),
    }))
    const totalMinutes = logs.value.reduce((sum, log) => sum + (log.overtime_minutes ?? 0), 0)
    const days = new Set(logs.value.map(l => l.date)).size
    totalOvertime.value = totalMinutes
    totalRecords.value = logs.value.length
    totalDays.value = days
  } catch (e: any) {
    error.value = e.message || 'Не удалось загрузить данные'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadSettings()
  loadLogs()
})
</script>

<template>
  <main>
    <div class="app-wrapper">
      <!-- Навигация -->
      <nav class="main-nav">
        <button class="nav-btn" @click="router.push('/')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <span>Панель оснастки</span>
        </button>
        <button class="nav-btn" @click="router.push('/report')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>Отчёт</span>
        </button>
        <button class="nav-btn" @click="router.push('/settings')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
          <span>Настройки</span>
        </button>
      </nav>

      <!-- Основной контент -->
      <div class="main-content">
        <router-view />
      </div>
    </div>
  </main>
</template>

<style scoped>
.app-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.main-nav {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: white;
  color: #334155;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-btn:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.nav-btn svg {
  color: #64748b;
}

.main-content {
  flex: 1;
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}
</style>
