<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getSettings, getPeriodOvertime, updateSettings, getWorkLogs, deleteWorkLog, updateNote, recordWorkSession, updateWorkLog } from '@/utils/db'
import { supabase } from '@/supabaseClient'

const authStore = useAuthStore()
const router = useRouter()

// ── State ──────────────────────────────────────────────
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
const changesOpen = ref(false)
const version = 'v1.0.0'
const buildDate = new Date().toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })

const saveLoading = ref(false)
const saveButtonText = ref('Сохранить')
const saveButtonGreen = ref(false)
const saveBusy = ref(false)
const saveTimer = ref<number | null>(null)
const error = ref('')
const toast = ref('')
const toastVisible = ref(false)
const toastTimer = ref<number | null>(null)

const recordLoading = ref(false)
const recordButtonText = ref('Зафиксировать')
const recordButtonGreen = ref(false)
const recordingTimeout = ref<number | null>(null)
const editLoading = ref(false)

// ── Computed ───────────────────────────────────────────
const classNameSave = computed(() => saveButtonGreen.value ? 'save-btn-green' : 'save-btn')
const classNameRecord = computed(() => (recordButtonText.value === 'Обновлено') ? 'main-record-btn-green' : 'main-record-btn-default')

// ── Toast ──────────────────────────────────────────────
const showToast = (msg: string) => {
  toast.value = msg
  toastVisible.value = true
  if (toastTimer.value) clearTimeout(toastTimer.value)
  toastTimer.value = setTimeout(() => {
    toast.value = ''
    toastVisible.value = false
  }, 2500)
}

// ── Formatters ─────────────────────────────────────────
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

const printModal = () => {
  (window as any).print()
}

