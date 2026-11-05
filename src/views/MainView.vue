<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getSettings, getPeriodOvertime, updateSettings, getWorkLogs, deleteWorkLog, updateNote, recordWorkSession } from '@/utils/db'

const authStore = useAuthStore()
const router = useRouter()

const loading = ref(false)
const error = ref('')
const toast = ref('')
const toastVisible = ref(false)
const toastTimer = ref<number | null>(null)

const settings = ref<any>(null)
const overtimeHours = ref(18)
const overtimeMinutes = ref(0)
const today = new Date()
const startDefault = new Date(today)
startDefault.setDate(today.getDate() - 365)
const endDefault = new Date()
const formatDateForInput = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const periodStart = ref<string>(formatDateForInput(startDefault))
const periodEnd = ref<string>(formatDateForInput(endDefault))

const totalMinutes = ref(0)
const totalHours = ref(0)
const totalMinLeft = ref(0)
const totalDays = ref(0)

const workLogs = ref<any[]>([])
const currentNote = ref('')
const editingId = ref<string | null>(null)
const reportOpen = ref(false)

const recordButtonText = ref('Зафиксировать')
const recordingTimeout = ref<number | null>(null)
const saveButtonText = ref('Сохранить')
const saveButtonGreen = ref(false)

const showToast = (msg: string) => {
  toast.value = msg
  toastVisible.value = true
  if (toastTimer.value) clearTimeout(toastTimer.value)
  toastTimer.value = setTimeout(() => {
    toast.value = ''
    toastVisible.value = false
  }, 2500)
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
      overtimeHours.value = data.end_of_shift_hour ?? 18
      overtimeMinutes.value = data.end_of_shift_minute ?? 0
      const startDefault2 = new Date(today)
      startDefault2.setDate(today.getDate() - 365)
      const endDefault2 = new Date()
      const startVal = data.period_start && data.period_start.trim() ? data.period_start : formatDateForInput(startDefault2)
      const endVal = data.period_end && data.period_end.trim() ? data.period_end : formatDateForInput(endDefault2)
      periodStart.value = startVal
      periodEnd.value = endVal
    } else {
      const startDefault2 = new Date(today)
      startDefault2.setDate(today.getDate() - 365)
      const endDefault2 = new Date()
      settings.value = {
        id: crypto.randomUUID(),
        end_of_shift_hour: overtimeHours.value,
        end_of_shift_minute: overtimeMinutes.value,
        period_start: formatDateForInput(startDefault2),
        period_end: formatDateForInput(endDefault2),
        updated_at: new Date().toISOString(),
      }
      periodStart.value = formatDateForInput(startDefault2)
      periodEnd.value = formatDateForInput(endDefault2)
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
      end_of_shift_hour: overtimeHours.value,
      end_of_shift_minute: overtimeMinutes.value,
      period_start: periodStart.value,
      period_end: periodEnd.value,
    })
    await loadPeriodOvertime()
    showToast('Настройки сохранены')
    saveButtonText.value = 'Обновлено'
    saveButtonGreen.value = true
    setTimeout(() => {
      saveButtonText.value = 'Сохранить'
      saveButtonGreen.value = false
    }, 3000)
  } catch (e: any) {
    error.value = e.message || 'Ошибка сохранения'
  } finally {
    loading.value = false
  }
}

const emitRecord = async () => {
  error.value = ''
  let addedMinutes = 0
  try {
    loading.value = true
    recordButtonText.value = 'Обновлено'
    addedMinutes = await recordWorkSession(overtimeHours.value, overtimeMinutes.value)
    const msg = addedMinutes >= 60 ? `Добавлено ${Math.floor(addedMinutes / 60)} ч ${addedMinutes % 60} м` : `Добавлено ${addedMinutes} м`
    showToast(msg)
    if (periodStart.value && periodEnd.value) {
      await loadPeriodOvertime()
      await loadWorkLogs()
    }
    if (recordingTimeout.value) clearTimeout(recordingTimeout.value)
    recordingTimeout.value = window.setTimeout(() => {
      recordButtonText.value = 'Зафиксировать'
    }, 3000)
  } catch (e: any) {
    error.value = e.message || 'Ошибка записи'
  } finally {
    loading.value = false
  }
}

const openReport = async () => {
  if (!periodStart.value || !periodEnd.value) {
    showToast('Сначала выберите период')
    return
  }
  await loadWorkLogs()
  reportOpen.value = true
}

