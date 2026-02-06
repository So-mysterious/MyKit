/**
 * [性质]: [功能] 预算管理模块
 * [Input]: Supabase
 * [Output]: 预算计划(BudgetPlan)与周期记录(BudgetPeriodRecord)的 CRUD
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */

import { supabase } from '@/lib/supabase/client';
import { BudgetPlanRow, BudgetPeriodRecordRow, BudgetPlanWithRecords } from '@/types/database';
import { getCurrencyRate } from './currency';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 预算重算项（用于重算对话框）
 */
export interface BudgetRecalculationItem {
    planId: string;
    planName: string;
    periodId: string;
    periodStart: string;
    periodEnd: string;
    oldValues: {
        actual_amount: number | null;
        indicator_status: string;
    };
    newValues: {
        actual_amount: number;
        indicator_status: string;
    };
}

// ============================================================================
// 预算计划 CRUD
// ============================================================================

/**
 * 统一预算计划查询函数
 */
export async function getBudgetPlans(options?: {
    type?: 'all' | 'category' | 'total';
    status?: 'active' | 'expired' | 'paused';
    includeRecords?: boolean;
}): Promise<BudgetPlanWithRecords[]> {
    const { type = 'all', status, includeRecords = true } = options || {};

    let query = supabase
        .from('budget_plans')
        .select(includeRecords ? `*, records:budget_period_records (*)` : '*')
        .order('created_at', { ascending: false });

    if (type !== 'all') {
        query = query.eq('plan_type', type);
    }

    if (status) {
        query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []) as unknown as BudgetPlanWithRecords[];
}

/**
 * 获取单个预算计划
 */
export async function getBudgetPlan(id: string): Promise<BudgetPlanWithRecords | null> {
    const { data, error } = await supabase
        .from('budget_plans')
        .select(`
            *,
            records:budget_period_records (*)
        `)
        .eq('id', id)
        .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data as BudgetPlanWithRecords | null;
}

/**
 * 计算周期的开始和结束日期
 */
export function calculatePeriodDates(startDate: string, period: 'weekly' | 'monthly', periodIndex: number): { start: string; end: string } {
    const start = new Date(startDate);

    if (period === 'weekly') {
        start.setDate(start.getDate() + (periodIndex - 1) * 7);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return {
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0],
        };
    } else {
        start.setMonth(start.getMonth() + (periodIndex - 1));
        const end = new Date(start);
        end.setMonth(end.getMonth() + 1);
        end.setDate(end.getDate() - 1);
        return {
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0],
        };
    }
}

/**
 * 计算计划结束日期（12个周期后）
 */
export function calculatePlanEndDate(startDate: string, period: 'weekly' | 'monthly'): string {
    const start = new Date(startDate);

    if (period === 'weekly') {
        start.setDate(start.getDate() + 84 - 1);
    } else {
        start.setMonth(start.getMonth() + 12);
        start.setDate(start.getDate() - 1);
    }

    return start.toISOString().split('T')[0];
}

export interface CreateBudgetPlanData {
    plan_type: 'category' | 'total';
    category_name?: string;
    period: 'weekly' | 'monthly';
    hard_limit: number;
    limit_currency?: string;
    soft_limit_enabled?: boolean;
    account_filter_mode?: 'all' | 'include' | 'exclude';
    account_filter_ids?: string[];
    included_categories?: string[];
    start_date: string;
}

/**
 * 创建预算计划
 */
export async function createBudgetPlan(data: CreateBudgetPlanData): Promise<BudgetPlanRow> {
    const endDate = calculatePlanEndDate(data.start_date, data.period);

    const { data: plan, error } = await supabase
        .from('budget_plans')
        .insert({
            plan_type: data.plan_type,
            category_account_id: data.category_name || null,
            period: data.period,
            hard_limit: data.hard_limit,
            limit_currency: data.limit_currency || 'CNY',
            soft_limit_enabled: data.soft_limit_enabled ?? true,
            status: 'active',
            account_filter_mode: data.account_filter_mode || 'all',
            account_filter_ids: data.account_filter_ids || null,
            start_date: data.start_date,
            end_date: endDate,
            included_category_ids: data.included_categories || null,
            round_number: 1,
        })
        .select()
        .single();

    if (error) throw error;

    const budgetPlan = plan as BudgetPlanRow;

    const periodRecords = [];
    for (let i = 1; i <= 12; i++) {
        const { start, end } = calculatePeriodDates(data.start_date, data.period, i);
        periodRecords.push({
            plan_id: budgetPlan.id,
            round_number: 1,
            period_index: i,
            period_start: start,
            period_end: end,
            hard_limit: data.hard_limit,
            soft_limit: null,
            indicator_status: 'pending' as any,
        });
    }

    const { error: recordsError } = await supabase
        .from('budget_period_records')
        .insert(periodRecords);

    if (recordsError) throw recordsError;

    return budgetPlan;
}

