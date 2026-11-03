// Типы БД для проекта (PostgreSQL / Supabase)
// Генерируются на основе схемы: settings и work_logs

export type Database = {
  public: {
    Tables: {
      settings: {
        Row: {
          end_of_shift_hour: number
          id: string
          period_end: string
          period_start: string
          updated_at: string
        }
        Insert: {
          end_of_shift_hour: number
          id?: string
          period_end: string
          period_start: string
          updated_at?: string
        }
        Update: {
          end_of_shift_hour?: number
          id?: string
          period_end?: string
          period_start?: string
          updated_at?: string
        }
      }
      work_logs: {
        Row: {
          created_at: string
          date: string
          id: string
          note: string | null
          overtime_minutes: number
          press_time: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          note?: string | null
          overtime_minutes: number
          press_time: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          overtime_minutes?: number
          press_time?: string
          user_id?: string
        }
      }
    }
    Views: {
      [_ in string]: never
    }
    Functions: {
      [_ in string]: never
    }
    Enums: {
      [_ in string]: never
    }
    CompositeTypes: {
      [_ in string]: never
    }
  }
}
