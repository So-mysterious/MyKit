/**
 * [性质]: [功能] 统计分析模块
 * [Input]: Supabase, Cache, Currency
 * [Output]: getExpenseStatistics, getBalanceHistory
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */

import { supabase } from '@/lib/supabase/client';
import { ExpenseStatistics } from '@/types/database';
import { getCachedData, setCachedData } from './cache';
import { getCurrencyRates } from './currency';

/**
 * 获取支出统计摘要
 */
export async function getExpenseStatistics(options?: {
    accountId?: string;
    days?: number;
}): Promise<ExpenseStatistics> {
    const { accountId } = options || {};
    const cacheKey = accountId ? `expense_summary_${accountId}` : `expense_summary_global`;

    const cached = await getCachedData<ExpenseStatistics>(cacheKey);
    if (cached) return cached;

    // 1. 获取时间范围
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const dytd = new Date(now.getFullYear(), 0, 1).toISOString();

    // 2. 查询交易
    let query = supabase.from('transactions').select(`
        amount, 
        date, 
        from_account:accounts!transactions_from_account_id_fkey(type),
        to_account:accounts!transactions_to_account_id_fkey(type)
    `);

    if (accountId) {
        query = query.or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`);
    }

    const { data: allTxs, error } = await query.gt('date', dytd < d90 ? dytd : d90);
    if (error) throw error;

    const stats: ExpenseStatistics = {
        total_expense_30d: 0,
        total_expense_90d: 0,
        total_expense_ytd: 0,
        total_income_30d: 0,
        total_income_90d: 0,
        total_income_ytd: 0,
        avg_expense_90d: 0,
        stddev_expense_90d: 0,
        avg_income_90d: 0,
        stddev_income_90d: 0,
        computed_at: new Date().toISOString()
    };

    const expenses90d: number[] = [];
    const incomes90d: number[] = [];

    (allTxs || []).forEach((tx: any) => {
        const isExpense = tx.to_account?.type === 'expense';
        const isIncome = tx.from_account?.type === 'income';
        const amount = Number(tx.amount);
        const date = tx.date;

        if (isExpense) {
            if (date >= d30) stats.total_expense_30d += amount;
            if (date >= d90) {
                stats.total_expense_90d += amount;
                expenses90d.push(amount);
            }
            if (date >= dytd) stats.total_expense_ytd += amount;
        }

        if (isIncome) {
            if (date >= d30) stats.total_income_30d += amount;
            if (date >= d90) {
                stats.total_income_90d += amount;
                incomes90d.push(amount);
            }
            if (date >= dytd) stats.total_income_ytd += amount;
        }
    });

    // 计算支出均值和标准差
    if (expenses90d.length > 0) {
        const sum = expenses90d.reduce((a, b) => a + b, 0);
        const mean = sum / expenses90d.length;
        const squareDiffs = expenses90d.map(v => Math.pow(v - mean, 2));
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;

        stats.avg_expense_90d = sum / 90; // 日均
        stats.stddev_expense_90d = Math.sqrt(avgSquareDiff);
    }

    // 计算收入均值和标准差
    if (incomes90d.length > 0) {
        const sum = incomes90d.reduce((a, b) => a + b, 0);
        const mean = sum / incomes90d.length;
        const squareDiffs = incomes90d.map(v => Math.pow(v - mean, 2));
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;

        stats.avg_income_90d = sum / 90; // 日均
        stats.stddev_income_90d = Math.sqrt(avgSquareDiff);
    }

    // 异步更新缓存
    setCachedData(cacheKey, stats, { accountId, cacheType: 'expense_summary' });

    return stats;
}


/**
 * 获取账户的历史余额趋势
 * @param accountId 账户ID
 * @param days 天数
 * @returns 包含每日余额和币种信息
 */
export async function getBalanceHistory(accountId: string, days: number = 30): Promise<{ history: Array<{ date: string; balance: number }>; currency: string }> {
    const { data: accounts } = await supabase.from('accounts').select('id, currency, is_group, parent_id, is_active');
    if (!accounts) return { history: [], currency: 'CNY' };

    const accountMap = new Map(accounts.map(a => [a.id, a]));
    const targetAccount = accountMap.get(accountId);
    if (!targetAccount) return { history: [], currency: 'CNY' };

    // 获取所有叶子子账户（排除停用账户）
    const getLeafIds = (id: string): string[] => {
        const acc = accountMap.get(id);
        if (!acc) return [];
        // 如果账户已停用，不计入统计
        if (!acc.is_active) return [];
        if (!acc.is_group) return [id];
        const children = accounts.filter(a => a.parent_id === id);
        return children.flatMap(c => getLeafIds(c.id));
    };

    const leafIds = getLeafIds(accountId);
    if (leafIds.length === 0) return { history: [], currency: targetAccount.currency || 'CNY' };

    // 检测是否多币种
    const leafCurrencies = new Set<string>();
    for (const id of leafIds) {
        const acc = accountMap.get(id);
        leafCurrencies.add(acc?.currency || 'CNY');
    }
    const isMultiCurrency = leafCurrencies.size > 1;
    const displayCurrency = isMultiCurrency ? 'CNY' : (leafCurrencies.values().next().value || 'CNY');

    // 仅在多币种时才需要汇率
    const rates = isMultiCurrency ? await getCurrencyRates() : null;

    // 使用 calculateBalance 计算这些叶子账户的当前余额
    const now = new Date();
    const balancePromises = leafIds.map(async (id) => {
        try {
            const balance = await import('./snapshots').then(m => m.calculateBalance(supabase, id, now));
            return [id, balance] as [string, number];
        } catch (error) {
            console.error(`Failed to calculate balance for account ${id}:`, error);
            return [id, 0] as [string, number];
        }
    });

    const balances = await Promise.all(balancePromises);
    const balanceMap = new Map(balances);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    // 获取这些叶子账户的相关流水
    const { data: txs } = await supabase
        .from('transactions')
        .select('date, amount, from_account_id, to_account_id, from_amount, to_amount')
        .or(`from_account_id.in.(${leafIds.join(',')}),to_account_id.in.(${leafIds.join(',')})`)
        .gte('date', startDate.toISOString())
        .order('date', { ascending: false });

    const history: Array<{ date: string; balance: number }> = [];
    const dateTxsMap = new Map<string, any[]>();

    (txs || []).forEach(tx => {
        // 将交易日期转换为本地日期字符串
        const txDate = new Date(tx.date);
        const dateKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')}`;
        if (!dateTxsMap.has(dateKey)) dateTxsMap.set(dateKey, []);
        dateTxsMap.get(dateKey)!.push(tx);
    });

    // 运行余额模拟（倒推）
    const runningBalances = new Map(balanceMap);

    // 生成每日数据
    const today = new Date();
    for (let i = 0; i <= days; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        // 使用本地日期格式，避免时区问题
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        // 计算当前所有叶子账户的总余额
        let total = 0;
        for (const [id, bal] of runningBalances.entries()) {
            if (isMultiCurrency && rates) {
                const acc = accountMap.get(id);
                const currency = acc?.currency || 'CNY';
                const rate = rates[currency]?.['CNY'] || 1;
                total += bal * rate;
            } else {
                total += bal;
            }
        }

        history.push({
            date: dateStr,
            balance: total
        });

        // 倒推当天的交易
        const dayTxs = dateTxsMap.get(dateStr) || [];
        dayTxs.forEach(t => {
            // 如果交易从该账户流出，倒推时要把金额加回来
            if (runningBalances.has(t.from_account_id)) {
                const amount = t.from_amount || t.amount;
                runningBalances.set(t.from_account_id, runningBalances.get(t.from_account_id)! + Number(amount));
            }
            // 如果交易流入该账户，倒推时要把金额减去
            if (runningBalances.has(t.to_account_id)) {
                const amount = t.to_amount || t.amount;
                runningBalances.set(t.to_account_id, runningBalances.get(t.to_account_id)! - Number(amount));
            }
        });
    }

    return { history: history.reverse(), currency: displayCurrency };
}

