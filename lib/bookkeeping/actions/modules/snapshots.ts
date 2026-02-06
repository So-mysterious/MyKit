/**
 * [性质]: [核心] 校准管理模块
 * [Input]: Supabase
 * [Output]: 校准CRUD, calculateBalance
 * [说明]: 校准(Calibration)是用户确认的真实余额锚点，余额计算从最近的校准点正推/倒推
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */

import { supabase } from '@/lib/supabase/client';

/**
 * 计算指定账户在指定日期的理论余额
 * 
 * 算法说明：
 * 1. 查找最近的校准记录（可能在目标日期之前或之后）
 * 2. 如果校准在目标日期之前：正推（校准余额 + 期间流水影响）
 * 3. 如果校准在目标日期之后：倒推（校准余额 - 期间流水影响）
 * 4. 如果无校准记录：从0开始累加所有流水
 */
export async function calculateBalance(supabaseClient: any, accountId: string, toDate: Date): Promise<number> {
    const targetISO = toDate.toISOString();

    // 1. 先尝试查找目标日期之前最近的校准
    const { data: beforeCalibration } = await supabaseClient
        .from('calibrations')
        .select('balance, date')
        .eq('account_id', accountId)
        .lte('date', targetISO)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

    // 2. 如果找到了之前的校准，使用正推
    if (beforeCalibration) {
        const baseBalance = Number(beforeCalibration.balance);
        const startDate = beforeCalibration.date;

        // 计算校准日到目标日期之间的流水影响
        const { data: income } = await supabaseClient
            .from('transactions')
            .select('amount, to_amount')
            .eq('to_account_id', accountId)
            .gt('date', startDate)
            .lte('date', targetISO);

        const { data: expense } = await supabaseClient
            .from('transactions')
            .select('amount, from_amount')
            .eq('from_account_id', accountId)
            .gt('date', startDate)
            .lte('date', targetISO);

        const totalIncome = (income || []).reduce((acc: number, t: any) =>
            acc + Number(t.to_amount ?? t.amount), 0);
        const totalExpense = (expense || []).reduce((acc: number, t: any) =>
            acc + Number(t.from_amount ?? t.amount), 0);

        return baseBalance + totalIncome - totalExpense;
    }

    // 3. 如果没有之前的校准，尝试查找之后的校准（倒推）
    const { data: afterCalibration } = await supabaseClient
        .from('calibrations')
        .select('balance, date')
        .eq('account_id', accountId)
        .gt('date', targetISO)
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (afterCalibration) {
        const baseBalance = Number(afterCalibration.balance);
        const endDate = afterCalibration.date;

        // 计算目标日期到校准日之间的流水影响（需要反向）
        const { data: income } = await supabaseClient
            .from('transactions')
            .select('amount, to_amount')
            .eq('to_account_id', accountId)
            .gt('date', targetISO)
            .lte('date', endDate);

        const { data: expense } = await supabaseClient
            .from('transactions')
            .select('amount, from_amount')
            .eq('from_account_id', accountId)
            .gt('date', targetISO)
            .lte('date', endDate);

        const totalIncome = (income || []).reduce((acc: number, t: any) =>
            acc + Number(t.to_amount ?? t.amount), 0);
        const totalExpense = (expense || []).reduce((acc: number, t: any) =>
            acc + Number(t.from_amount ?? t.amount), 0);

        // 倒推：目标余额 = 校准余额 - 期间收入 + 期间支出
        return baseBalance - totalIncome + totalExpense;
    }

    // 4. 没有任何校准记录，从0开始累加全部流水
    const { data: income } = await supabaseClient
        .from('transactions')
        .select('amount, to_amount')
        .eq('to_account_id', accountId)
        .lte('date', targetISO);

    const { data: expense } = await supabaseClient
        .from('transactions')
        .select('amount, from_amount')
        .eq('from_account_id', accountId)
        .lte('date', targetISO);

    const totalIncome = (income || []).reduce((acc: number, t: any) =>
        acc + Number(t.to_amount ?? t.amount), 0);
    const totalExpense = (expense || []).reduce((acc: number, t: any) =>
        acc + Number(t.from_amount ?? t.amount), 0);

    return totalIncome - totalExpense;
}

/**
 * 创建余额校准记录
 * 
 * 说明：校准记录仅保存用户确认的余额，不再自动计算差异或生成对账问题
 * 对账逻辑改为比对相邻校准点之间的差值与流水和
 */
export async function createCalibration(options: {
    account_id: string;
    balance: number;
    date?: string;
    note?: string;
    source?: 'manual' | 'import';
    is_opening?: boolean;
}) {
    const {
        account_id,
        balance,
        date = new Date().toISOString(),
        note,
        source = 'manual',
        is_opening = false
    } = options;

    // 检查最近一次校准，防止重复校准
    if (!is_opening) {
        const { data: lastCalibration } = await supabase
            .from('calibrations')
            .select('balance, date')
            .eq('account_id', account_id)
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle();

        // 如果余额完全相同（差值小于 0.01），拒绝添加
        if (lastCalibration && Math.abs(Number(lastCalibration.balance) - balance) < 0.01) {
            throw new Error('余额与上次校准相同，请等流水变动后再校准');
        }
    }

    const { data: calibration, error } = await supabase
        .from('calibrations')
        .insert({
            account_id,
            balance,
            date,
            note,
            source,
            is_opening,
        } as any)
        .select()
        .single();

    if (error) throw error;

    return calibration;
}

/**
 * 获取校准记录列表
 */
export async function getCalibrations(accountId: string, options?: { limit?: number }) {
    const { limit = 50 } = options || {};

    const { data, error } = await supabase
        .from('calibrations')
        .select('*')
        .eq('account_id', accountId)
        .order('date', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data || [];
}

/**
 * 根据 ID 列表获取校准记录
 */
export async function getCalibrationsByIds(ids: string[]) {
    if (ids.length === 0) return [];

    const { data, error } = await supabase
        .from('calibrations')
        .select('*')
        .in('id', ids);

    if (error) throw error;
    return data || [];
}

/**
 * 获取账户的最后一次校准记录
 */
export async function getLastCalibration(accountId: string) {
    const { data, error } = await supabase
        .from('calibrations')
        .select('*')
        .eq('account_id', accountId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data;
}

// 向后兼容的别名导出
export const createSnapshot = createCalibration;
export const getSnapshots = getCalibrations;
export const getSnapshotsByIds = getCalibrationsByIds;
