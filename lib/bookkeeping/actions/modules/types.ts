/**
 * [性质]: [类型] 模块内部类型定义
 * [Input]: database.ts
 * [Output]: 聚合导出类型
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
/**
 * 类型导出模块
 */

// 从 database.ts 重新导出需要的类型
export type {
    AccountRow,
    AccountWithBalance,
    TransactionRow,
    TransactionWithAccounts,
    SnapshotRow,
    CalibrationRow,
    BudgetPlanRow,
    BudgetPeriodRecordRow,
    BudgetPlanWithRecords,
    ExpenseStatistics,
    TransactionNature,
    TransactionLinkType,
    AccountType,
    AccountClass,
    AccountSubtype,
    CalibrationSource
} from '@/types/database';

export { SYSTEM_ACCOUNT_IDS } from '@/types/database';

// 交易过滤器接口
export interface TransactionFilter {
    type?: string;
    accountId?: string | string[];
    startDate?: string;
    endDate?: string;
    category?: string | string[];
    minAmount?: number;
    maxAmount?: number;
}

// 周期任务接口
export interface PeriodicTaskWithAccount {
    id: string;
    from_account_id: string;
    to_account_id: string;
    amount: number;
    from_amount?: number | null;
    to_amount?: number | null;
    description?: string | null;
    frequency: string;
    next_run_date: string;
    is_active: boolean;
    // 新增字段
    location?: string | null;
    project_id?: string | null;
    is_starred?: boolean;
    needs_review?: boolean;
    created_at?: string;
    updated_at?: string;
    // 关联数据
    from_account?: { name: string; currency: string; type?: string } | null;
    to_account?: { name: string; currency: string; type?: string } | null;
    project?: { name: string } | null;
}

// 标签类型
export type BookkeepingKind = 'expense' | 'income' | 'transfer';

// 注意：ImportResult 类型从 import-export.ts 导出，此处不再重复定义