// ── Data loading ───────────────────────────────────────
const loadSettings = async () => {
  try {
    const userId = (authStore.user as any)?.id
    let data = await getSettings()
    const startVal = data?.period_start && data.period_start.trim() ? data.period_start : formatDateForInput(startDefault)
    const endVal = data?.period_end && data.period_end.trim() ? data.period_end : formatDateForInput(endDefault)
    if (!data) {
      await updateSettings({
        id: `${userId}-settings`,
        end_of_shift_hour: 18,
        end_of_shift_minute: 0,
        period_start: startVal,
        period_end: endVal,
      })
      // перечитываем, чтобы получить реальный id и значения из БД
      data = await getSettings()
    }
    settings.value = data ?? null
    periodStart.value = data?.period_start && data.period_start.trim() ? data.period_start : startVal
    periodEnd.value = data?.period_end && data.period_end.trim() ? data.period_end : endVal
    overtimeHours.value = data?.end_of_shift_hour ?? 18
    overtimeMinutes.value = data?.end_of_shift_minute ?? 0
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

// ── Actions ────────────────────────────────────────────
const resetSaveButton = () => {
  if (saveTimer.value) clearTimeout(saveTimer.value)
  saveButtonText.value = 'Сохранить'
  saveButtonGreen.value = false
}

const saveSettings = async () => {
  try {
    saveBusy.value = true
    saveLoading.value = true
    await updateSettings({
      id: settings.value?.id || `${authStore.user?.id}-settings`,
      end_of_shift_hour: Number(overtimeHours.value) || 0,
      end_of_shift_minute: Number(overtimeMinutes.value) || 0,
      period_start: periodStart.value,
      period_end: periodEnd.value,
    })
    // перечитываем из БД, чтобы запомнить реальный id строки
    await loadSettings()
    await loadPeriodOvertime()
    await loadWorkLogs()
    showToast('Настройки сохранены')
    saveButtonText.value = 'Обновлено'
    saveButtonGreen.value = true
    if (saveTimer.value) clearTimeout(saveTimer.value)
    saveTimer.value = window.setTimeout(resetSaveButton, 3000)
  } catch (e: any) {
    error.value = e.message || 'Ошибка сохранения'
    showToast(e.message || 'Ошибка сохранения')
    resetSaveButton()
  } finally {
    saveBusy.value = false
    saveLoading.value = false
  }
}

const resetRecordButton = () => {
  if (recordingTimeout.value) clearTimeout(recordingTimeout.value)
  recordButtonText.value = 'Зафиксировать'
  recordButtonGreen.value = false
  recordingTimeout.value = window.setTimeout(() => {
    recordButtonText.value = 'Зафиксировать'
    recordButtonGreen.value = false
  }, 3000)
}

const emitRecord = async () => {
  error.value = ''
  try {
    recordLoading.value = true
    recordButtonText.value = 'Обновлено'
    recordButtonGreen.value = true

    // 1. Проверка текущего времени
    const now = new Date()
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes()
    const overtimeTotalMinutes = overtimeHours.value * 60 + overtimeMinutes.value

    if (currentTotalMinutes < overtimeTotalMinutes) {
      const confirmed = window.confirm(
        'Текущее время меньше, чем время окончания работы в настройках.\nПереработка не возможна. Произвести запись?'
      )
      if (!confirmed) {
        resetRecordButton()
        return
      }
    }

    // 2. Есть ли запись за эту дату
    const todayStr = formatDateForInput(now)
    const existingLog = workLogs.value.find((log: any) => String(log.date).slice(0, 10) === todayStr)

    if (existingLog) {
      // Полная перезапись: дата, время, сверхнорма, комментарий
      const overtimeMins = Math.max(0, currentTotalMinutes - overtimeTotalMinutes)
      await updateWorkLog(existingLog.id, todayStr, now, overtimeMins, existingLog.note ?? '')
      showToast('Сверхнорма перезаписана')
    } else {
      const res = await recordWorkSession(overtimeHours.value, overtimeMinutes.value)
      const mins = res.overtimeMinutes
      const msg = mins >= 60
        ? `Записано за ${formatDateDisplay(res.date)}: ${Math.floor(mins / 60)} ч ${mins % 60} м`
        : `Записано за ${formatDateDisplay(res.date)}: ${mins} м`
      showToast(msg)
    }

    await loadPeriodOvertime()
    await loadWorkLogs()
  } catch (e: any) {
    error.value = e.message || 'Ошибка записи'
    showToast(e.message || 'Ошибка записи')
  } finally {
    recordLoading.value = false
    resetRecordButton()
  }
}

const openReport = async () => {
  if (!periodStart.value || !periodEnd.value) {
    showToast('Сначала выберите период')
    return
  }
  const start = periodStart.value
  const end = periodEnd.value
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id ?? authStore.user?.id
    const { data, error } = await supabase
      .from('work_logs')
      .select('*')
      .eq('user_id', uid)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: false })
    if (error) throw error
    workLogs.value = (data as any[]) ?? []
    showToast(
      workLogs.value.length
        ? `Найдено записей: ${workLogs.value.length} за ${formatDateDisplay(start)} — ${formatDateDisplay(end)}`
        : `За период ${formatDateDisplay(start)} — ${formatDateDisplay(end)} записей нет`
    )
  } catch (e: any) {
    error.value = e.message || 'Не удалось загрузить отчёт'
    showToast(e.message || 'Не удалось загрузить отчёт')
    workLogs.value = []
  }
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
    editLoading.value = true
    await updateNote(editingId.value, currentNote.value)
    await loadWorkLogs()
    editingId.value = null
    currentNote.value = ''
    showToast('Комментарий сохранён')
  } catch (e: any) {
    error.value = e.message || 'Ошибка сохранения'
  } finally {
    editLoading.value = false
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
    <!-- User block -->
    <section class="user-block">
      <div class="user-avatar">{{ (authStore.user?.email ?? 'Пользователь').charAt(0) }}</div>
      <div class="user-info">
        <span class="user-name">{{ authStore.user?.email ?? 'Пользователь' }}</span>
        <span class="user-role">Администратор</span>
      </div>
      <button class="logout-btn" @click="logout" title="Нажмите чтобы выйти с данного аккаунта">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </section>

    <!-- Overtime total block -->
    <section class="overtime-block">
      <div class="overtime-title">Сверхнормативно отработано за период всего (чч:мм)</div>
      <div class="overtime-value">{{ totalHours }}:{{ String(totalMinLeft).padStart(2, '0') }}</div>
    </section>

    <!-- Period block (full width) -->
    <section class="period-block">
      <div class="period-inputs">
        <span class="period-label">Период</span>
        <div class="period-inputs-group">
          <input type="date" v-model="periodStart" />
          <span class="period-sep">—</span>
          <input type="date" v-model="periodEnd" />
        </div>
      </div>
    </section>

    <!-- Time & save block (single row) -->
    <section class="time-save-block">
      <div class="time-inputs">
        <label class="time-label">Время после которого начинается переработка</label>
        <div class="time-field">
          <input type="number" v-model.number="overtimeHours" min="0" max="23" placeholder="Часы" />
          <span class="time-colon">:</span>
          <input type="number" v-model.number="overtimeMinutes" min="0" max="59" placeholder="Минуты" />
        </div>
      </div>
      <div class="save-row">
        <button class="save-btn" @click="saveSettings" :disabled="saveLoading || saveBusy" :class="[classNameSave, { 'save-btn-green': saveButtonGreen }]">
          {{ saveLoading ? 'Сохраняю...' : saveButtonText }}
        </button>
      </div>
    </section>

    <!-- Fix button (circular) -->
    <div class="record-center">
      <button class="main-record-btn" @click="emitRecord" :disabled="recordLoading" :class="[classNameRecord, { 'main-record-btn-green': recordButtonText === 'Обновлено' }]">
        <span>{{ recordButtonText }}</span>
      </button>
    </div>

    <!-- Generate report button -->
    <div class="results-block">
      <button class="report-btn" @click="openReport">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span>Вывести отчёт за выбранный период</span>
      </button>
    </div>

    <!-- Install note -->
    <div class="hint-box">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="12"/>
        <line x1="12" y1="8" x2="12" y2="8"/>
      </svg>
      <span><strong>Как добавить на домашний экран:</strong></span>
      <ul style="margin: 6px 0 0 18px; padding: 0;">
        <li><strong>iOS (Safari):</strong> Нажмите «Поделиться» («Share»), выберите «Добавить на домашний экран», дайте имя ярлыку и нажмите «Добавить».</li>
        <li><strong>Android (Chrome):</strong> Откройте меню (три точки), выберите «Добавить на экран», назовите ярлык и нажмите «Добавить».</li>
      </ul>
    </div>

    <!-- Version & Changes footer -->
    <div class="version-footer">
      <span class="version-label">Версия: {{ version }} ({{ buildDate }})</span>
      <button class="changes-btn" @click="changesOpen = true" title="История изменений">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12" y2="8"/>
        </svg>
      </button>
    </div>

    <!-- Changes modal -->
    <div v-if="changesOpen" class="changes-modal" @click.self="changesOpen = false">
      <div class="changes-modal-content">
        <div class="changes-modal-header">
          <h3>История изменений</h3>
          <button class="close-btn" @click="changesOpen = false" title="Закрыть">✕</button>
        </div>
        <div class="changes-list">
          <div class="change-item">
            <span class="change-version">v1.0.0</span>
            <span class="change-date">{{ buildDate }}</span>
            <ul class="change-list">
              <li>Первый релиз приложения</li>
            </ul>
          </div>
        </div>
        <div class="changes-footer">
          <button class="close-btn" @click="changesOpen = false" title="Закрыть">Закрыть</button>
        </div>
      </div>
    </div>

    <!-- Report modal -->
    <div v-if="reportOpen" class="report-modal" @click.self="closeReport">
      <div class="report-modal-content">
        <div class="report-modal-header">
          <h3>Отчёт за выбранный период</h3>
          <button class="close-btn" @click="closeReport" title="Закрыть">✕</button>
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
              <tr v-if="workLogs.length === 0">
                <td colspan="5" class="empty-cell">
                  За выбранный период записей нет
                </td>
              </tr>
              <tr v-for="(log, index) in workLogs" :key="index">
                <td>{{ formatDateDisplay(log.date) }}</td>
                <td>{{ formatTime(log.press_time) }}</td>
                <td>{{ formatDuration(log.overtime_minutes) }}</td>
                <td class="comment-cell">
                  <template v-if="editingId === log.id">
                    <input v-model="currentNote" class="note-input" />
                    <button class="save-edit-btn" @click="saveEdit" title="Сохранить">Сохранить</button>
                  </template>
                  <template v-else>
                    <span class="note-text">{{ log.note ?? '—' }}</span>
                  </template>
                </td>
                                <td>
                                  <div class="actions-cell">
                                    <button class="edit-btn" @click="startEdit(log)" title="Редактировать запись">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                                        <path d="M12 20h9"/>
                                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                                      </svg>
                                    </button>
                                    <button class="close-btn" @click="deleteLog(log)" title="Удалить запись">✕</button>
                                  </div>
                                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="report-footer">
          <button class="print-action-btn" @click="printModal()" title="Напечатать отчёт">Печать</button>
          <button class="close-action-btn" @click="closeReport" title="Закрыть">Закрыть</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.screen.main {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f0f4ff;
  padding: 24px 32px 40px;
  gap: 20px;
  max-width: 700px;
  margin: 0 auto;
}

/* ── User block ─────────────────────────────────────── */
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

/* ── Overtime total block ─────────────────────────────── */
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
  margin-bottom: 6px;
  display: block;
}