/**
 * 更新预算计划
 */
export async function updateBudgetPlan(
    id: string,
    data: Partial<Pick<BudgetPlanRow, 'hard_limit' | 'soft_limit_enabled' | 'account_filter_mode' | 'account_filter_ids' | 'included_category_ids' | 'status'>>
): Promise<void> {
    const { error } = await supabase
        .from('budget_plans')
        .update({
            ...data,
            updated_at: new Date().toISOString(),
        } as any)
        .eq('id', id);

    if (error) throw error;

    if (data.hard_limit !== undefined) {
        const today = new Date().toISOString().split('T')[0];
        await supabase
            .from('budget_period_records')
            .update({ hard_limit: data.hard_limit })
            .eq('plan_id', id)
            .gte('period_start', today);
    }
}

/**
 * 暂停/恢复预算计划
 */
export async function toggleBudgetPlanStatus(id: string, status: 'active' | 'paused'): Promise<void> {
    const { error } = await supabase
        .from('budget_plans')
        .update({ status, updated_at: new Date().toISOString() } as any)
        .eq('id', id);

    if (error) throw error;
}

/**
 * 删除预算计划
 */
export async function deleteBudgetPlan(id: string): Promise<void> {
    const { error } = await supabase
        .from('budget_plans')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

/**
 * 重启过期计划
 */
export async function restartBudgetPlan(
    id: string,
    options: {
        newHardLimit?: number;
        newStartDate?: string;
    } = {}
): Promise<void> {
    const { data: plan, error: fetchError } = await supabase
        .from('budget_plans')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError) throw fetchError;

    const budgetPlan = plan as BudgetPlanRow;
    const newStartDate = options.newStartDate || new Date().toISOString().split('T')[0];
    const newHardLimit = options.newHardLimit ?? budgetPlan.hard_limit;
    const newEndDate = calculatePlanEndDate(newStartDate, budgetPlan.period as any);
    const newRoundNumber = (budgetPlan.round_number || 1) + 1;

    const { error: updateError } = await supabase
        .from('budget_plans')
        .update({
            hard_limit: newHardLimit,
            start_date: newStartDate,
            end_date: newEndDate,
            round_number: newRoundNumber,
            status: 'active',
            updated_at: new Date().toISOString(),
        } as any)
        .eq('id', id);

    if (updateError) throw updateError;

    const periodRecords = [];
    for (let i = 1; i <= 12; i++) {
        const { start, end } = calculatePeriodDates(newStartDate, budgetPlan.period as any, i);
        periodRecords.push({
            plan_id: id,
            round_number: newRoundNumber,
            period_index: i,
            period_start: start,
            period_end: end,
            hard_limit: newHardLimit,
            soft_limit: null,
            indicator_status: 'pending' as any,
        });
    }

    const { error: recordsError } = await supabase
        .from('budget_period_records')
        .insert(periodRecords);

    if (recordsError) throw recordsError;
}

/**
 * 修改计划周期（会重置计划）
 */
export async function changeBudgetPlanPeriod(
    id: string,
    newPeriod: 'weekly' | 'monthly',
    newStartDate: string
): Promise<void> {
    const { data: plan, error: fetchError } = await supabase
        .from('budget_plans')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError) throw fetchError;

    const budgetPlan = plan as BudgetPlanRow;
    const newEndDate = calculatePlanEndDate(newStartDate, newPeriod);
    const newRoundNumber = (budgetPlan.round_number || 1) + 1;

    const { error: updateError } = await supabase
        .from('budget_plans')
        .update({
            period: newPeriod,
            start_date: newStartDate,
            end_date: newEndDate,
            round_number: newRoundNumber,
            updated_at: new Date().toISOString(),
        } as any)
        .eq('id', id);

    if (updateError) throw updateError;

    // 删除旧的周期记录
    await supabase
        .from('budget_period_records')
        .delete()
        .eq('plan_id', id)
        .eq('round_number', budgetPlan.round_number);

    // 创建新的 12 个周期
    const periodRecords = [];
    for (let i = 1; i <= 12; i++) {
        const { start, end } = calculatePeriodDates(newStartDate, newPeriod, i);
        periodRecords.push({
            plan_id: id,
            round_number: newRoundNumber,
            period_index: i,
            period_start: start,
            period_end: end,
            hard_limit: budgetPlan.hard_limit,
            soft_limit: null,
            indicator_status: 'pending' as any,
        });
    }

    const { error: recordsError } = await supabase
        .from('budget_period_records')
        .insert(periodRecords);

    if (recordsError) throw recordsError;
}