/**
 * 获取仪表盘专用流水（最近一年）
 */
export async function getDashboardTransactions() {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const { data, error } = await supabase
        .from('transactions')
        .select(`
            *,
            from_account:accounts!transactions_from_account_id_fkey(id, name, type, currency),
            to_account:accounts!transactions_to_account_id_fkey(id, name, type, currency)
        `)
        .gte('date', oneYearAgo.toISOString())
        .order('date', { ascending: false });

    if (error) throw error;

    // 为兼容前端缓存，添加 type 字段推断
    return (data || []).map((tx: any) => {
        let type = 'transfer';
        if (tx.is_opening) type = 'opening';
        else if (tx.to_account?.type === 'expense') type = 'expense';
        else if (tx.from_account?.type === 'income') type = 'income';
        else if (tx.from_account?.type === 'asset' && tx.to_account?.type === 'liability') type = 'liability_payment';

        return {
            ...tx,
            type,
            // 兼容旧的 category 字段
            category: tx.to_account?.name || tx.from_account?.name || '',
        };
    });
}


/**
 * 获取账户详细统计信息
 */
export async function getAccountDetailAction(accountId: string) {
    // 1. 获取账户基本信息
    const { data: account, error: accError } = await supabase
        .from('accounts')
        .select(`
            *,
            parent:parent_id(name)
        `)
        .eq('id', accountId)
        .single();

    if (accError || !account) throw accError || new Error('Account not found');

    // 2. 获取上次校准信息
    const { data: lastSnapshot } = await supabase
        .from('calibrations')
        .select('*')
        .eq('account_id', accountId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

    // 3. 时间范围：近一月
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 4. 近一月流水统计（净流水 = 流入 - 流出）
    const { data: txs30d } = await supabase
        .from('transactions')
        .select('amount, from_account_id, to_account_id')
        .or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`)
        .gte('date', d30);

    let netFlow = 0;
    let txCount = 0;

    (txs30d || []).forEach(tx => {
        txCount++;
        const amount = Number(tx.amount);
        if (tx.to_account_id === accountId) netFlow += amount;
        if (tx.from_account_id === accountId) netFlow -= amount;
    });

    return {
        account,
        lastSnapshot,
        stats30d: {
            txCount,
            netFlow
        }
    };
}
