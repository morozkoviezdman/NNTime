<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getSettings, getPeriodOvertime, updateSettings, getWorkLogs, getWorkLogByDate, deleteWorkLog, updateNote, recordWorkSession, updateWorkLog } from '@/utils/db'
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
// фильтр отчёта по величине сверхнормы: 0 — все, 1/2/3 — больше N часов
const reportMinHours = ref(0)
const filteredLogs = computed(() => {
  if (!reportMinHours.value) return workLogs.value
  const minMinutes = reportMinHours.value * 60
  return workLogs.value.filter((log: any) => (log.overtime_minutes ?? 0) > minMinutes)
})
const changesOpen = ref(false)
const version = 'v1.2.0'
const brandIcon = `${import.meta.env.BASE_URL}icon.svg`
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

    // 2. Ищем запись за эту дату ПРЯМО В БАЗЕ (список в памяти может быть пустым/устаревшим)
    const todayStr = formatDateForInput(now)
    const existingLog = await getWorkLogByDate(todayStr)

    if (existingLog) {
      // Полная перезапись: дата, время, сверхнорма, комментарий
      const overtimeMins = Math.max(0, currentTotalMinutes - overtimeTotalMinutes)
      await updateWorkLog(existingLog.id, todayStr, now, overtimeMins, (existingLog as any).note ?? '')
      console.info('[record] перезаписана запись:', existingLog.id, 'минут:', overtimeMins)
      showToast('Сверхнорма перезаписана')
    } else {
      const res = await recordWorkSession(overtimeHours.value, overtimeMinutes.value)
      console.info('[record] вставлено в work_logs:', res.row)
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
    <!-- App brand -->
    <div class="app-header">
      <img class="app-logo" :src="brandIcon" alt="" width="26" height="26" />
      <span class="app-brand">NNTime</span>
      <span class="app-brand-sub">сверхнормативное время</span>
    </div>

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

    <!-- Period & time settings (one white card) -->
    <section class="settings-block">
      <div class="field-row">
        <span class="field-label">Период</span>
        <div class="period-inputs-group">
          <input type="date" v-model="periodStart" title="Начало периода отчёта" />
          <span class="period-sep">—</span>
          <input type="date" v-model="periodEnd" title="Конец периода отчёта" />
        </div>
      </div>

      <div class="field-divider"></div>

      <div class="field-row">
        <span class="field-label">Время, после которого начинается переработка</span>
        <div class="time-inline">
          <div class="time-field">
            <input type="number" v-model.number="overtimeHours" min="0" max="23" placeholder="18" title="Часы окончания смены" />
            <span class="time-colon">:</span>
            <input type="number" v-model.number="overtimeMinutes" min="0" max="59" placeholder="00" title="Минуты окончания смены" />
          </div>
          <button class="save-btn" @click="saveSettings" :disabled="saveLoading || saveBusy" :class="[classNameSave, { 'save-btn-green': saveButtonGreen }]" title="Сохранить период и время в базе">
            {{ saveLoading ? 'Сохраняю...' : saveButtonText }}
          </button>
        </div>
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
      <div class="hint-head">
        <span class="hint-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
            <rect x="5" y="2" width="14" height="20" rx="3"/>
            <line x1="12" y1="18" x2="12" y2="18"/>
          </svg>
        </span>
        <span class="hint-title">Как добавить на домашний экран</span>
      </div>

      <div class="hint-item">
        <span class="hint-badge">iOS</span>
        <p class="hint-text">
          В Safari нажмите <b>«Поделиться»</b> → <b>«Добавить на домашний экран»</b> → <b>«Добавить»</b>
        </p>
      </div>

      <div class="hint-item">
        <span class="hint-badge">Android</span>
        <p class="hint-text">
          В Chrome откройте меню <b>⋮</b> → <b>«Добавить на экран»</b> (или «Установить приложение») → <b>«Добавить»</b>
        </p>
      </div>
    </div>

    <!-- Version & Changes footer -->
    <div class="version-footer">
      <span class="version-label">Версия {{ version }} · {{ buildDate }}</span>
      <button class="changes-btn" @click="changesOpen = true" title="История изменений">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
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
            <div class="change-head">
              <span class="change-version">{{ version }}</span>
              <span class="change-date">{{ buildDate }}</span>
            </div>
            <ul class="change-list">
              <li>Кнопка «Зафиксировать» корректно возвращается в исходное состояние</li>
              <li>Повторная фиксация за ту же дату перезаписывает запись, а не создаёт дубль</li>
              <li>Период и время сохраняются в базе и подгружаются при новом входе</li>
              <li>Отчёт печатается целиком, с разбивкой на страницы</li>
              <li>Оформление блока периода и времени, подсказки и истории версий</li>
            </ul>
          </div>
        </div>
        <div class="changes-footer">
          <button class="changes-close-btn" @click="changesOpen = false" title="Закрыть">Закрыть</button>
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
        <div class="print-only print-title">
          Отчёт за период {{ formatDateDisplay(periodStart) }} — {{ formatDateDisplay(periodEnd) }}<template v-if="reportMinHours"> · сверхнорма больше {{ reportMinHours }} ч</template>
        </div>

        <div class="report-filters">
          <button
            v-for="opt in [{ h: 0, label: 'Все' }, { h: 1, label: '> 1 ч' }, { h: 2, label: '> 2 ч' }, { h: 3, label: '> 3 ч' }]"
            :key="opt.h"
            class="filter-chip"
            :class="{ 'filter-chip-active': reportMinHours === opt.h }"
            @click="reportMinHours = opt.h"
            :title="opt.h ? `Показать записи со сверхнормой больше ${opt.h} ч` : 'Показать все записи за период'"
          >
            {{ opt.label }}
          </button>
          <span class="filter-summary">
            {{ filteredLogs.length }} из {{ workLogs.length }}
          </span>
        </div>

        <div class="report-table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Время выхода</th>
                <th>Сверхнорма</th>
                <th>Комментарий</th>
                <th class="col-actions">Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="filteredLogs.length === 0">
                <td colspan="5" class="empty-cell">
                  {{ workLogs.length === 0 ? 'За выбранный период записей нет' : 'Нет записей с такой сверхнормой' }}
                </td>
              </tr>
              <tr v-for="(log, index) in filteredLogs" :key="index">
                <td data-label="Дата">{{ formatDateDisplay(log.date) }}</td>
                <td data-label="Время выхода">{{ formatTime(log.press_time) }}</td>
                <td data-label="Сверхнорма">{{ formatDuration(log.overtime_minutes) }}</td>
                <td class="comment-cell" data-label="Комментарий">
                  <template v-if="editingId === log.id">
                    <input v-model="currentNote" class="note-input" />
                    <button class="save-edit-btn" @click="saveEdit" title="Сохранить">Сохранить</button>
                  </template>
                  <template v-else>
                    <span class="note-text">{{ log.note ?? '—' }}</span>
                  </template>
                </td>
                                <td class="col-actions">
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

/* ── App brand ──────────────────────────────────────── */
.app-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.app-logo {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  flex: 0 0 auto;
}

.app-brand {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: #2563eb;
}

.app-brand-sub {
  font-size: 12px;
  color: #8b93a1;
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
  text-align: left;
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
  text-align: left;
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

/* ── Settings card: период + время + сохранить ────────── */
.settings-block {
  background: #ffffff;
  border: 1px solid #e5e8ef;
  border-radius: 14px;
  padding: 18px 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: #555b66;
  line-height: 1.35;
}

.field-divider {
  height: 1px;
  background: #eef1f6;
  margin: 0 -20px;
}

/* период: два равных поля на всю ширину карточки */
.period-inputs-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.period-inputs-group input[type='date'] {
  flex: 1 1 0;
  min-width: 0;
  height: 46px;
  padding: 0 12px;
  border: 1px solid #d7dbe3;
  border-radius: 10px;
  background: #f8fafc;
  font-size: 15px;
  color: #111827;
  font-variant-numeric: tabular-nums;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}

.period-inputs-group input[type='date']:focus {
  outline: none;
  background: #ffffff;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.period-sep {
  color: #9ca3af;
  font-weight: 700;
  flex: 0 0 auto;
}

/* время + кнопка на одной строке */
.time-inline {
  display: flex;
  align-items: center;
  gap: 12px;
}

.time-field {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.time-field input {
  width: 72px;
  height: 46px;
  padding: 0;
  text-align: center;
  border: 1px solid #d7dbe3;
  border-radius: 10px;
  background: #f8fafc;
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  font-variant-numeric: tabular-nums;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  -moz-appearance: textfield;
}

.time-field input::-webkit-outer-spin-button,
.time-field input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.time-field input:focus {
  outline: none;
  background: #ffffff;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.time-colon {
  font-size: 18px;
  font-weight: 700;
  color: #6b7280;
}

.save-btn {
  margin-left: auto;
  flex: 0 0 auto;
  height: 46px;
  padding: 0 22px;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, box-shadow 0.2s, transform 0.1s;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
}

.save-btn:hover:not(:disabled) {
  background: #1d4ed8;
}

.save-btn:active:not(:disabled) {
  transform: translateY(1px);
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.save-btn-green {
  background: #16a34a !important;
  color: #ffffff !important;
  box-shadow: 0 4px 12px rgba(22, 163, 74, 0.3) !important;
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
  width: clamp(200px, 58vw, 240px);
  height: clamp(200px, 58vw, 240px);
  padding: 0 12px;
  text-align: center;
  line-height: 1.15;
  border: 3px solid #2563eb;
  border-radius: 50%;
  background: #ffffff;
  color: #2563eb;
  font-size: clamp(20px, 5.2vw, 26px);
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  flex: 0 0 auto;
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
  background: #f5f8ff;
  border: 1px solid #e2e9f7;
  border-radius: 14px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
}

.hint-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hint-icon {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: #e6efff;
  color: #2563eb;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hint-title {
  font-size: 14px;
  font-weight: 700;
  color: #1a1d21;
  line-height: 1.3;
}

.hint-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #ffffff;
  border: 1px solid #e8eefb;
  border-radius: 10px;
  padding: 10px 12px;
}

.hint-badge {
  flex: 0 0 auto;
  min-width: 62px;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: #2563eb;
  background: #eaf1ff;
  border-radius: 999px;
  padding: 4px 8px;
  margin-top: 1px;
}

.hint-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #4b5563;
}

.hint-text b {
  color: #1a1d21;
  font-weight: 600;
}

/* ── Version footer ──────────────────────────────────── */
.version-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 6px 0 2px;
}

.version-label {
  font-size: 12px;
  color: #8b93a1;
  letter-spacing: 0.2px;
}

.changes-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d7dbe3;
  border-radius: 999px;
  background: #ffffff;
  color: #6b7280;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}

.changes-btn:hover {
  color: #2563eb;
  border-color: #2563eb;
  background: #f5f8ff;
}

/* ── Changes modal ───────────────────────────────────── */
.changes-modal {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 1100;
}

.changes-modal-content {
  width: 100%;
  max-width: 520px;
  max-height: 85vh;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.changes-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid #eef1f6;
}

.changes-modal-header h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #1a1d21;
}

