export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string
          name: string
          type: string
          currency: string
          created_at: string
          statement_date: number | null
          due_date: number | null
          credit_limit: number | null
        }
        Insert: {
          id?: string
          name: string
          type: string
          currency: string
          created_at?: string
          statement_date?: number | null
          due_date?: number | null
          credit_limit?: number | null
        }
        Update: {
          id?: string
          name?: string
          type?: string
          currency?: string
          created_at?: string
          statement_date?: number | null
          due_date?: number | null
          credit_limit?: number | null
        }
      }
      // ... (其他表保持不变，因为没有 JSON 字段变动)
      transactions: {
        Row: {
          id: string
          account_id: string
          type: 'income' | 'expense' | 'transfer'
          amount: number
          category: string
          description: string | null
          date: string
          created_at: string
          nominal_amount: number | null
          nominal_currency: string | null
          transfer_group_id: string | null
        }
        Insert: {
          id?: string
          account_id: string
          type: 'income' | 'expense' | 'transfer'
          amount: number
          category: string
          description?: string | null
          date: string
          created_at?: string
          nominal_amount?: number | null
          nominal_currency?: string | null
          transfer_group_id?: string | null
        }
        Update: {
          id?: string
          account_id?: string
          type?: 'income' | 'expense' | 'transfer'
          amount?: number
          category?: string
          description?: string | null
          date?: string
          created_at?: string
          nominal_amount?: number | null
          nominal_currency?: string | null
          transfer_group_id?: string | null
        }
      }
      snapshots: {
        Row: {
          id: string
          account_id: string
          balance: number
          date: string
          created_at: string
          type: string
        }
        Insert: {
          id?: string
          account_id: string
          balance: number
          date: string
          created_at?: string
          type?: string
        }
        Update: {
          id?: string
          account_id?: string
          balance?: number
          date?: string
          created_at?: string
          type?: string
        }
      }
      periodic_tasks: {
        Row: {
          id: string
          account_id: string
          amount: number
          category: string
          description: string | null
          frequency: string
          next_run_date: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          amount: number
          category: string
          description?: string | null
          frequency?: string
          next_run_date: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          amount?: number
          category?: string
          description?: string | null
          frequency?: string
          next_run_date?: string
          is_active?: boolean
          created_at?: string
        }
      }
      reconciliation_issues: {
        Row: {
          id: string
          account_id: string
          start_snapshot_id: string | null
          end_snapshot_id: string | null
          period_start: string
          period_end: string
          expected_delta: number
          actual_delta: number
          diff: number
          status: string
          source: string
          metadata: Json | null
          created_at: string
          resolved_at: string | null
        }
        Insert: {
          id?: string
          account_id: string
          start_snapshot_id?: string | null
          end_snapshot_id?: string | null
          period_start: string
          period_end: string
          expected_delta: number
          actual_delta: number
          diff: number
          status?: string
          source?: string
          metadata?: Json | null
          created_at?: string
          resolved_at?: string | null
        }
        Update: {
          id?: string
          account_id?: string
          start_snapshot_id?: string | null
          end_snapshot_id?: string | null
          period_start?: string
          period_end?: string
          expected_delta?: number
          actual_delta?: number
          diff?: number
          status?: string
          source?: string
          metadata?: Json | null
          created_at?: string
          resolved_at?: string | null
        }
      }
      bookkeeping_settings: {
        Row: {
          id: boolean
          thousand_separator: boolean
          decimal_places: number
          default_currency: string
          auto_snapshot_enabled: boolean
          snapshot_interval_days: number
          snapshot_tolerance: number
          expense_color: string
          income_color: string
          transfer_color: string
          updated_at: string
        }
        Insert: {
          id?: boolean
          thousand_separator?: boolean
          decimal_places?: number
          default_currency?: string
          auto_snapshot_enabled?: boolean
          snapshot_interval_days?: number
          snapshot_tolerance?: number
          expense_color?: string
          income_color?: string
          transfer_color?: string
          updated_at?: string
        }
        Update: {
          id?: boolean
          thousand_separator?: boolean
          decimal_places?: number
          default_currency?: string
          auto_snapshot_enabled?: boolean
          snapshot_interval_days?: number
          snapshot_tolerance?: number
          expense_color?: string
          income_color?: string
          transfer_color?: string
          updated_at?: string
        }
      }
      bookkeeping_tags: {
        Row: {
          id: string
          kind: 'expense' | 'income' | 'transfer'
          name: string
          description: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          kind: 'expense' | 'income' | 'transfer'
          name: string
          description?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          kind?: 'expense' | 'income' | 'transfer'
          name?: string
          description?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      transaction_tag_links: {
        Row: {
          transaction_id: string
          tag_id: string
          created_at: string
        }
        Insert: {
          transaction_id: string
          tag_id: string
          created_at?: string
        }
        Update: {
          transaction_id?: string
          tag_id?: string
          created_at?: string
        }
      }
    }
    Views: {
      bookkeeping_available_tags: {
        Row: {
          id: string
          kind: 'expense' | 'income' | 'transfer'
          name: string
          is_active: boolean
          from_settings: boolean
        }
      }
    }
  }
}