// ============================================================================
// 预算计算核心
// ============================================================================

/**
 * 获取指定周期内某分类的消费金额
 */
export async function calculateCategorySpending(
    categoryAccountId: string,
    startDate: string,
    endDate: string,
    targetCurrency: string,
    accountFilterMode: 'all' | 'include' | 'exclude' = 'all',
    accountFilterIds: string[] | null = null
): Promise<number> {
    const { data: allAccounts } = await supabase.from('accounts').select('id, parent_id, type');
    if (!allAccounts) return 0;

    const getDescendantIds = (parentId: string): string[] => {
        const children = allAccounts.filter(a => a.parent_id === parentId);
        let ids = [parentId];
        children.forEach(child => {
            ids = ids.concat(getDescendantIds(child.id));
        });
        return ids;
    };

    const targetAccountIds = getDescendantIds(categoryAccountId);

    let query = supabase
        .from('transactions')
        .select(`
            amount,
            from_amount,
            to_amount,
            from_account:accounts!transactions_from_account_id_fkey(currency, type),
            to_account:accounts!transactions_to_account_id_fkey(currency, type)
        `)
        .in('to_account_id', targetAccountIds)
        .gte('date', startDate)
        .lte('date', endDate);

    if (accountFilterMode === 'include' && accountFilterIds?.length) {
        query = query.in('from_account_id', accountFilterIds);
    } else if (accountFilterMode === 'exclude' && accountFilterIds?.length) {
        const includedIds = allAccounts
            .map(a => a.id)
            .filter(id => !accountFilterIds.includes(id));
        if (includedIds.length) {
            query = query.in('from_account_id', includedIds);
        }
    }

    const { data, error } = await query;
    if (error) throw error;

    let total = 0;
    for (const tx of (data || []) as any[]) {
        // 排除费用账户之间的内部转账（如退款冲抵，视具体业务而定，通常预算只看外部流入费用账户的流量）
        if (tx.from_account?.type === 'expense') continue;

        // 优先使用 to_amount，它是目标账户（费用分类）收到的准确金额
        const amountInToCurrency = tx.to_amount || tx.amount;
        const txCurrency = tx.to_account?.currency || 'CNY';

        const rate = await getCurrencyRate(txCurrency, targetCurrency);
        total += (amountInToCurrency * rate);
    }

    return total;
}

/**
 * 计算指定周期内总支出金额
 */
export async function calculateTotalSpending(
    includedCategoryIds: string[] | null,
    startDate: string,
    endDate: string,
    targetCurrency: string,
    accountFilterMode: 'all' | 'include' | 'exclude' = 'all',
    accountFilterIds: string[] | null = null
): Promise<number> {
    const { data: allAccounts } = await supabase.from('accounts').select('id, parent_id, type');
    if (!allAccounts) return 0;

    let targetIds: string[] = [];
    if (includedCategoryIds?.length) {
        const getDescendantIds = (parentId: string): string[] => {
            const children = allAccounts.filter(a => a.parent_id === parentId);
            let ids = [parentId];
            children.forEach(child => {
                ids = ids.concat(getDescendantIds(child.id));
            });
            return ids;
        };
        includedCategoryIds.forEach(id => {
            targetIds = targetIds.concat(getDescendantIds(id));
        });
        targetIds = Array.from(new Set(targetIds));
    } else {
        targetIds = allAccounts.filter(a => a.type === 'expense').map(a => a.id);
    }

    let query = supabase
        .from('transactions')
        .select(`
            amount,
            from_amount,
            to_amount,
            from_account:accounts!transactions_from_account_id_fkey(currency, type),
            to_account:accounts!transactions_to_account_id_fkey(currency, type)
        `)
        .in('to_account_id', targetIds)
        .gte('date', startDate)
        .lte('date', endDate);

    if (accountFilterMode === 'include' && accountFilterIds?.length) {
        query = query.in('from_account_id', accountFilterIds);
    } else if (accountFilterMode === 'exclude' && accountFilterIds?.length) {
        const includedIds = allAccounts.map(a => a.id).filter(id => !accountFilterIds.includes(id));
        if (includedIds.length) {
            query = query.in('from_account_id', includedIds);
        }
    }

    const { data, error } = await query;
    if (error) throw error;

    let total = 0;
    for (const tx of (data || []) as any[]) {
        if (tx.from_account?.type === 'expense') continue;

        const amountInToCurrency = tx.to_amount || tx.amount;
        const txCurrency = tx.to_account?.currency || 'CNY';

        const rate = await getCurrencyRate(txCurrency, targetCurrency);
        total += (amountInToCurrency * rate);
    }

    return total;
}

