/**
 * [性质]: [功能] 对账与纠错管理
 * [Input]: Supabase, Calibrations
 * [Output]: 对账问题CRUD, runReconciliationCheck
 * [说明]: 对账逻辑基于比对相邻校准点之间的余额差值与期间流水和
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */

import { supabase } from '@/lib/supabase/client';

/**
 * 获取对账问题列表
 */
export async function getReconciliationIssues(status: 'open' | 'resolved' = 'open') {
    const { data, error } = await supabase
        .from('reconciliation_issues')
        .select(`
            *,
            account:accounts!reconciliation_issues_account_id_fkey(id, name, currency)
        `)
        .eq('status', status)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

/**
 * 解决对账问题
 */
export async function resolveReconciliationIssue(id: string) {
    const { data, error } = await supabase
        .from('reconciliation_issues')
        .update({
            status: 'resolved',
            resolved_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * 忽略对账问题
 */
export async function ignoreReconciliationIssue(id: string) {
    const { data, error } = await supabase
        .from('reconciliation_issues')
        .update({
            status: 'ignored',
            resolved_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * 重新生成账户的对账问题
 */
export async function regenerateIssuesForAccounts(
    accountIds: string[],
    source: 'manual' | 'calibration' = 'manual'
) {
    for (const accountId of accountIds) {
        await runReconciliationCheck(accountId);
    }
    return { regenerated: accountIds.length };
}

/**
 * 运行对账检查
 * 
 * 新逻辑：比对相邻两次校准的差值与期间流水和
 * - 对于每对相邻校准 (C1, C2)：
 *   - 校准差 = C2.balance - C1.balance
 *   - 流水和 = SUM(C1.date ~ C2.date 期间的交易影响)
 *   - 如果 |校准差 - 流水和| > 0.01：创建 reconciliation_issue
 * 
 * @param accountId 账户ID
 * @param startDate 可选，开始日期（ISO字符串），用于过滤校准记录
 * @param endDate 可选，结束日期（ISO字符串），用于过滤校准记录
 */
export async function runReconciliationCheck(
    accountId: string,
    startDate?: string,
    endDate?: string
) {
    try {
        // 获取该账户的所有校准记录，按日期升序
        let query = supabase
            .from('calibrations')
            .select('*')
            .eq('account_id', accountId)
            .order('date', { ascending: true });

        // 应用周期过滤
        if (startDate) {
            query = query.gte('date', startDate);
        }
        if (endDate) {
            query = query.lte('date', endDate);
        }

        const { data: calibrations, error: calError } = await query;

        if (calError) {
            console.error(`Error fetching calibrations for ${accountId}:`, calError);
            return { status: 'error', checked: 0, error: `Fetching calibrations failed: ${calError.message}` };
        }

        if (!calibrations || calibrations.length < 2) {
            console.log(`Insufficient calibrations for ${accountId}: found ${calibrations?.length || 0}`);
            return { status: 'insufficient_calibrations', checked: 0 };
        }

        console.log(`Checking account ${accountId}: found ${calibrations.length} calibrations`);

        const issues: any[] = [];

        // 比对相邻校准
        for (let i = 0; i < calibrations.length - 1; i++) {
            const c1 = calibrations[i] as any;
            const c2 = calibrations[i + 1] as any;

            const expectedDelta = Number(c2.balance) - Number(c1.balance);

            // 计算期间流水和
            const { data: income, error: incomeError } = await supabase
                .from('transactions')
                .select('amount, to_amount')
                .eq('to_account_id', accountId)
                .gt('date', c1.date)
                .lte('date', c2.date);

            if (incomeError) throw new Error(`Income query failed: ${incomeError.message}`);

            const { data: expense, error: expenseError } = await supabase
                .from('transactions')
                .select('amount, from_amount')
                .eq('from_account_id', accountId)
                .gt('date', c1.date)
                .lte('date', c2.date);

            if (expenseError) throw new Error(`Expense query failed: ${expenseError.message}`);

            const totalIncome = (income || []).reduce((acc: number, t: any) =>
                acc + Number(t.to_amount ?? t.amount), 0);
            const totalExpense = (expense || []).reduce((acc: number, t: any) =>
                acc + Number(t.from_amount ?? t.amount), 0);

            const actualDelta = totalIncome - totalExpense;
            const diff = actualDelta - expectedDelta;

            console.log(`[Reconciliation Debug] Account: ${accountId}, Period: ${c1.date} - ${c2.date}`);
            console.log(`  Start Balance: ${c1.balance}, End Balance: ${c2.balance}, Expected Delta: ${expectedDelta}`);
            console.log(`  Income: ${totalIncome} (${income?.length} txs), Expense: ${totalExpense} (${expense?.length} txs), Actual Delta: ${actualDelta}`);
            console.log(`  Diff: ${diff}`);

            if (Math.abs(diff) > 0.01) {
                issues.push({
                    account_id: accountId,
                    start_calibration_id: c1.id,
                    end_calibration_id: c2.id,
                    period_start: c1.date,
                    period_end: c2.date,
                    expected_delta: expectedDelta,
                    actual_delta: actualDelta,
                    diff: diff,
                    status: 'open',
                    source: 'manual', // 临时回退，因数据库约束不支持 'calibration'
                });
            }
        }

        // 批量插入新问题
        if (issues.length > 0) {
            const { error } = await supabase.from('reconciliation_issues').insert(issues);
            if (error) throw new Error(`Insert issues failed: ${error.message}`);
        }

        return {
            status: 'checked',
            checked: calibrations.length - 1,
            issues_found: issues.length
        };
    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Reconciliation check failed for ${accountId}:`, errorMessage);
        return { status: 'error', checked: 0, error: errorMessage };
    }
}

/**
 * 批量运行对账检查
 * 
 * @param accountIds 账户ID列表
 * @param startDate 可选，开始日期（ISO字符串）
 * @param endDate 可选，结束日期（ISO字符串）
 */
export async function runReconciliationCheckBatch(
    accountIds: string[],
    startDate?: string,
    endDate?: string
) {
    const results = {
        total_accounts: accountIds.length,
        checked_accounts: 0,
        total_issues_found: 0,
        insufficient_calibrations: [] as string[],
        details: [] as any[]
    };

    // 并行处理所有账户
    const promises = accountIds.map(async (accountId) => {
        try {
            const result = await runReconciliationCheck(accountId, startDate, endDate);
            return { accountId, result };
        } catch (error) {
            const errorMessage = error instanceof Error
                ? error.message
                : (typeof error === 'object' ? JSON.stringify(error) : String(error));
            console.error(`Failed to check account ${accountId}:`, errorMessage, error);
            return {
                accountId,
                result: { status: 'error', checked: 0, error: errorMessage }
            };
        }
    });

    const allResults = await Promise.all(promises);

    // 汇总结果
    allResults.forEach(({ accountId, result }) => {
        if (result.status === 'insufficient_calibrations') {
            results.insufficient_calibrations.push(accountId);
        } else if (result.status === 'checked') {
            results.checked_accounts++;
            results.total_issues_found += (result as any).issues_found || 0;
        }

        results.details.push({
            account_id: accountId,
            ...result
        });
    });

    return results;
}


/**
 * 获取账户的对账状态概览
 */
export async function getReconciliationStatus(accountId: string) {
    const { data: latestCalibration } = await supabase
        .from('calibrations' as any)
        .select('*')
        .eq('account_id', accountId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!latestCalibration) {
        return { status: 'no_calibration', lastCalibrationDate: null };
    }

    const calibrationData = latestCalibration as any;

    const { data: balanceData } = await supabase
        .from('account_balances_view')
        .select('balance')
        .eq('account_id', accountId)
        .single();

    const currentBalance = Number(balanceData?.balance || 0);
    const calibrationBalance = Number(calibrationData.balance);
    const diff = currentBalance - calibrationBalance;

    return {
        status: Math.abs(diff) < 0.01 ? 'consistent' : 'has_difference',
        calibration_balance: calibrationBalance,
        current_balance: currentBalance,
        diff: diff,
        last_calibration_date: calibrationData.date
    };
}
