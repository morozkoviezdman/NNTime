// Суперклиент Supabase. Передаём URL проекта и ключ клиента.
// Ключ браузера — это параметр "publishable" (сейчас sb_publishable_xxx);
// он безопасен для браузера, так как в базе стоят RLS-правила.
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
export const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true, // сессию держим в localStorage между перезагрузками
    autoRefreshToken: true,
  },
})
