/**
 * [性质]: [核心逻辑] 交易验证 (大额/时间)
 * [Input]: Transaction Data
 * [Output]: Validation Result
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
import { SupabaseClient } from '@supabase/supabase-js';

// ============================================
// 类型定义
// ============================================

export interface LargeExpenseCheckResult {
    isLarge: boolean;
    mean: number;
    stdDev: number;
    threshold: number;
}

// ============================================
// 核心验证函数
// ============================================

/**
 * 检查是否为大额消费
 * 规则：金额 > (近3个月同类支出均值 + 3 * 标准差)
 * 注意：划转类型不计算，直接返回 false
 */
export async function checkLargeExpense(
    supabase: SupabaseClient,
    amount: number,
    categoryId: string | null, // 支出则是分类ID(即to_account_id)，收入是分类ID(from_account_id)
    type: 'expense' | 'income' | 'transfer',
    date: string
): Promise<LargeExpenseCheckResult> {
    const result: LargeExpenseCheckResult = {
        isLarge: false,
        mean: 0,
        stdDev: 0,
        threshold: 0
    };

    // 划转或无分类不检查
    if (type === 'transfer' || !categoryId) {
        return result;
    }

    // 确定时间范围：过去90天
    const txDate = new Date(date);
    const endDate = txDate.toISOString();
    const startDateObj = new Date(txDate);
    startDateObj.setDate(startDateObj.getDate() - 90);
    const startDate = startDateObj.toISOString();

    // 查询历史数据
    // 支出：to_account_id = categoryId
    // 收入：from_account_id = categoryId
    let query = supabase.from('transactions').select('amount').gte('date', startDate).lte('date', endDate);

    if (type === 'expense') {
        query = query.eq('to_account_id', categoryId).eq('type', 'expense');
    } else {
        query = query.eq('from_account_id', categoryId).eq('type', 'income');
    }

    const { data: history, error } = await query;

    if (error || !history || history.length < 5) {
        // 数据样本太少，不进行判定
        return result;
    }

    // 计算统计值
    const amounts = history.map(t => Number(t.amount));
    const sum = amounts.reduce((a, b) => a + b, 0);
    const mean = sum / amounts.length;

    // 标准差
    const squareDiffs = amounts.map(v => Math.pow(v - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / amounts.length;
    const stdDev = Math.sqrt(avgSquareDiff);

    const threshold = mean + 3 * stdDev;

    return {
        isLarge: amount > threshold,
        mean,
        stdDev,
        threshold
    };
}

/**
 * 检查交易日期是否早于账户创建日期
 */
export async function checkEarlyTransaction(
    supabase: SupabaseClient,
    date: string,
    accountIds: string[]
): Promise<{ isEarly: boolean; accountName: string; createdDate: string } | null> {
    if (!accountIds || accountIds.length === 0) return null;

    // 缓存？这里简单起见每次查，批量导入时建议外层优化缓存
    const { data: accounts } = await supabase
        .from('accounts')
        .select('id, name, created_at')
        .in('id', accountIds);

    if (!accounts) return null;

    const txTime = new Date(date).getTime();

    for (const acc of accounts) {
        if (acc.created_at) {
            const createTime = new Date(acc.created_at).getTime();
            // 允许少许误差？这里严格判断
            if (txTime < createTime) {
                return {
                    isEarly: true,
                    accountName: acc.name,
                    createdDate: acc.created_at.split('T')[0]
                };
            }
        }
    }

    return null;
}