.overtime-value {
  font-size: 42px;
  font-weight: 800;
  color: #2563eb;
  margin-bottom: 12px;
  display: block;
  text-align: center;
}

.overtime-value .value-unit {
  font-size: 20px;
  font-weight: 600;
  color: #6b7280;
}

.period-time-row {
  display: flex;
  flex-direction: row;
  gap: 16px;
}

.period-control {
  flex: 1;
  min-width: 0;
}

.time-control {
  flex: 0 0 35%;
  min-width: 0;
}

.time-label {
  display: block;
  margin-bottom: 6px;
}

.time-inputs {
  display: flex;
  align-items: center;
  gap: 10px;
}

.time-inputs input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
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
  padding-bottom: 8px;
}

.save-action {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
}

.save-btn {
  padding: 8px 16px;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.save-btn-green {
  background: #16a34a !important;
  color: #ffffff !important;
  box-shadow: 0 4px 12px rgba(22, 163, 74, 0.3);
}

.save-btn-green:hover {
  background: #15803d !important;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.save-btn-green {
  background: #16a34a !important;
  color: #ffffff !important;
  box-shadow: 0 4px 12px rgba(22, 163, 74, 0.3);
}

.save-btn-green:hover {
  background: #15803d !important;
}

/* ── Fix button (2x larger) ───────────────────────────── */
.record-center {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}

.main-record-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px 32px;
  border: 3px solid #2563eb;
  border-radius: 200px;
  background: #ffffff;
  color: #2563eb;
  font-size: 28px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.main-record-btn:hover {
  background: #2563eb;
  color: #ffffff;
}

.main-record-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.main-record-btn-green {
  background: #16a34a !important;
  border-color: #16a34a !important;
  color: #ffffff !important;
  box-shadow: 0 6px 16px rgba(22, 163, 74, 0.3);
}

.main-record-btn-green:hover {
  background: #15803d !important;
  border-color: #15803d !important;
}

/* ── Generate report button ──────────────────────────── */
.results-block {
  text-align: center;
  margin-bottom: 12px;
}

.report-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  background: #ffffff;
  border: 1px solid #e5e8ef;
  border-radius: 12px;
  color: #1a1d21;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  max-width: 400px;
  width: 100%;
  margin: 0 auto;
}