.changes-modal-header .close-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: #f3f5f9;
  color: #6b7280;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.changes-modal-header .close-btn:hover {
  background: #e8ecf4;
  color: #1a1d21;
}

.changes-list {
  padding: 16px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.changes-list::-webkit-scrollbar {
  width: 8px;
}

.changes-list::-webkit-scrollbar-thumb {
  background: #dde3ee;
  border-radius: 999px;
}

.changes-list::-webkit-scrollbar-track {
  background: transparent;
}

.change-item {
  border: 1px solid #eef1f6;
  border-radius: 12px;
  padding: 14px 16px;
  background: #fbfcfe;
}

.change-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.change-version {
  font-size: 12px;
  font-weight: 700;
  color: #2563eb;
  background: #eaf1ff;
  border-radius: 999px;
  padding: 3px 10px;
}

.change-date {
  font-size: 12px;
  color: #8b93a1;
}

.change-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.change-list li {
  font-size: 13px;
  line-height: 1.5;
  color: #4b5563;
  list-style: disc;
}

.changes-footer {
  padding: 12px 18px 16px;
  border-top: 1px solid #eef1f6;
  display: flex;
  justify-content: flex-end;
}

.changes-close-btn {
  height: 40px;
  padding: 0 20px;
  border: none;
  border-radius: 10px;
  background: #2563eb;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
}

.changes-close-btn:hover {
  background: #1d4ed8;
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

.report-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px 24px 0;
}

.filter-chip {
  height: 32px;
  padding: 0 14px;
  border: 1px solid #d7dbe3;
  border-radius: 999px;
  background: #ffffff;
  color: #4b5563;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.filter-chip:hover {
  border-color: #2563eb;
  color: #2563eb;
}

.filter-chip-active {
  background: #2563eb;
  border-color: #2563eb;
  color: #ffffff;
}

.filter-chip-active:hover {
  background: #1d4ed8;
  color: #ffffff;
}

.filter-summary {
  margin-left: auto;
  font-size: 12px;
  color: #8b93a1;
  white-space: nowrap;
}

.report-table-wrap {
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 24px;
}

.report-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 14px;
}