const closeReport = () => {
  reportOpen.value = false
  editingId.value = null
  currentNote.value = ''
  showToast('Окно закрыто')
}

const startEdit = (log: any) => {
  editingId.value = log.id
  currentNote.value = log.note ?? ''
}

const saveEdit = async () => {
  if (!editingId.value) return
  try {
    await updateNote(editingId.value, currentNote.value)
    await loadWorkLogs()
    editingId.value = null
    currentNote.value = ''
    showToast('Комментарий сохранён')
  } catch (e: any) {
    error.value = e.message || 'Ошибка сохранения'
  }
}

const deleteLog = async (log: any) => {
  try {
    await deleteWorkLog(log.id)
    await loadWorkLogs()
    showToast('Запись удалена')
  } catch (e: any) {
    error.value = e.message || 'Ошибка удаления'
  }
}

const printReport = () => {
  window.print()
  showToast('Печать запущена')
}

const logout = async () => {
  try {
    await authStore.signOut()
    router.push('/')
    showToast('Вы вышли из аккаунта')
  } catch (e) {
    showToast('Ошибка выхода')
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
    <section class="user-block">
      <div class="user-avatar">{{ (authStore.user?.email ?? 'Пользователь').charAt(0) }}</div>
      <div class="user-info">
        <span class="user-name">{{ authStore.user?.email ?? 'Пользователь' }}</span>
        <span class="user-role">Администратор</span>
      </div>
      <button class="logout-btn" @click="logout" title="Нажмите чтобы выйти с данного аккаунта">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y1="12"/></svg>
      </button>
    </section>

    <section class="overtime-block">
      <div class="overtime-title">Сверхнормативно отработано за период всего (чч:мм)</div>
      <div class="overtime-value">{{ totalHours }}:{{ String(totalMinLeft).padStart(2, '0') }}</div>

      <div class="period-row">
        <span class="period-label">Период</span>
        <div class="period-inputs">
          <input type="date" v-model="periodStart" />
          <span class="period-sep">—</span>
          <input type="date" v-model="periodEnd" />
        </div>
      </div>

      <div class="time-row">
        <span class="time-label">Время после которого начинается переработка</span>
        <div class="time-inputs">
          <input type="number" v-model.number="overtimeHours" min="0" max="23" placeholder="Часы" />
          <span class="time-colon">:</span>
          <input type="number" v-model.number="overtimeMinutes" min="0" max="59" placeholder="Минуты" />
        </div>
        <button class="save-btn" @click="saveSettings" :disabled="loading" :class="{ 'save-btn-green': saveButtonGreen }">{{ saveButtonText }}</button>
      </div>
    </section>

    <div class="record-center">
      <button class="main-record-btn" @click="emitRecord" :disabled="loading" :class="['main-record-btn-default', { 'main-record-btn-green': recordButtonText === 'Обновлено' }]">
        <span v-if="!loading">{{ recordButtonText }}</span>
        <span v-else>сохраняю...</span>
      </button>
    </div>

    <section class="results-block">
      <button class="report-btn" @click="openReport">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span>Вывести отчёт за выбранный период</span>
      </button>
    </section>

    <div v-if="reportOpen" class="report-modal" @click.self="closeReport">
      <div class="report-modal-content">
        <div class="report-modal-header">
          <h3>Отчёт за выбранный период</h3>
          <button class="close-btn" @click="closeReport">✕</button>
        </div>

        <div class="report-table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Время выхода</th>
                <th>Сверхнорма</th>
                <th>Комментарий</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(log, index) in workLogs" :key="index">
                <td>{{ formatDateDisplay(log.date) }}</td>
                <td>{{ formatTime(log.press_time) }}</td>
                <td>{{ formatDuration(log.overtime_minutes) }}</td>
                <td class="comment-cell">
                  <template v-if="editingId === log.id">
                    <input v-model="currentNote" class="note-input" />
                    <button class="save-edit-btn" @click="saveEdit">Сохранить</button>
                  </template>
                  <template v-else>
                    <span class="note-text">{{ log.note ?? '—' }}</span>
                    <button class="edit-btn" @click="startEdit(log)">Редактировать</button>
                </td>
                <td>
                  <button class="print-btn" @click="printReport">Печать</button>
                  <button class="close-btn" @click="deleteLog(log)">✕</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="report-footer">
          <button class="print-action-btn" @click="printReport">Печать</button>
          <button class="close-action-btn" @click="closeReport">✕ Закрыть окно</button>
        </div>
      </div>
    </div>
  </div>

<style scoped>
.screen.main {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f0f4ff;
  padding: 24px 32px 40px;
  gap: 20px;
  max-width: 640px;
  margin: 0 auto;
}

.user-block {
  display: flex;
  align-items: center;
  gap: 16px;
  background: #ffffff;
  border: 1px solid #e5e8ef;
  border-radius: 14px;
  padding: 16px 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  text-align: center;
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
  text-align: center;
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

.logout-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: #f3f4f6;
  color: #6b7280;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.logout-btn:hover {
  background: #e5e7eb;
  color: #1a1d21;
}

.overtime-block {
  background: #ffffff;
  border: 1px solid #e5e8ef;
  border-radius: 14px;
  padding: 20px 24px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  text-align: center;
}

.overtime-title {
  font-size: 16px;
  font-weight: 600;
  color: #555b66;
  margin-bottom: 4px;
  text-align: center;
}

.overtime-value {
  font-size: 32px;
  font-weight: 700;
  color: #2563eb;
  margin-bottom: 16px;
  text-align: center;
}

.period-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.period-label {
  font-size: 14px;
  font-weight: 600;
  color: #555b66;
  min-width: 80px;
}

.period-inputs {
  flex: 1;
  display: flex;
  gap: 12px;
}

.period-inputs input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  font-size: 14px;
  background: #f8fafc;
  transition: border-color 0.2s;
}

.period-inputs input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.period-sep {
  color: #9ca3af;
  font-weight: 700;
}

.time-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.time-label {
  font-size: 14px;
  font-weight: 600;
  color: #555b66;
  min-width: 220px;
}

.time-inputs {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.time-inputs input {
  width: 80px;
  padding: 10px 14px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  font-size: 14px;
  text-align: center;
  background: #f8fafc;
  transition: border-color 0.2s;
}

.time-inputs input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.time-colon {
  color: #9ca3af;
  font-weight: 700;
}

.save-btn {
  padding: 10px 20px;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.save-btn:hover {
  background: #1d4ed8;
}

.save-btn-green {
  background: #16a34a !important;
  box-shadow: 0 4px 12px rgba(22, 163, 74, 0.3);
}

.save-btn-green:hover {
  background: #15803d !important;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.record-center {
  display: flex;
  justify-content: center;
}

.main-record-btn-default {
  width: 400px;
  height: 400px;
  border-radius: 200px;
  background: #2563eb;
  color: #ffffff;
  border: none;
  cursor: pointer;
  font-size: 32px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.3s;
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.35);
}

.main-record-btn-green {
  background: #16a34a !important;
  box-shadow: 0 8px 24px rgba(22, 163, 74, 0.35);
}

.main-record-btn-green:hover {
  background: #15803d !important;
}

.results-block {
  margin-top: 24px;
  text-align: center;
}

.report-btn {
  margin: 0 auto;
  display: block;
  max-width: 400px;
  margin-left: auto;
  margin-right: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  background: #ffffff;
  border: 2px solid #e5e8ef;
  border-radius: 14px;
  color: #1a1d21;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, transform 0.12s;
}

.report-btn:hover {
  background: #f8fafc;
  border-color: #2563eb;
  transform: translateY(-1px);
}

.report-btn svg {
  width: 24px;
  height: 24px;
  color: #2563eb;
}

.report-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.report-modal-content {
  width: 100%;
  max-width: 670px;
  max-height: 90vh;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.report-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e8ef;
}

.report-modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #1a1d21;
}

.close-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.close-btn:hover {
  background: #e5e7eb;
  color: #1a1d21;
}

.report-table-wrap {
  overflow-y: auto;
  padding: 16px 24px;
}

.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.report-table th {
  text-align: left;
  padding: 12px 14px;
  font-size: 12px;
  font-weight: 600;
  color: #555b66;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: #f8fafc;
  border-bottom: 2px solid #e5e8ef;
}

.report-table td {
  padding: 14px;
  border-bottom: 1px solid #eef1f5;
  color: #1a1d21;
  vertical-align: middle;
}

.report-table tbody tr:hover {
  background: #f8fafc;
}

.comment-cell {
  min-width: 200px;
}

.note-text {
  font-size: 14px;
  color: #6b7280;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
}

.save-edit-btn {
  margin-left: 8px;
  padding: 6px 12px;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.edit-btn {
  margin-left: 8px;
  padding: 6px 12px;
  background: #f3f4f6;
  color: #6b7280;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.edit-btn:hover {
  background: #e5e7eb;
  color: #1a1d21;
}

.print-btn {
  padding: 6px 12px;
  background: #ffffff;
  color: #6b7280;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.print-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.report-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #e5e8ef;
  background: #f8fafc;
  border-radius: 0 0 14px 14px;
}

.print-action-btn {
  padding: 10px 20px;
  background: #16a34a;
  color: #ffffff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.print-action-btn:hover {
  background: #15803d;
}

.close-action-btn {
  padding: 10px 20px;
  background: #6b7280;
  color: #ffffff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.close-action-btn:hover {
  background: #4b5563;
}

@media print {
  .screen.main {
    max-width: 100%;
    padding: 0;
  }

  .user-block,
  .overtime-block,
  .results-block,
  .report-btn,
  .main-record-btn {
    display: none !important;
  }

  .report-modal {
    background: #ffffff;
    position: static;
    display: block;
    padding: 0;
    opacity: 1;
    z-index: 1;
  }

  .report-modal-content {
    box-shadow: none;
    border-radius: 0;
    max-width: 100%;
    max-height: none;
    overflow: visible;
  }

  .report-modal-header,
  .report-footer {
    display: none;
  }

  .report-table-wrap {
    overflow: visible;
    padding: 0;
  }

  .report-table th,
  .report-table td {
    border: 1px solid #e5e8ef;
  }

  .report-table tbody tr {
    break-inside: avoid;
  }
}

@media (max-width: 768px) {
  .screen.main {
    padding: 16px 16px 28px;
    gap: 16px;
  }

  .user-block {
    flex-wrap: wrap;
    gap: 12px;
  }

  .user-info {
    width: 100%;
    order: 3;
  }

  .overtime-block {
    padding: 16px;
  }

  .overtime-value {
    font-size: 26px;
  }

  .period-row {
    flex-direction: column;
    gap: 12px;
  }

  .period-label {
    min-width: auto;
    text-align: left;
  }

  .time-row {
    flex-direction: column;
    gap: 12px;
  }

  .time-label {
    min-width: auto;
    text-align: left;
  }

  .time-inputs {
    width: 100%;
  }

  .time-inputs input {
    width: 80px;
  }

  .main-record-btn {
    width: 200px;
    height: 200px;
    font-size: 22px;
  }

  .results-block {
    margin-top: 16px;
    text-align: center;
  }

  .report-btn {
    padding: 14px 18px;
    font-size: 15px;
  }

  .report-modal-content {
    max-height: 95vh;
  }

  .report-table-wrap {
    padding: 12px 16px;
  }

  .report-table th,
  .report-table td {
    padding: 10px;
    font-size: 13px;
  }

  .report-footer {
    padding: 12px 16px;
  }

  .report-footer .print-action-btn,
  .report-footer .close-action-btn {
    flex: 1;
    padding: 12px 16px;
    font-size: 14px;
  }
}

@media (max-width: 480px) {
  .screen.main {
    padding: 12px 12px 20px;
    gap: 12px;
  }

  .user-block {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .user-avatar {
    width: 44px;
    height: 44px;
    font-size: 20px;
  }

  .user-info {
    text-align: center;
  }

  .overtime-block {
    padding: 14px;
  }

  .period-row {
    flex-direction: column;
    gap: 8px;
  }

  .period-inputs {
    flex-direction: column;
  }

  .period-inputs input {
    width: 100%;
  }

  .time-row {
    flex-direction: column;
    gap: 8px;
  }

  .time-label {
    min-width: auto;
    text-align: left;
  }

  .time-inputs {
    width: 100%;
  }

  .time-inputs input {
    width: 100%;
  }

  .save-btn {
    width: 100%;
  }

  .main-record-btn {
    width: 160px;
    height: 160px;
    font-size: 18px;
  }

  .results-block {
    margin-top: 16px;
    text-align: center;
  }

  .report-btn {
    padding: 12px 16px;
    font-size: 14px;
  }

  .report-modal-content {
    max-width: 100%;
    border-radius: 12px;
  }

  .report-table th,
  .report-table td {
    padding: 8px;
    font-size: 12px;
  }

  .report-modal-header {
    padding: 16px 18px;
  }

  .report-footer {
    padding: 10px 16px;
  }

  .report-footer .print-action-btn,
  .report-footer .close-action-btn {
    padding: 10px 14px;
    font-size: 13px;
  }
}
</style>