.report-btn:hover {
  background: #f0f4ff;
  border-color: #2563eb;
  color: #2563eb;
}

.results-block .report-btn svg {
  flex-shrink: 0;
}

/* ── Install note ────────────────────────────────────── */
.hint-box {
  background: #eff6ff;
  border: 1px solid #bae6fd;
  border-radius: 12px;
  padding: 16px 20px;
  text-align: center;
}

.hint-box svg {
  color: #2563eb;
}

.hint-box span {
  font-size: 14px;
  color: #374151;
}

.hint-box strong {
  color: #1a1d21;
  display: block;
  margin-bottom: 6px;
}

.hint-box ul {
  margin: 6px 0 0 18px;
  padding: 0;
  list-style: disc;
}

/* ── Report modal ────────────────────────────────────── */
.report-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
}

.report-modal-content {
  width: 100%;
  max-width: 670px;
  max-height: 90vh;
  background: #ffffff;
  border-radius: 16px 16px 0 0;
  overflow-y: auto;
  padding: 0;
}

.report-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
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
  border: none;
  background: #f3f4f6;
  border-radius: 50%;
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
  padding: 12px 24px;
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
  padding: 12px 14px;
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

.empty-cell {
  text-align: center;
  padding: 20px 12px;
  color: #6b7280;
  font-size: 14px;
}

.note-text {
  font-size: 14px;
  color: #6b7280;
  line-height: 1.6;
  word-wrap: break-word;
  overflow-wrap: anywhere;
  hyphens: auto;
  max-width: 200px;
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
  transition: background 0.2s;
}

.save-edit-btn:hover {
  background: #1d4ed8;
}

.actions-cell {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.edit-btn {
  padding: 6px 12px;
  background: #f3f4f6;
  color: #6b7280;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.edit-btn:hover {
  background: #e5e7eb;
  color: #1a1d21;
}

.report-footer {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding: 16px 24px;
  border-top: 1px solid #e5e8ef;
}

.print-action-btn,
.close-action-btn {
  flex: 1;
  padding: 12px 16px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.print-action-btn {
  background: #2563eb;
  color: #ffffff;
}

.print-action-btn:hover {
  background: #1d4ed8;
}

.close-action-btn {
  background: #f3f4f6;
  color: #6b7280;
}

.close-action-btn:hover {
  background: #e5e7eb;
  color: #1a1d21;
}

/* ── Responsive ──────────────────────────────────────── */
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

  .period-time-block {
    padding: 16px;
  }

  .period-time-row {
    flex-direction: column;
    gap: 16px;
  }

  .period-control,
  .time-control {
    flex: 1 1 100%;
  }

  .save-action {
    flex: 0 0 auto;
    justify-content: flex-start;
  }

  .main-record-btn {
    width: 200px;
    height: 200px;
    font-size: 28px;
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
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px;
  }

  .print-action-btn,
  .close-action-btn {
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

  .period-time-block {
    padding: 14px;
  }

  .period-inputs {
    flex-direction: column;
  }

  .period-inputs input {
    width: 100%;
  }

  .time-inputs {
    flex-direction: column;
  }

  .time-inputs input {
    width: 100%;
  }

  .time-colon {
    text-align: center;
    padding-bottom: 8px;
  }

  .save-btn {
    width: 100%;
  }

  .main-record-btn {
    width: 160px;
    height: 160px;
    font-size: 34px;
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
}
</style>
