/**
 * [性质]: [核心] Supabase 数据库生成的原始类型定义
 * [Input]: Supabase CLI 代码生成工具
 * [Output]: 全局数据库表结构/视图/辅助类型定义
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ============================================================================
// 账户类型枚举
// ============================================================================

export type AccountClass = 'real' | 'nominal';
export type AccountType = 'asset' | 'liability' | 'income' | 'expense' | 'equity';
export type AccountSubtype = 'cash' | 'checking' | 'savings' | 'investment' | 'receivable' | 'credit_card' | 'loan' | 'payable';

// 交易关联类型
export type TransactionLinkType = 'reimbursement' | 'refund' | 'split' | 'correction';

// 交易性质
export type TransactionNature = 'regular' | 'unexpected' | 'periodic';

// 校准来源
export type CalibrationSource = 'manual' | 'import';

// ============================================================================
// 系统账户 ID 常量
// ============================================================================

export const SYSTEM_ACCOUNT_IDS = {
  ASSET_ROOT: '00000000-0000-0000-0000-000000000001',
  LIABILITY_ROOT: '00000000-0000-0000-0000-000000000002',
  INCOME_ROOT: '00000000-0000-0000-0000-000000000003',
  EXPENSE_ROOT: '00000000-0000-0000-0000-000000000004',
  EQUITY_ROOT: '00000000-0000-0000-0000-000000000005',
  OPENING_BALANCE: '00000000-0000-0000-0000-000000000006',
} as const;

// ============================================================================
// 数据库接口定义
// ============================================================================

export interface Database {
  public: {
    Tables: {
      // ========================================================================
      // 账户表 (accounts)
      // ========================================================================
      accounts: {
        Row: {
          id: string
          parent_id: string | null
          name: string
          full_path: string | null
          account_class: AccountClass
          type: AccountType
          subtype: AccountSubtype | null
          is_group: boolean
          is_system: boolean
          is_active: boolean
          currency: string | null
          credit_limit: number | null
          statement_day: number | null
          due_day: number | null
          sort_order: number
          created_at: string
          updated_at: string
          deactivated_at: string | null
        }
        Insert: {
          id?: string
          parent_id?: string | null
          name: string
          full_path?: string | null
          account_class: AccountClass
          type: AccountType
          subtype?: AccountSubtype | null
          is_group?: boolean
          is_system?: boolean
          is_active?: boolean
          currency?: string | null
          credit_limit?: number | null
          statement_day?: number | null
          due_day?: number | null
          sort_order?: number
          created_at?: string
          updated_at?: string
          deactivated_at?: string | null
        }
        Update: {
          id?: string
          parent_id?: string | null
          name?: string
          full_path?: string | null
          account_class?: AccountClass
          type?: AccountType
          subtype?: AccountSubtype | null
          is_group?: boolean
          is_system?: boolean
          is_active?: boolean
          currency?: string | null
          credit_limit?: number | null
          statement_day?: number | null
          due_day?: number | null
          sort_order?: number
          created_at?: string
          updated_at?: string
          deactivated_at?: string | null
        }
        Relationships: []
      }

      // ========================================================================
      // 项目表 (projects)
      // ========================================================================
      projects: {
        Row: {
          id: string
          name: string
          description: string | null
          start_date: string | null
          end_date: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          start_date?: string | null
          end_date?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          start_date?: string | null
          end_date?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      // ========================================================================
      // 交易表 (transactions)
      // ========================================================================
      transactions: {
        Row: {
          id: string
          date: string
          from_account_id: string
          to_account_id: string
          amount: number
          from_amount: number | null
          to_amount: number | null
          description: string | null
          type: 'expense' | 'income' | 'transfer'
          linked_transaction_id: string | null
          link_type: TransactionLinkType | null
          is_opening: boolean
          is_large_expense: boolean
          location: string | null
          project_id: string | null
          is_starred: boolean
          needs_review: boolean
          nature: TransactionNature
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          date: string
          from_account_id: string
          to_account_id: string
          amount: number
          from_amount?: number | null
          to_amount?: number | null
          description?: string | null
          linked_transaction_id?: string | null
          link_type?: TransactionLinkType | null
          is_opening?: boolean
          is_large_expense?: boolean
          location?: string | null
          project_id?: string | null
          is_starred?: boolean
          needs_review?: boolean
          nature?: TransactionNature
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          date?: string
          from_account_id?: string
          to_account_id?: string
          amount?: number
          from_amount?: number | null
          to_amount?: number | null
          description?: string | null
          linked_transaction_id?: string | null
          link_type?: TransactionLinkType | null
          is_opening?: boolean
          is_large_expense?: boolean
          location?: string | null
          project_id?: string | null
          is_starred?: boolean
          needs_review?: boolean
          nature?: TransactionNature
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      // ========================================================================
      // 校准表 (calibrations)
      // ========================================================================
      calibrations: {
        Row: {
          id: string
          account_id: string
          balance: number
          date: string
          source: CalibrationSource
          is_opening: boolean
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          balance: number
          date: string
          source?: CalibrationSource
          is_opening?: boolean
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          balance?: number
          date?: string
          source?: CalibrationSource
          is_opening?: boolean
          note?: string | null
          created_at?: string
        }
        Relationships: []
      }

      // 向后兼容别名
      snapshots: {
        Row: {
          id: string
          account_id: string
          balance: number
          date: string
          source: CalibrationSource
          is_opening: boolean
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          balance: number
          date: string
          source?: CalibrationSource
          is_opening?: boolean
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          balance?: number
          date?: string
          source?: CalibrationSource
          is_opening?: boolean
          note?: string | null
          created_at?: string
        }
        Relationships: []
      }

      // ========================================================================
      // 周期任务表 (periodic_tasks)
      // ========================================================================
      periodic_tasks: {
        Row: {
          id: string
          from_account_id: string
          to_account_id: string
          amount: number
          from_amount: number | null
          to_amount: number | null
          description: string | null
          frequency: string
          next_run_date: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          from_account_id: string
          to_account_id: string
          amount: number
          from_amount?: number | null
          to_amount?: number | null
          description?: string | null
          frequency?: string
          next_run_date: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          from_account_id?: string
          to_account_id?: string
          amount?: number
          from_amount?: number | null
          to_amount?: number | null
          description?: string | null
          frequency?: string
          next_run_date?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      // ========================================================================
      // 对账问题表 (reconciliation_issues)
      // ========================================================================
      reconciliation_issues: {
        Row: {
          id: string
          account_id: string
          start_calibration_id: string | null
          end_calibration_id: string | null
          period_start: string
          period_end: string
          expected_delta: number
          actual_delta: number
          diff: number
          status: 'open' | 'resolved' | 'ignored'
          source: 'manual' | 'calibration' | 'auto'
          metadata: Json | null
          created_at: string
          resolved_at: string | null
        }
        Insert: {
          id?: string
          account_id: string
          start_calibration_id?: string | null
          end_calibration_id?: string | null
          period_start: string
          period_end: string
          expected_delta: number
          actual_delta: number
          diff: number
          status?: 'open' | 'resolved' | 'ignored'
          source?: 'manual' | 'calibration' | 'auto'
          metadata?: Json | null
          created_at?: string
          resolved_at?: string | null
        }
        Update: {
          id?: string
          account_id?: string
          start_calibration_id?: string | null
          end_calibration_id?: string | null
          period_start?: string
          period_end?: string
          expected_delta?: number
          actual_delta?: number
          diff?: number
          status?: 'open' | 'resolved' | 'ignored'
          source?: 'manual' | 'calibration' | 'auto'
          metadata?: Json | null
          created_at?: string
          resolved_at?: string | null
        }
        Relationships: []
      }

      // ========================================================================
      // 统计缓存表 (statistics_cache)
      // ========================================================================
      statistics_cache: {
        Row: {
          id: string
          data: Json
          account_id: string | null
          period_start: string | null
          period_end: string | null
          computed_at: string
          valid_until: string | null
          cache_type: string
        }
        Insert: {
          id: string
          data: Json
          account_id?: string | null
          period_start?: string | null
          period_end?: string | null
          computed_at?: string
          valid_until?: string | null
          cache_type?: string
        }
        Update: {
          id?: string
          data?: Json
          account_id?: string | null
          period_start?: string | null
          period_end?: string | null
          computed_at?: string
          valid_until?: string | null
          cache_type?: string
        }
        Relationships: []
      }

      // ========================================================================
      // 记账设置表 (bookkeeping_settings)
      // ========================================================================
      bookkeeping_settings: {
        Row: {
          id: boolean
          thousand_separator: boolean
          decimal_places: number
          default_currency: string
          calibration_reminder_enabled: boolean
          calibration_interval_days: number
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
          calibration_reminder_enabled?: boolean
          calibration_interval_days?: number
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
          calibration_reminder_enabled?: boolean
          calibration_interval_days?: number
          expense_color?: string
          income_color?: string
          transfer_color?: string
          updated_at?: string
        }
        Relationships: []
      }

      // ========================================================================
      // 操作日志表 (operation_logs)
      // ========================================================================
      operation_logs: {
        Row: {
          id: string
          type: string
          created_at: string
          filename: string
          total_rows: number
          valid_count: number
          duplicate_count: number
          invalid_count: number
          uploaded_count: number
          status: 'completed' | 'partial' | 'failed' | 'rolled_back'
          transaction_ids: string[]
          details: Json | null
          notes: string | null
          // Legacy fields mapping if needed, but clean definition preferred
          rows_valid_uploaded: Json | null
          rows_valid_skipped: Json | null
          rows_duplicate_uploaded: Json | null
          rows_duplicate_skipped: Json | null
          rows_error: Json | null
        }
        Insert: {
          id?: string
          type?: string
          created_at?: string
          filename: string
          total_rows: number
          valid_count?: number
          duplicate_count?: number
          invalid_count?: number
          uploaded_count?: number
          status: 'completed' | 'partial' | 'failed' | 'rolled_back'
          transaction_ids?: string[]
          details?: Json | null
          notes?: string | null
          rows_valid_uploaded?: Json | null
          rows_valid_skipped?: Json | null
          rows_duplicate_uploaded?: Json | null
          rows_duplicate_skipped?: Json | null
          rows_error?: Json | null
        }
        Update: {
          id?: string
          type?: string
          created_at?: string
          filename?: string
          total_rows?: number
          valid_count?: number
          duplicate_count?: number
          invalid_count?: number
          uploaded_count?: number
          status?: 'completed' | 'partial' | 'failed' | 'rolled_back'
          transaction_ids?: string[]
          details?: Json | null
          notes?: string | null
          rows_valid_uploaded?: Json | null
          rows_valid_skipped?: Json | null
          rows_duplicate_uploaded?: Json | null
          rows_duplicate_skipped?: Json | null
          rows_error?: Json | null
        }
        Relationships: []
      }


      // ========================================================================
      // 每日打卡表 (daily_checkins)
      // ========================================================================
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

      // ========================================================================
      // 预算计划表 (budget_plans)
      // ========================================================================
      budget_plans: {
        Row: {
          id: string
          plan_type: 'category' | 'total'
          category_account_id: string | null  // 关联费用账户（标签）
          period: 'weekly' | 'monthly'
          hard_limit: number
          limit_currency: string
          soft_limit_enabled: boolean
          status: 'active' | 'expired' | 'paused'
          account_filter_mode: 'all' | 'include' | 'exclude'
          account_filter_ids: string[] | null
          start_date: string
          end_date: string
          included_category_ids: string[] | null  // 纳入统计的费用账户ID列表
          round_number: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          plan_type: 'category' | 'total'
          category_account_id?: string | null
          period?: 'weekly' | 'monthly'
          hard_limit: number
          limit_currency?: string
          soft_limit_enabled?: boolean
          status?: 'active' | 'expired' | 'paused'
          account_filter_mode?: 'all' | 'include' | 'exclude'
          account_filter_ids?: string[] | null
          start_date: string
          end_date: string
          included_category_ids?: string[] | null
          round_number?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          plan_type?: 'category' | 'total'
          category_account_id?: string | null
          period?: 'weekly' | 'monthly'
          hard_limit?: number
          limit_currency?: string
          soft_limit_enabled?: boolean
          status?: 'active' | 'expired' | 'paused'
          account_filter_mode?: 'all' | 'include' | 'exclude'
          account_filter_ids?: string[] | null
          start_date?: string
          end_date?: string
          included_category_ids?: string[] | null
          round_number?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      // ========================================================================
      // 预算周期记录表 (budget_period_records)
      // ========================================================================
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

      // ========================================================================
      // 汇率表 (currency_rates)
      // ========================================================================
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

    // ==========================================================================
    // 视图
    // ==========================================================================
    Views: {
      tags_view: {
        Row: {
          id: string
          name: string
          kind: 'expense' | 'income' | 'transfer'
          is_active: boolean
          parent_id: string | null
          full_path: string | null
          sort_order: number
        }
        Relationships: []
      }
      real_accounts_view: {
        Row: {
          id: string
          parent_id: string | null
          name: string
          type: AccountType
          subtype: AccountSubtype | null
          currency: string | null
          is_group: boolean
          is_active: boolean
          full_path: string | null
          credit_limit: number | null
          statement_day: number | null
          due_day: number | null
          sort_order: number
        }
        Relationships: []
      }
      account_balances_view: {
        Row: {
          account_id: string
          name: string
          type: AccountType
          currency: string | null
          balance: number
        }
        Relationships: []
      }
    }
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

// ============================================================================
// 导出常用行类型
// ============================================================================

export type AccountRow = Database['public']['Tables']['accounts']['Row'];
export type AccountInsert = Database['public']['Tables']['accounts']['Insert'];
export type AccountUpdate = Database['public']['Tables']['accounts']['Update'];

export type ProjectRow = Database['public']['Tables']['projects']['Row'];
export type ProjectInsert = Database['public']['Tables']['projects']['Insert'];

export type TransactionRow = Database['public']['Tables']['transactions']['Row'];
export type TransactionInsert = Database['public']['Tables']['transactions']['Insert'];
export type TransactionUpdate = Database['public']['Tables']['transactions']['Update'];

export type CalibrationRow = Database['public']['Tables']['calibrations']['Row'];
export type CalibrationInsert = Database['public']['Tables']['calibrations']['Insert'];

// 向后兼容别名
export type SnapshotRow = Database['public']['Tables']['snapshots']['Row'];
export type SnapshotInsert = Database['public']['Tables']['snapshots']['Insert'];

export type PeriodicTaskRow = Database['public']['Tables']['periodic_tasks']['Row'];
export type PeriodicTaskInsert = Database['public']['Tables']['periodic_tasks']['Insert'];

export type ReconciliationIssueRow = Database['public']['Tables']['reconciliation_issues']['Row'];

export type StatisticsCacheRow = Database['public']['Tables']['statistics_cache']['Row'];

export type BookkeepingSettingsRow = Database['public']['Tables']['bookkeeping_settings']['Row'];

export type ImportBatchRow = Database['public']['Tables']['operation_logs']['Row'];

export type DailyCheckinRow = Database['public']['Tables']['daily_checkins']['Row'];

export type BudgetPlanRow = Database['public']['Tables']['budget_plans']['Row'];
export type BudgetPeriodRecordRow = Database['public']['Tables']['budget_period_records']['Row'];

export type CurrencyRateRow = Database['public']['Tables']['currency_rates']['Row'];

// 视图类型
export type TagViewRow = Database['public']['Views']['tags_view']['Row'];
export type RealAccountViewRow = Database['public']['Views']['real_accounts_view']['Row'];
export type AccountBalanceViewRow = Database['public']['Views']['account_balances_view']['Row'];



// ============================================================================
// 扩展类型（用于前端展示）
// ============================================================================

/** 账户（含余额，用于前端展示） */
export interface AccountWithBalance extends AccountRow {
  balance: number;
  children?: AccountWithBalance[];
  parent?: { name: string } | null;
}

/** 交易（含账户信息，用于前端展示） */
export interface TransactionWithAccounts extends TransactionRow {
  from_account?: AccountWithBalance; // Use AccountWithBalance or similar that includes parent
  to_account?: AccountWithBalance;
  project?: ProjectRow;
}

/** 统计数据 */
export interface ExpenseStatistics {
  total_expense_30d: number;
  total_expense_90d: number;
  total_expense_ytd: number;
  total_income_30d: number;
  total_income_90d: number;
  total_income_ytd: number;
  avg_expense_90d: number;
  stddev_expense_90d: number;
  avg_income_90d: number;
  stddev_income_90d: number;
  computed_at: string;
}

/** 预算计划（含周期记录，用于前端展示） */
export type BudgetPlanWithRecords = BudgetPlanRow & {
  records: BudgetPeriodRecordRow[];
};