/**
 * 判断指示灯状态
 */
export function determineIndicatorStatus(
    actualAmount: number,
    hardLimit: number,
    softLimit: number | null
): 'star' | 'green' | 'red' {
    if (actualAmount > hardLimit) return 'red';
    if (softLimit !== null && actualAmount <= softLimit) return 'star';
    return 'green';
}

/**
 * 更新预算周期记录
 */
export async function updateBudgetPeriodRecord(recordId: string): Promise<void> {
    const { data: record, error: recordError } = await supabase
        .from('budget_period_records')
        .select('*, plan:budget_plans (*)')
        .eq('id', recordId)
        .single();

    if (recordError) throw recordError;

    const budgetRecord = record as any;
    const plan = budgetRecord.plan as BudgetPlanRow;

    let actualAmount: number;
    if (plan.plan_type === 'total') {
        actualAmount = await calculateTotalSpending(
            plan.included_category_ids,
            budgetRecord.period_start,
            budgetRecord.period_end,
            plan.limit_currency,
            plan.account_filter_mode as any,
            plan.account_filter_ids
        );
    } else {
        actualAmount = await calculateCategorySpending(
            plan.category_account_id!,
            budgetRecord.period_start,
            budgetRecord.period_end,
            plan.limit_currency,
            plan.account_filter_mode as any,
            plan.account_filter_ids
        );
    }

    const indicatorStatus = determineIndicatorStatus(actualAmount, budgetRecord.hard_limit, null);

    const { error: updateError } = await supabase
        .from('budget_period_records')
        .update({
            actual_amount: actualAmount,
            indicator_status: indicatorStatus as any,
        })
        .eq('id', recordId);

    if (updateError) throw updateError;
}

/**
 * 更新所有活跃的预算周期
 */
export async function updateAllActiveBudgetPeriods(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    const { data: activeRecords, error } = await supabase
        .from('budget_period_records')
        .select('id')
        .lte('period_start', today)
        .gte('period_end', today);

    if (error) throw error;

    for (const record of activeRecords || []) {
        await updateBudgetPeriodRecord(record.id);
    }
}

/**
 * 获取仪表盘预算概览数据
 */
export async function getDashboardBudgetData(): Promise<{
    activePlans: BudgetPlanWithRecords[];
    summary: {
        totalBudget: number;
        totalActual: number;
        currency: string;
        indicatorCount: { red: number; green: number; star: number };
    };
}> {
    const today = new Date().toISOString().split('T')[0];

    const { data: plans, error } = await supabase
        .from('budget_plans')
        .select(`
            *,
            category_account:accounts!budget_plans_category_account_id_fkey(name),
            current_record:budget_period_records (*)
        `)
        .eq('status', 'active')
        .lte('budget_period_records.period_start', today)
        .gte('budget_period_records.period_end', today);

    if (error) throw error;

    const activePlans = (plans || []).map((p: any) => ({
        ...p,
        category_name: p.category_account?.name || '未命名分类',
        records: p.current_record || [],
    })) as any[];

    let totalBudget = 0;
    let totalActual = 0;
    const indicatorCount = { red: 0, green: 0, star: 0 };
    const defaultCurrency = 'CNY';

    for (const plan of activePlans) {
        const currentRecord = plan.records[0];
        if (!currentRecord) continue;

        const rate = await getCurrencyRate(plan.limit_currency, defaultCurrency);
        totalBudget += currentRecord.hard_limit * rate;
        totalActual += (currentRecord.actual_amount || 0) * rate;

        if (currentRecord.indicator_status === 'red') indicatorCount.red++;
        else if (currentRecord.indicator_status === 'green') indicatorCount.green++;
        else if (currentRecord.indicator_status === 'star') indicatorCount.star++;
    }

    return {
        activePlans,
        summary: {
            totalBudget,
            totalActual,
            currency: defaultCurrency,
            indicatorCount,
        },
    };
}
