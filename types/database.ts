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
        Relationships: []
      }
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
        Relationships: []
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
        Relationships: []
      }
      periodic_tasks: {
        Row: {
          id: string
          account_id: string
          type: 'income' | 'expense' | 'transfer'
          amount: number
          category: string
          description: string | null
          frequency: string
          next_run_date: string
          is_active: boolean
          created_at: string
          to_account_id: string | null
          to_amount: number | null
        }
        Insert: {
          id?: string
          account_id: string
          type?: 'income' | 'expense' | 'transfer'
          amount: number
          category: string
          description?: string | null
          frequency?: string
          next_run_date: string
          is_active?: boolean
          created_at?: string
          to_account_id?: string | null
          to_amount?: number | null
        }
        Update: {
          id?: string
          account_id?: string
          type?: 'income' | 'expense' | 'transfer'
          amount?: number
          category?: string
          description?: string | null
          frequency?: string
          next_run_date?: string
          is_active?: boolean
          created_at?: string
          to_account_id?: string | null
          to_amount?: number | null
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      daily_checkins: {
        Row: {
          id: string
          check_date: string
          checked_at: string
        }
        Insert: {
          id?: string
          check_date: string
          checked_at?: string
        }
        Update: {
          id?: string
          check_date?: string
          checked_at?: string
        }
        Relationships: []
      }
      budget_plans: {
        Row: {
          id: string
          plan_type: 'category' | 'total'
          category_name: string | null
          period: 'weekly' | 'monthly'
          hard_limit: number
          limit_currency: string
          soft_limit_enabled: boolean
          status: 'active' | 'expired' | 'paused'
          account_filter_mode: 'all' | 'include' | 'exclude'
          account_filter_ids: string[] | null
          start_date: string
          end_date: string
          included_categories: string[] | null
          round_number: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          plan_type: 'category' | 'total'
          category_name?: string | null
          period?: 'weekly' | 'monthly'
          hard_limit: number
          limit_currency?: string
          soft_limit_enabled?: boolean
          status?: 'active' | 'expired' | 'paused'
          account_filter_mode?: 'all' | 'include' | 'exclude'
          account_filter_ids?: string[] | null
          start_date: string
          end_date: string
          included_categories?: string[] | null
          round_number?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          plan_type?: 'category' | 'total'
          category_name?: string | null
          period?: 'weekly' | 'monthly'
          hard_limit?: number
          limit_currency?: string
          soft_limit_enabled?: boolean
          status?: 'active' | 'expired' | 'paused'
          account_filter_mode?: 'all' | 'include' | 'exclude'
          account_filter_ids?: string[] | null
          start_date?: string
          end_date?: string
          included_categories?: string[] | null
          round_number?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      budget_period_records: {
        Row: {
          id: string
          plan_id: string
          round_number: number
          period_index: number
          period_start: string
          period_end: string
          actual_amount: number | null
          hard_limit: number
          soft_limit: number | null
          indicator_status: 'star' | 'green' | 'red' | 'pending'
          created_at: string
        }
        Insert: {
          id?: string
          plan_id: string
          round_number: number
          period_index: number
          period_start: string
          period_end: string
          actual_amount?: number | null
          hard_limit: number
          soft_limit?: number | null
          indicator_status?: 'star' | 'green' | 'red' | 'pending'
          created_at?: string
        }
        Update: {
          id?: string
          plan_id?: string
          round_number?: number
          period_index?: number
          period_start?: string
          period_end?: string
          actual_amount?: number | null
          hard_limit?: number
          soft_limit?: number | null
          indicator_status?: 'star' | 'green' | 'red' | 'pending'
          created_at?: string
        }
        Relationships: []
      }
      currency_rates: {
        Row: {
          from_currency: string
          to_currency: string
          rate: number
          updated_at: string
        }
        Insert: {
          from_currency: string
          to_currency: string
          rate: number
          updated_at?: string
        }
        Update: {
          from_currency?: string
          to_currency?: string
          rate?: number
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
      }
    }
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

// 导出常用行类型
export type SnapshotRow = Database['public']['Tables']['snapshots']['Row'];
export type AccountRow = Database['public']['Tables']['accounts']['Row'];
export type TransactionRow = Database['public']['Tables']['transactions']['Row'];
export type PeriodicTaskRow = Database['public']['Tables']['periodic_tasks']['Row'];
export type ReconciliationIssueRow = Database['public']['Tables']['reconciliation_issues']['Row'];
export type DailyCheckinRow = Database['public']['Tables']['daily_checkins']['Row'];
export type BudgetPlanRow = Database['public']['Tables']['budget_plans']['Row'];
export type BudgetPeriodRecordRow = Database['public']['Tables']['budget_period_records']['Row'];
export type CurrencyRateRow = Database['public']['Tables']['currency_rates']['Row'];
