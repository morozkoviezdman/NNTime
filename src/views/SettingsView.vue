<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getSettings, updateSettings } from '@/utils/db'

const router = useRouter()

const loading = ref(true)
const saving = ref(false)
const saveText = ref('Сохранить')

const error = ref('')

const periodStart = ref('')
const periodEnd = ref('')
const hour = ref(18)
const minute = ref(0)
const askNote = ref(false)

// настройки, которые живут на устройстве
const soundOn = ref(localStorage.getItem('nntime_sound') !== 'off')
// по умолчанию полная анимация включена
const fullAnimation = ref(localStorage.getItem('nntime_animation') !== 'auto')

const toggleSound = () => {
  soundOn.value = !soundOn.value
  localStorage.setItem('nntime_sound', soundOn.value ? 'on' : 'off')
}

const toggleAnimation = () => {
  fullAnimation.value = !fullAnimation.value
  localStorage.setItem('nntime_animation', fullAnimation.value ? 'full' : 'auto')
}

// первая установка: полная анимация включена
if (localStorage.getItem('nntime_animation') === null) {
  localStorage.setItem('nntime_animation', 'full')
}

const periodLabel = computed(() => {
  const fmt = (s: string) => (s ? s.split('-').reverse().join('.') : '—')
  return `${fmt(periodStart.value)} — ${fmt(periodEnd.value)}`
})

let greenTimer: number | null = null
const flashSaved = () => {
  saveText.value = 'Сохранено'
  if (greenTimer) window.clearTimeout(greenTimer)
  greenTimer = window.setTimeout(() => {
    saveText.value = 'Сохранить'
  }, 1200)
}

const fmtDate = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const loadSettings = async () => {
  try {
    const data = await getSettings()
    if (data) {
      periodStart.value = data.period_start?.trim() || ''
      periodEnd.value = data.period_end?.trim() || ''
    }
    if (!periodStart.value) {
      const start = new Date()
      start.setDate(start.getDate() - 365)
      periodStart.value = fmtDate(start)
    }
    if (!periodEnd.value) periodEnd.value = fmtDate(new Date())
    hour.value = data?.end_of_shift_hour ?? 18
    minute.value = data?.end_of_shift_minute ?? 0
    askNote.value = !!(data as any)?.ask_note_on_record
  } catch (e: any) {
    error.value = e.message || 'Не удалось загрузить настройки'
  } finally {
    loading.value = false
  }
}

const save = async () => {
  if (saving.value) return
  error.value = ''
  if (!periodStart.value || !periodEnd.value) {
    error.value = 'Укажите обе даты периода'
    return
  }
  if (periodStart.value > periodEnd.value) {
    error.value = 'Начало периода не может быть позже окончания'
    return
  }
  try {
    saving.value = true
    await updateSettings({
      ask_note_on_record: askNote.value,
      end_of_shift_hour: Number(hour.value) || 0,
      end_of_shift_minute: Number(minute.value) || 0,
      period_start: periodStart.value,
      period_end: periodEnd.value,
    })
    flashSaved()
  } catch (e: any) {
    error.value = e.message || 'Не удалось сохранить настройки'
  } finally {
    saving.value = false
  }
}

const goBack = () => {
  if (window.history.length > 1) router.back()
  else router.push('/app')
}

onMounted(loadSettings)
</script>

