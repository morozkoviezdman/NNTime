import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { supabase } from '@/supabaseClient'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const user = ref<User | null>(null)
  const loading = ref(false)

  // Быстрый доступ: уже авторизован?
  const isAuthenticated = computed(() => !!session.value && !!user.value)

  // Загрузка сессии при запуске приложения
  async function loadSession() {
    loading.value = true
    try {
      const { data, error } = await supabase.auth.getSession()
      session.value = data.session ?? null
      user.value = data.session?.user ?? null
      if (error) console.error('[auth] loadSession error', error)
    } finally {
      loading.value = false
    }
  }

  // Авторизация email+password
  async function signInWithPassword(email: string, password: string) {
    loading.value = true
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      session.value = data.session
      user.value = data.user
      return { ok: true }
    } finally {
      loading.value = false
    }
  }

  // Регистрация
  async function signUp(
    email: string,
    password: string,
    options?: { emailRedirectTo?: string; data?: Record<string, string> },
  ) {
    loading.value = true
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        ...options,
      })
      if (error) throw error
      session.value = data.session
      user.value = data.user
      return { ok: true, session: data.session, user: data.user }
    } finally {
      loading.value = false
    }
  }

  // Вход через OAuth (Google, Telegram)
  async function signInWithOAuth(provider: string) {
    loading.value = true
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider as any,
        options: {
          redirectTo: window.location.origin,
        },
      })
      if (error) throw error
      // Перенаправление происходит на callback Supabase,
      // после чего сессия автоматически появится в стое.
      return data
    } finally {
      loading.value = false
    }
  }

  // Выход
  async function signOut() {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      session.value = null
      user.value = null
    } catch (e) {
      console.error('[auth] signOut error', e)
    }
  }

  // Слушать изменения сессии (восстановление при входе, выходе)
  function onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return supabase.auth.onAuthStateChange((event, next) => {
      session.value = next
      user.value = next?.user ?? null
      callback(event, next)
    })
  }

  return {
    session,
    user,
    loading,
    isAuthenticated,
    loadSession,
    signInWithPassword,
    signUp,
    signInWithOAuth,
    signOut,
    onAuthStateChange,
  }
})