.report-table th:nth-child(1) { width: 15%; }
.report-table th:nth-child(2) { width: 19%; }
.report-table th:nth-child(3) { width: 19%; }
.report-table th:nth-child(4) { width: 32%; }
.report-table th:nth-child(5) { width: 15%; }

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
  min-width: 0;
  overflow-wrap: anywhere;
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
    flex-wrap: nowrap;
    gap: 10px;
    padding: 14px 16px;
    text-align: left;
  }

  .user-avatar {
    width: 42px;
    height: 42px;
    font-size: 18px;
    flex: 0 0 auto;
  }

  .user-info {
    width: auto;
    order: 0;
    flex: 1 1 auto;
    min-width: 0;
    text-align: left;
  }

  .user-name {
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-role {
    font-size: 12px;
  }

  .logout-btn {
    flex: 0 0 auto;
    width: 34px;
    height: 34px;
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
    width: clamp(220px, 70vw, 270px);
    height: clamp(220px, 70vw, 270px);
    font-size: clamp(22px, 6vw, 28px);
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
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    text-align: left;
  }

  .user-avatar {
    width: 44px;
    height: 44px;
    font-size: 20px;
  }

  .user-info {
    flex: 1 1 auto;
    min-width: 0;
    text-align: left;
  }

  .user-name {
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-role {
    font-size: 12px;
  }

  .settings-block {
    padding: 14px 16px;
    gap: 12px;
  }

  .field-divider {
    margin: 0 -16px;
  }

  .period-inputs-group {
    gap: 8px;
  }

  .period-inputs-group input[type='date'] {
    height: 44px;
    padding: 0 10px;
    font-size: 14px;
  }

  /* на узком экране кнопка «Сохранить» уходит под поля на всю ширину */
  .time-inline {
    flex-wrap: wrap;
    gap: 10px;
  }

  .time-field {
    flex: 1 1 auto;
  }

  .time-field input {
    width: 100%;
    min-width: 64px;
    height: 44px;
  }

  .save-btn {
    margin-left: 0;
    width: 100%;
    height: 44px;
  }

  .hint-box {
    padding: 14px;
  }

  .hint-item {
    flex-direction: column;
    gap: 6px;
    padding: 10px;
  }

  .hint-badge {
    min-width: 0;
    align-self: flex-start;
  }

  .changes-modal {
    padding: 12px;
  }

  .changes-modal-content {
    max-height: 90vh;
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
    width: clamp(200px, 62vw, 240px);
    height: clamp(200px, 62vw, 240px);
    font-size: clamp(19px, 5.4vw, 24px);
    padding: 0 8px;
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

/* Отчёт на телефоне: таблица превращается в карточки */
@media screen and (max-width: 600px) {
  .report-filters {
    padding: 10px 14px 0;
    gap: 6px;
  }

  .filter-chip {
    height: 28px;
    padding: 0 11px;
    font-size: 12px;
  }

  .filter-summary {
    font-size: 11px;
  }

  .report-table-wrap {
    padding: 8px 14px 4px;
    overflow-x: visible;
  }

  .report-table {
    display: block;
    width: 100%;
    font-size: 14px;
  }

  .report-table thead {
    display: none;
  }

  .report-table tbody,
  .report-table tr,
  .report-table td {
    display: block;
    width: 100%;
  }

  .report-table tr {
    border: 1px solid #e8ecf4;
    border-radius: 12px;
    padding: 10px 12px;
    margin-bottom: 10px;
    background: #ffffff;
  }

  .report-table tr:hover {
    background: #ffffff;
  }

  .report-table td {
    border: none;
    padding: 3px 0;
    display: flex;
    align-items: baseline;
    gap: 10px;
    overflow-wrap: anywhere;
  }

  .report-table td::before {
    content: attr(data-label);
    flex: 0 0 104px;
    color: #8b93a1;
    font-size: 12px;
    line-height: 1.4;
  }

  .report-table td.empty-cell {
    display: block;
    text-align: center;
    padding: 12px 0;
  }

  .report-table td.empty-cell::before {
    content: none;
  }

  .report-table td.comment-cell {
    display: block;
    padding-top: 4px;
  }

  .report-table td.comment-cell::before {
    display: block;
    margin-bottom: 2px;
  }

  .report-table td.col-actions {
    justify-content: flex-end;
    padding-top: 8px;
  }

  .report-table td.col-actions::before {
    content: none;
  }

  .note-text {
    max-width: none;
  }
}
</style>

<!-- Печать отчёта: печатается вся таблица, а не видимая часть модального окна -->
<style>
.print-only {
  display: none;
}

@media print {
  @page {
    size: A4 portrait;
    margin: 12mm 10mm;
  }

  html,
  body {
    background: #fff !important;
    height: auto !important;
    overflow: visible !important;
  }

  /* скрываем всё, кроме модального окна отчёта */
  .screen.main > *:not(.report-modal) {
    display: none !important;
  }

  .screen.main {
    display: block !important;
    padding: 0 !important;
    margin: 0 !important;
    max-width: none !important;
    min-height: 0 !important;
    background: #fff !important;
    gap: 0 !important;
  }

  .report-modal {
    position: static !important;
    inset: auto !important;
    display: block !important;
    background: #fff !important;
    padding: 0 !important;
    overflow: visible !important;
    width: 100% !important;
  }

  .report-modal-content {
    position: static !important;
    display: block !important;
    width: 100% !important;
    max-width: none !important;
    max-height: none !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    overflow: visible !important;
    background: #fff !important;
  }

  .report-modal-header {
    display: block !important;
    padding: 0 0 8px !important;
    border-bottom: 1px solid #000 !important;
  }

  .report-modal-header h3 {
    font-size: 14pt !important;
    margin: 0 !important;
    color: #000 !important;
  }

  /* кнопки и колонка действий на печати не нужны */
  .report-modal-header .close-btn,
  .report-footer,
  .report-filters,
  .col-actions,
  .actions-cell,
  .empty-cell {
    display: none !important;
  }

  .print-only {
    display: block !important;
    font-size: 10pt !important;
    margin: 6px 0 10px !important;
    color: #000 !important;
  }

  .report-table-wrap {
    max-height: none !important;
    overflow: visible !important;
    padding: 0 !important;
    border: none !important;
    box-shadow: none !important;
  }

  .report-table {
    width: 100% !important;
    border-collapse: collapse !important;
    font-size: 10pt !important;
  }

  /* заголовок таблицы повторяется на каждой странице */
  .report-table thead {
    display: table-header-group !important;
  }

  .report-table tfoot {
    display: table-footer-group !important;
  }

  /* строки не разрываются между страницами */
  .report-table tr {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  .report-table th,
  .report-table td {
    border: 1px solid #666 !important;
    padding: 6px 8px !important;
    color: #000 !important;
    background: #fff !important;
  }

  .report-table th {
    background: #eee !important;
    font-weight: 700 !important;
  }

  /* комментарий переносится, колонка не растягивает таблицу */
  .note-text {
    max-width: none !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
    color: #000 !important;
  }

  .comment-cell {
    min-width: 0 !important;
  }

  .note-input,
  .save-edit-btn,
  .edit-btn {
    display: none !important;
  }
}
</style>
