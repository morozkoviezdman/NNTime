<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getSettings, getPeriodOvertime, updateSettings, getWorkLogs } from '@/utils/db'

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

const workLogs = ref<any[]>([])
const toastVisible = ref(false)

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

const formatTime = (dateStr: string) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

const formatDuration = (minutes: number) => {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
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

const loadWorkLogs = async () => {
  try {
    const logs = await getWorkLogs()
    workLogs.value = logs
  } catch (e: any) {
    error.value = e.message || 'Не удалось загрузить логи'
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
    toastVisible.value = true
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

onMounted(async () => {
  await authStore.loadSession()
  if (!authStore.isAuthenticated) {
    router.push('/')
    return
  }
  await loadSettings()
  await loadPeriodOvertime()
  await loadWorkLogs()
})
</script>

<template>
  <div class="screen main">
    <!-- Left sidebar navigation -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="logo">NNTime</span>
      </div>
      <nav class="sidebar-nav">
        <a class="nav-item active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          <span>Главная</span>
        </a>
        <a class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
          <span>Рабочее время</span>
        </a>
        <a class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>Часы</span>
        </a>
        <a class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="13" x2="12" y2="19"/><line x1="12" y1="5" x2="12" y2="9"/></svg>
          <span>Поиск</span>
        </a>
        <a class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          <span>Настройки</span>
        </a>
      </nav>
    </aside>

    <!-- Main content -->
    <main class="main-content">
      <!-- Statistics card -->
      <section class="stats-card">
        <div class="stats-header">
          <span class="stats-label">Отработано времени</span>
          <span class="stats-total">{{ totalHours }}:{{ String(totalMinLeft).padStart(2, '0') }}</span>
        </div>
        <div class="stats-footer">
          <span class="limit">Лимит: —</span>
          <span class="remaining">Осталось 2–8 ч</span>
        </div>
      </section>

      <!-- Period selection -->
      <section class="period-block">
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
      </section>

      <!-- Work logs table -->
      <section class="logs-section">
        <h3 class="logs-title">Рабочие логи</h3>
        <div class="logs-table-wrap">
          <table class="logs-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Время входа</th>
                <th>Время выхода</th>
                <th>Продолжительность</th>
                <th>Овертим</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(log, index) in workLogs" :key="index">
                <td>{{ formatDateDisplay(log.date) }}</td>
                <td>{{ formatTime(log.press_time) }}</td>
                <td>—</td>
                <td>{{ formatDuration(log.overtime_minutes) }}</td>
                <td>{{ formatDuration(log.overtime_minutes) }}</td>
                <td><span class="status-badge saved">✅ Сохранено</span></td>
              </tr>
              <tr v-if="!workLogs.length">
                <td colspan="6">Записей пока нет</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- User block -->
      <section class="user-block">
        <div class="user-avatar">М</div>
        <div class="user-info">
          <span class="user-name">Морозко</span>
          <span class="user-role">Администратор</span>
        </div>
        <div class="user-actions">
          <button class="icon-btn" title="Уведомления">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </button>
          <button class="icon-btn" title="Настройки">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          </button>
          <button class="icon-btn logout" title="Выйти">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
/* ── Layout ─────────────────────────────────────────────── */
.screen.main {
  min-height: 100vh;
  display: flex;
  background: #f0f4ff;
}

/* ── Sidebar ────────────────────────────────────────────── */
.sidebar {
  width: 260px;
  flex-shrink: 0;
  background: #ffffff;
  border-right: 1px solid #e5e8ef;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar-header .logo {
  font-size: 20px;
  font-weight: 700;
  color: #1a1d21;
  letter-spacing: -0.5px;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  color: #555b66;
  text-decoration: none;
  font-size: 15px;
  font-weight: 500;
  transition: background 0.2s, color 0.2s;
}

.nav-item svg {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}

.nav-item:hover {
  background: #f0f4ff;
  color: #1a1d21;
}

.nav-item.active {
  background: #2563eb;
  color: #ffffff;
}

.nav-item.active svg {
  color: #ffffff;
}

/* ── Main content ───────────────────────────────────────── */
.main-content {
  flex: 1;
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow-y: auto;
  max-width: 100%;
}

/* ── Stats card ─────────────────────────────────────────── */
.stats-card {
  background: #ffffff;
  border: 1px solid #e5e8ef;
  border-radius: 14px;
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}

.stats-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
}

.stats-label {
  font-size: 14px;
  font-weight: 500;
  color: #555b66;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stats-total {
  font-size: 48px;
  font-weight: 700;
  color: #1a1d21;
  letter-spacing: -1px;
}

.stats-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  font-size: 14px;
  color: #6b7280;
}

.stats-footer .limit {
  color: #d1d5db;
}

.stats-footer .remaining {
  color: #2563eb;
  font-weight: 600;
}

/* ── Work logs table ────────────────────────────────────── */
.logs-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.logs-title {
  font-size: 18px;
  font-weight: 700;
  color: #1a1d21;
}

.logs-table-wrap {
  overflow-x: auto;
}

.logs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.logs-table th {
  text-align: left;
  padding: 12px 14px;
  font-size: 12px;
  font-weight: 600;
  color: #555b66;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: #f8fafc;
  border-bottom: 1px solid #e5e8ef;
}

.logs-table td {
  padding: 14px;
  border-bottom: 1px solid #eef1f5;
  color: #1a1d21;
  vertical-align: middle;
}

.logs-table tbody tr:hover {
  background: #f8fafc;
}

/* ── Status badge ───────────────────────────────────────── */
.status-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge.saved {
  background: #dcfce7;
  color: #166534;
}

.status-badge.draft {
  background: #fef3c7;
  color: #b45309;
}

/* ── User block ─────────────────────────────────────────── */
.user-block {
  display: flex;
  align-items: center;
  gap: 16px;
  background: #ffffff;
  border: 1px solid #e5e8ef;
  border-radius: 14px;
  padding: 16px 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}

.user-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #2563eb;
  color: #ffffff;
  font-size: 22px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-info {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: 16px;
  font-weight: 700;
  color: #1a1d21;
  display: block;
}

.user-role {
  font-size: 13px;
  color: #6b7280;
}

.user-actions {
  display: flex;
  gap: 8px;
}

.icon-btn {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid #e5e8ef;
  background: #ffffff;
  color: #555b66;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.icon-btn svg {
  width: 20px;
  height: 20px;
}

.icon-btn:hover {
  background: #f0f4ff;
  border-color: #a5b4fc;
  color: #2563eb;
}

.icon-btn.logout:hover {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #b91c1c;
}
</style>
