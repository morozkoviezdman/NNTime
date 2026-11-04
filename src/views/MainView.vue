<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getSettings, getPeriodOvertime, recordWorkSession, updateSettings } from '@/utils/db'

const authStore = useAuthStore()
const router = useRouter()

const loading = ref(false)
const error = ref('')
const toast = ref('')

const settings = ref<any>(null)
const normHours = ref(18)
const periodStart = ref<string>('')
const periodEnd = ref<string>('')

const totalMinutes = ref(0)
const totalHours = ref(0)
const totalMinLeft = ref(0)
const totalDays = ref(0)

const toastVisible = ref(false)
let toastTimer: number | null = null

const formatDateForInput = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return '—'
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

const loadSettings = async () => {
  try {
    const data = await getSettings()
    const today = new Date()
    if (data) {
      settings.value = data
      normHours.value = data.end_of_shift_hour ?? 18
      const startDefault = new Date(today)
      startDefault.setDate(today.getDate() - 365)
      const endDefault = new Date()
      periodStart.value = data.period_start ?? formatDateForInput(startDefault)
      periodEnd.value = data.period_end ?? formatDateForInput(endDefault)
    } else {
      const startDefault = new Date(today)
      startDefault.setDate(today.getDate() - 365)
      const endDefault = new Date()
      settings.value = {
        id: crypto.randomUUID(),
        end_of_shift_hour: normHours.value,
        period_start: formatDateForInput(startDefault),
        period_end: formatDateForInput(endDefault),
        updated_at: new Date().toISOString(),
      }
      await updateSettings(settings.value)
    }
  } catch (e: any) {
    error.value = e.message || 'Не удалось загрузить настройки'
  }
}

const loadPeriodOvertime = async () => {
  if (!periodStart.value || !periodEnd.value) return
  try {
    const res = await getPeriodOvertime(periodStart.value, periodEnd.value)
    totalMinutes.value = res.totalMinutes
    totalHours.value = res.totalHours
    totalMinLeft.value = res.totalMinLeft
    totalDays.value = res.totalDays
  } catch (e: any) {
    error.value = e.message || 'Не удалось загрузить данные'
  }
}

const saveSettings = async () => {
  try {
    loading.value = true
    const { id } = settings.value as any
    await updateSettings({
      id: id || crypto.randomUUID(),
      end_of_shift_hour: normHours.value,
      period_start: periodStart.value,
      period_end: periodEnd.value,
    })
    await loadPeriodOvertime()
    toast.value = 'Настройки сохранены'
    setTimeout(() => {
      toast.value = ''
      toastVisible.value = false
    }, 2500)
  } catch (e: any) {
    error.value = e.message || 'Ошибка сохранения'
  } finally {
    loading.value = false
  }
}

const handleRecord = async () => {
  error.value = ''
  let addedMinutes = 0
  try {
    addedMinutes = await recordWorkSession(normHours.value)
    const msg = addedMinutes >= 60 ? `Добавлено ${Math.floor(addedMinutes / 60)} ч ${addedMinutes % 60} м` : `Добавлено ${addedMinutes} м`
    toast.value = msg
    toastVisible.value = true
    if (periodStart.value && periodEnd.value) {
      await loadPeriodOvertime()
    }
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toastVisible.value = false
    }, 3000)
  } catch (e: any) {
    error.value = e.message || 'Ошибка записи'
  }
}

onMounted(async () => {
  await authStore.loadSession()
  if (!authStore.isAuthenticated) {
    router.push('/')
    return
  }
  await loadSettings()
  await loadPeriodOvertime()
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

      <!-- Period selection -->
      <div class="period-block">
        <div class="period-labels">
          <span>с</span>
          <span>по</span>
        </div>
        <div class="period-inputs">
          <input type="date" v-model="periodStart" />
          <input type="date" v-model="periodEnd" />
        </div>
        <div class="period-actions">
          <button class="secondary" @click="saveSettings" :disabled="loading">
            Сохранить настройки
          </button>
        </div>
      </div>

      <!-- Overtime summary -->
      <div class="summary">
        <div class="summary-row">
          <span>Период</span>
          <span>{{ formatDateDisplay(periodStart) }} → {{ formatDateDisplay(periodEnd) }}</span>
        </div>
        <div class="summary-row">
          <span>Сверхнорма</span>
          <span>{{ totalHours }} ч {{ totalMinLeft }} м</span>
        </div>
        <div class="summary-row">
          <span>Дней с записями</span>
          <span>{{ totalDays }}</span>
        </div>
      </div>

      <!-- Norm hours -->
      <div class="norm-block">
        <label for="normHour">Нормативное время окончания работы</label>
        <div class="norm-row">
          <input id="normHour" type="number" min="0" max="23" v-model.number="normHours" />
          <span>:00</span>
        </div>
        <button class="secondary" @click="saveSettings" :disabled="loading">
          Сохранить
        </button>
      </div>

      <!-- Fixed button (circular 96x96) -->
      <button class="round-btn" @click="handleRecord" :disabled="loading">
        <span v-if="!loading">+ Зафиксировать</span>
        <span v-else>сохраняю...</span>
      </button>

      <p class="hint">Нажатие — конец смены. Время сохраняется автоматически в БД.</p>

      <!-- Toast message -->
      <p v-if="toast" class="toast">{{ toast }}</p>

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

.screen.main .topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: #ffffff;
  border-bottom: 1px solid #e3e6ea;
}

.screen.main .topbar h1 {
  margin: 0;
  font-size: 18px;
  color: #1a1d21;
}

.topbar .link-btn {
  background: none;
  border: none;
  color: #2563eb;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.topbar .link-btn:hover {
  background: #f0f4ff;
}

.record-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 20px;
  max-width: 640px;
  margin: 0 auto;
  text-align: center;
}

.meta {
  color: #555b66;
  font-size: 13px;
}

/* Period block */
.period-block {
  width: 100%;
  background: #ffffff;
  border: 1px solid #e3e6ea;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 20px;
}

.period-labels {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #4b5563;
  margin-bottom: 6px;
}

.period-inputs {
  display: flex;
  gap: 10px;
}

.period-inputs input {
  flex: 1;
}

.period-actions {
  margin-top: 6px;
  display: flex;
  justify-content: flex-end;
}

/* Summary block */
.summary {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 20px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
  color: #334155;
}

/* Norm block */
.norm-block {
  width: 100%;
  background: #ffffff;
  border: 1px solid #e3e6ea;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 20px;
}

.norm-block label {
  display: block;
  font-size: 12px;
  color: #4b5563;
  margin-bottom: 6px;
}

.norm-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.norm-row input {
  width: 40px;
  padding: 4px 6px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  text-align: center;
}

.norm-block .secondary {
  margin-top: 8px;
  padding: 6px 12px;
  font-size: 12px;
}

/* Circular fix button */
.round-btn {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: #2563eb;
  color: #ffffff;
  border: none;
  cursor: pointer;
  font-size: 20px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.35);
}

.round-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 10px 26px rgba(37, 99, 235, 0.45);
}

.round-btn:active:not(:disabled) {
  transform: scale(0.96);
}

.round-btn:disabled {
  opacity: 0.7;
  cursor: wait;
}

.hint {
  margin-top: 12px;
  color: #6b7280;
  font-size: 13px;
}

.toast {
  margin-top: 12px;
  color: #15803d;
  font-size: 14px;
  font-weight: 500;
}

.error {
  margin-top: 12px;
  color: #b91c1c;
  font-size: 13px;
}
</style>
