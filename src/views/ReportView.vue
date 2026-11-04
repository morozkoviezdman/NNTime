<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
<<<<<<< HEAD
import { getWorkLogs, getSettings, updateSettings } from '@/utils/db'
=======
import { supabase } from '@/supabaseClient'
import { getWorkLogs, getPeriodOvertime, getSettings, updateSettings, toLocalDateString } from '@/utils/db'
>>>>>>> origin/main
import type { SettingsRow } from '@/utils/db'

const authStore = useAuthStore()
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

const totalHours = computed(() => Math.floor(totalOvertime.value / 60))
const totalMinLeft = computed(() => totalOvertime.value % 60)

const formatDateDisplay = (dateStr: string | null | undefined) => {
  if (!dateStr) return '—'
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

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

const saveSettings = async () => {
  if (!settings.value) return
  try {
    await updateSettings({
      id: settings.value.id,
      end_of_shift_hour: settings.value.end_of_shift_hour,
<<<<<<< HEAD
      period_start: periodStart.value ?? '0001-01-01',
      period_end: periodEnd.value ?? '9999-12-31',
=======
      period_start: periodStart.value,
      period_end: periodEnd.value,
>>>>>>> origin/main
    })
    periodError.value = ''
  } catch (e: any) {
    periodError.value = e.message || 'Ошибка сохранения'
  }
}

onMounted(async () => {
  await authStore.loadSession()
  if (!authStore.isAuthenticated) {
    router.push('/')
    return
  }
  await loadSettings()
  await loadLogs()
})
</script>

<template>
  <div class="screen report">
    <header class="topbar">
      <h1>Отчётность</h1>
      <button class="link-btn" @click="router.push('/app')">← Назад</button>
    </header>

    <section class="card">
      <div class="settings-block">
        <div class="field">
          <label>Окончание смены</label>
          <input
            v-if="settings"
            v-model.number="settings.end_of_shift_hour"
            type="number"
            min="0"
            max="23"
          />
          <span v-else class="muted">загрузка…</span>
        </div>
        <div class="field">
          <label>Период отчёта</label>
          <div class="row">
            <input
              v-model="periodStart"
              type="date"
              :min="settings?.period_start"
              :max="settings?.period_end"
            />
            <input
              v-model="periodEnd"
              type="date"
              :min="settings?.period_start"
              :max="settings?.period_end"
            />
          </div>
        </div>
        <button class="secondary" @click="saveSettings" :disabled="!settings">
          Сохранить настройки
        </button>
        <p v-if="periodError" class="error">{{ periodError }}</p>
      </div>

      <div class="summary" v-if="settings">
        <div>Период: {{ formatDateDisplay(periodStart) }} → {{ formatDateDisplay(periodEnd) }}</div>
        <div>Норма: {{ settings.end_of_shift_hour }}:00</div>
        <div>Всего записей: {{ totalRecords }}</div>
        <div>Сверхнорма: {{ totalHours }} ч {{ totalMinLeft }} м</div>
        <div>Дней с записями: {{ totalDays }}</div>
      </div>

      <div class="logs-list">
        <div class="log-row" v-for="log in logs" :key="log.id">
          <div class="log-date">{{ formatDateDisplay(log.date) }}</div>
          <div class="log-time">{{ log.press_time?.toLocaleString() }}</div>
          <div class="log-overtime">{{ log.overtime_minutes }} м</div>
          <div class="log-note">{{ log.note ?? '—' }}</div>
        </div>
        <p v-if="!loading && logs.length === 0" class="muted">Нет записей за выбранный период.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.screen.report {
  min-height: 100vh;
  background: #f6f7f9;
}

.topbar {
  display: flex;
  align-items: center;
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

.card {
  max-width: 820px;
  margin: 0 auto;
  padding: 24px 20px 40px;
}

.settings-block {
  background: #ffffff;
  border: 1px solid #e3e6ea;
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 20px;
}

.field {
  margin-bottom: 12px;
}

.field label {
  display: block;
  font-size: 13px;
  color: #4b5563;
  margin-bottom: 6px;
}

.field input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
}

.row {
  display: flex;
  gap: 10px;
}

.row input {
  flex: 1;
}

.secondary {
  margin-top: 12px;
  padding: 8px 14px;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.secondary:hover:not(:disabled) {
  background: #e5e7eb;
}

.secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.muted {
  color: #6b7280;
  font-size: 13px;
}

.summary {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 20px;
}

.summary div {
  font-size: 14px;
  color: #334155;
}

.summary-total {
  margin-top: 6px;
  font-size: 20px;
  font-weight: 700;
  color: #166534;
}

.logs-list {
  background: #ffffff;
  border: 1px solid #e3e6ea;
  border-radius: 10px;
  padding: 12px;
  overflow-x: auto;
}

.log-row {
  display: grid;
  grid-template-columns: 110px 170px 90px 1fr;
  gap: 14px;
  padding: 10px 12px;
  border-bottom: 1px solid #f3f4f6;
  font-size: 13px;
}

.log-row:last-child {
  border-bottom: none;
}

.log-date {
  font-weight: 600;
  white-space: nowrap;
}

.log-time {
  color: #374151;
  white-space: nowrap;
}

.log-overtime {
  color: #b45309;
  font-weight: 600;
  text-align: center;
}

.log-note {
  color: #4b5563;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