<template>
  <div class="screen settings-screen">
    <header class="settings-header">
      <button class="back-btn" @click="goBack" title="Вернуться на главный экран">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
          <line x1="19" y1="12" x2="5" y2="12"/>
          <polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <h2>Настройки</h2>
    </header>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-if="loading" class="loading-note">Загружаю…</div>

    <template v-else>
      <section class="card">
        <div class="card-title">Период отчёта</div>
        <div class="period-row">
          <input type="date" v-model="periodStart" title="Начало периода отчёта" />
          <span class="dash">—</span>
          <input type="date" v-model="periodEnd" title="Окончание периода отчёта" />
        </div>
        <div class="hint">
          За этот период считается сверхнорма и строится отчёт. Сейчас: <b>{{ periodLabel }}</b>
        </div>
      </section>

      <section class="card">
        <div class="card-title">Время окончания смены</div>
        <div class="time-row">
          <input type="number" v-model.number="hour" min="0" max="23" placeholder="18" title="Часы окончания смены" />
          <span class="colon">:</span>
          <input type="number" v-model.number="minute" min="0" max="59" placeholder="00" title="Минуты окончания смены" />
        </div>
        <div class="hint">Всё, что зафиксировано позже этого времени, считается переработкой.</div>
      </section>

      <section class="card">
        <div class="card-title">Поведение</div>

        <div class="toggle-row">
          <div class="toggle-text">
            <span class="toggle-title">Спрашивать комментарий при фиксации</span>
            <span class="toggle-hint">После нажатия «Зафиксировать» откроется окно для заметки</span>
          </div>
          <button
            class="switch"
            :class="{ 'switch-on': askNote }"
            @click="askNote = !askNote"
            :title="askNote ? 'Выключить вопрос о комментарии' : 'Включить вопрос о комментарии'"
          ><span class="knob"></span></button>
        </div>

        <div class="divider"></div>

        <div class="toggle-row">
          <div class="toggle-text">
            <span class="toggle-title">Полная анимация</span>
            <span class="toggle-hint">Принудительное включение анимации без проверки настройки устройства</span>
          </div>
          <button
            class="switch"
            :class="{ 'switch-on': fullAnimation }"
            @click="toggleAnimation"
            :title="fullAnimation ? 'Следовать настройкам системы' : 'Всегда показывать полную анимацию'"
          ><span class="knob"></span></button>
        </div>

        <div class="divider"></div>

        <div class="toggle-row">
          <div class="toggle-text">
            <span class="toggle-title">Звук при фиксации</span>
            <span class="toggle-hint">Короткий «тик» в момент записи</span>
          </div>
          <button
            class="switch"
            :class="{ 'switch-on': soundOn }"
            @click="toggleSound"
            :title="soundOn ? 'Выключить звук' : 'Включить звук'"
          ><span class="knob"></span></button>
        </div>
      </section>

      <button
        class="save-btn"
        @click="save"
        :disabled="saving"
        title="Сохранить настройки в аккаунте"
      >{{ saving ? 'Сохраняю…' : saveText }}</button>

      <p class="foot-note">Период и время хранятся в аккаунте — на всех устройствах будут одинаковыми. Анимация и звук — только на этом устройстве.</p>
    </template>
  </div>
</template>

<style scoped>
.settings-screen {
  min-height: 100vh;
  background: #f0f4ff;
  padding: 24px 32px 40px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 600px;
  margin: 0 auto;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settings-header h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: #1a1d21;
}

.back-btn {
  width: 38px;
  height: 38px;
  border: 1px solid #dfe4ee;
  border-radius: 10px;
  background: #ffffff;
  color: #4b5563;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.back-btn:hover {
  background: #eef3ff;
  color: #2563eb;
}

.card {
  background: #ffffff;
  border: 1px solid #e5e8ef;
  border-radius: 14px;
  padding: 18px 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}

.card-title {
  font-size: 13px;
  font-weight: 700;
  color: #8b93a1;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 12px;
}

.period-row,
.time-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.period-row input {
  flex: 1;
  min-width: 0;
}

.time-row input {
  width: 72px;
  text-align: center;
}

input[type='date'],
input[type='number'] {
  padding: 10px 12px;
  border: 1px solid #dfe4ee;
  border-radius: 10px;
  font-size: 15px;
  font-family: inherit;
  color: #1a1d21;
  background: #ffffff;
}

input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.dash,
.colon {
  color: #8b93a1;
  font-weight: 700;
}

.hint {
  margin-top: 10px;
  font-size: 12.5px;
  line-height: 1.5;
  color: #8b93a1;
}

.hint b {
  color: #2563eb;
  font-weight: 700;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 4px 0;
}

.toggle-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.toggle-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

.toggle-hint {
  font-size: 12px;
  color: #8b93a1;
  line-height: 1.45;
}

.switch {
  flex: 0 0 auto;
  width: 52px;
  height: 30px;
  border: none;
  border-radius: 999px;
  background: #dfe4ee;
  position: relative;
  cursor: pointer;
  transition: background 0.22s ease;
  padding: 0;
}

.switch-on {
  background: #2563eb;
}

.knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.22s cubic-bezier(0.34, 1.4, 0.64, 1);
}

.switch-on .knob {
  transform: translateX(22px);
}

.divider {
  height: 1px;
  background: #eef1f6;
  margin: 14px 0;
}

.save-btn {
  margin-top: 4px;
  padding: 14px 18px;
  border: none;
  border-radius: 12px;
  background: #2563eb;
  color: #ffffff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s, border-radius 0.2s;
}

.save-btn:hover {
  background: #1d4ed8;
}

.save-btn:disabled {
  opacity: 0.7;
  cursor: default;
}

.save-btn-green {
  background: #16a34a;
  border-radius: 200px;
}

.foot-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #9aa3b2;
  text-align: center;
}

.error-box {
  padding: 12px 14px;
  border-radius: 10px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 13px;
}

.loading-note {
  color: #8b93a1;
  font-size: 14px;
}

@media (max-width: 480px) {
  .settings-screen {
    padding: 16px 14px 28px;
  }

  .card {
    padding: 16px 14px;
  }

  .period-row input {
    font-size: 14px;
    padding: 9px 8px;
  }

  .toggle-title {
    font-size: 14px;
  }
}
</style>