/**
 * [性质]: [核心] 交易管理模块
 * [Input]: Supabase, Currency, Statistics
 * [Output]: createTransaction (复式记账), getTransactions
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */

import { supabase as supabaseClientSingleton } from '@/lib/supabase/client';
import { TransactionNature } from '@/types/database';
import { inferTransactionType, SYSTEM_ACCOUNT_IDS } from '@/lib/constants';
import { invalidateCache } from './cache';
import { getCurrencyRates, convertCurrency } from './currency';
import { getExpenseStatistics } from './statistics';

/**
 * 创建交易
 * @param data 交易数据
 * @param client (可选) Supabase 客户端实例，用于服务端调用时传入上下文
 */
export async function createTransaction(data: any, client?: any, options?: { skipRevalidation?: boolean }) {
    const supabase = client || supabaseClientSingleton;

    // 1. 获取账户信息
    // 1. 获取账户信息
    const { data: fromAcc } = await supabase.from('accounts').select('currency, type, is_group, account_class').eq('id', data.from_account_id).single();
    const { data: toAcc } = await supabase.from('accounts').select('currency, type, is_group, account_class').eq('id', data.to_account_id).single();

    if (!fromAcc || !toAcc) throw new Error('账户不存在');
    if (fromAcc.is_group || toAcc.is_group) throw new Error('不能在分组账户上直接记账');

    // 2. 跨币种金额转换
    // 只有当双方都是实账户(real)且币种不同时，才进行自动汇率转换
    const isMultiCurrency =
        fromAcc.account_class === 'real' &&
        toAcc.account_class === 'real' &&
        fromAcc.currency !== toAcc.currency;

    if (isMultiCurrency) {
        if (!data.from_amount) data.from_amount = data.amount;
        if (!data.to_amount) {
            const rates = await getCurrencyRates();
            data.to_amount = await convertCurrency(data.amount, fromAcc.currency || 'CNY', toAcc.currency || 'CNY', rates);
        }
    } else {
        // 同币种（或者一方为虚账户）：强制清空跨币种字段
        // 金额以 amount 为准，from_amount/to_amount 为空
        data.from_amount = null;
        data.to_amount = null;
    }

    // 3. 大额支出/收入检测 (基于 90 天标准差)
    const txType = inferTransactionType(fromAcc.type as any, toAcc.type as any);
    if (!data.is_large_expense) {
        try {
            let threshold = 0;
            if (txType === 'expense') {
                const stats = await getExpenseStatistics({ accountId: data.from_account_id });
                threshold = stats.avg_expense_90d + 3 * stats.stddev_expense_90d;
            } else if (txType === 'income') {
                const stats = await getExpenseStatistics({ accountId: data.to_account_id });
                threshold = stats.avg_income_90d + 3 * stats.stddev_income_90d;
            }

            if (threshold > 0) {
                // 如果计算结果有效且大，则标记；否则回退到 2000
                const finalThreshold = (threshold > 100) ? threshold : 2000;
                data.is_large_expense = data.amount > finalThreshold;
            } else {
                data.is_large_expense = data.amount > 2000;
            }
        } catch (e) {
            data.is_large_expense = data.amount > 2000;
        }
    }

    // 4. 插入记录
    const { data: inserted, error } = await supabase
        .from('transactions')
        .insert(data)
        .select()
        .single();

    if (error) throw error;

    // 5. 期初动态调整检查
    await handleOpeningBalanceAdjustment(data.from_account_id, data.date, supabase);
    await handleOpeningBalanceAdjustment(data.to_account_id, data.date, supabase);

    // 6. 失效缓存
    if (!options?.skipRevalidation) {
        await invalidateCache({ accountId: data.from_account_id });
        await invalidateCache({ accountId: data.to_account_id });
    }

    return inserted;
}

/**
 * 查询交易列表
 */
export async function getTransactions(options?: {
    limit?: number;
    offset?: number;
    accountId?: string;
    projectId?: string;
    startDate?: string;
    endDate?: string;
    type?: string;
    needsReview?: boolean;
}, client?: any) {
    const supabase = client || supabaseClientSingleton;
    const { limit = 50, offset = 0, accountId, projectId, startDate, endDate, type, needsReview } = options || {};

    let query = supabase
        .from('transactions')
        .select(`
            *,
            from_account:accounts!transactions_from_account_id_fkey(*),
            to_account:accounts!transactions_to_account_id_fkey(*)
        `, { count: 'exact' });

    if (accountId) {
        query = query.or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`);
    }
    if (projectId) query = query.eq('project_id', projectId);
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    if (needsReview !== undefined) query = query.eq('needs_review', needsReview);

    const { data: rawData, error, count } = await query
        .order('date', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;

    // Enhanced Parent Account Fetching:
    // Manual fetch to avoid PostgREST nested embedding issues (e.g. FK name ambiguity)
    const parentIds = new Set<string>();
    const data = rawData as any[]; // Type assertion for manipulation

    data.forEach(tx => {
        if (tx.from_account?.parent_id) parentIds.add(tx.from_account.parent_id);
        if (tx.to_account?.parent_id) parentIds.add(tx.to_account.parent_id);
    });

    const parentMap = new Map<string, { name: string }>();
    if (parentIds.size > 0) {
        const { data: parents } = await supabase
            .from('accounts')
            .select('id, name')
            .in('id', Array.from(parentIds));

        parents?.forEach((p: any) => parentMap.set(p.id, p));
    }

    // Attach parent info
    const enrichedData = data.map(tx => {
        if (tx.from_account?.parent_id) {
            tx.from_account.parent = parentMap.get(tx.from_account.parent_id) || null;
        }
        if (tx.to_account?.parent_id) {
            tx.to_account.parent = parentMap.get(tx.to_account.parent_id) || null;
        }
        return tx;
    });

    const txsWithInferredType = enrichedData.map((tx: any) => ({
        ...tx,
        type: inferTransactionType(tx.from_account?.type, tx.to_account?.type)
    }));

    // 如果指定了类型，在内存中过滤（由于架构原因，通过 SQL 过滤交易类型较慢）
    const filtered = type ? txsWithInferredType.filter((tx: any) => tx.type === type) : txsWithInferredType;

    return {
        transactions: filtered,
        total: count || 0
    };
}

/**
 * 更新交易
 */
export async function updateTransaction(id: string, data: any, client?: any) {
    const supabase = client || supabaseClientSingleton;
    const { data: oldTx } = await supabase.from('transactions').select('*').eq('id', id).single();
    if (!oldTx) throw new Error('交易不存在');

    // 处理跨币种一致性
    const old = oldTx as any;
    const fromId = data.from_account_id || old.from_account_id;
    const toId = data.to_account_id || old.to_account_id;

    const { data: fromAcc } = await supabase.from('accounts').select('id, currency, type, account_class').eq('id', fromId).single();
    const { data: toAcc } = await supabase.from('accounts').select('id, currency, type, account_class').eq('id', toId).single();

    if (fromAcc && toAcc) {
        const isMultiCurrency =
            fromAcc.account_class === 'real' &&
            toAcc.account_class === 'real' &&
            fromAcc.currency !== toAcc.currency;

        if (!isMultiCurrency) {
            // 同币种时清空跨币种金额，防止残留
            data.from_amount = null;
            data.to_amount = null;
        } else {
            // 跨币种时，如果没传 from_amount/to_amount，且 amount 变了，需要更新
            if (data.amount !== undefined && !data.from_amount) {
                data.from_amount = data.amount;
            }
        }
    }

    // 重新评估大额支出/收入标志
    // 只有当金额或账户发生变化时才重新计算
    if (fromAcc && toAcc && (data.amount !== undefined || data.from_account_id || data.to_account_id)) {
        const newAmount = data.amount !== undefined ? data.amount : old.amount;
        const txType = inferTransactionType(fromAcc.type as any, toAcc.type as any);

        // 仅对支出和收入进行检测
        if (txType === 'expense' || txType === 'income') {
            try {
                let threshold = 0;
                if (txType === 'expense') {
                    const stats = await getExpenseStatistics({ accountId: fromId });
                    threshold = stats.avg_expense_90d + 3 * stats.stddev_expense_90d;
                } else if (txType === 'income') {
                    const stats = await getExpenseStatistics({ accountId: toId });
                    threshold = stats.avg_income_90d + 3 * stats.stddev_income_90d;
                }

                if (threshold > 0) {
                    const finalThreshold = (threshold > 100) ? threshold : 2000;
                    data.is_large_expense = newAmount > finalThreshold;
                } else {
                    data.is_large_expense = newAmount > 2000;
                }
            } catch (e) {
                // 如果统计失败，保留原有逻辑或不做改变（此处选择安全默认值）
                // data.is_large_expense = newAmount > 2000; 
            }
        }
    }

    const { data: updated, error } = await supabase
        .from('transactions')
        .update(data)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;

    // 失效涉及到的所有账户缓存
    const involved = new Set([old.from_account_id, old.to_account_id, data.from_account_id, data.to_account_id]);
    for (const accId of involved) {
        if (accId) await invalidateCache({ accountId: accId });
    }

    return updated;
}

/**
 * 删除交易
 */
export async function deleteTransaction(id: string, client?: any) {
    const supabase = client || supabaseClientSingleton;
    const { data: tx } = await supabase.from('transactions').select('from_account_id, to_account_id').eq('id', id).single();
    if (!tx) return;

    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) throw error;

    await invalidateCache({ accountId: tx.from_account_id });
    await invalidateCache({ accountId: tx.to_account_id });
}

/**
 * 创建期初交易
 */
export async function createOpeningTransaction(accountId: string, amount: number, date: string = new Date().toISOString(), client?: any) {
    return await createTransaction({
        from_account_id: SYSTEM_ACCOUNT_IDS.OPENING_BALANCE,
        to_account_id: accountId,
        amount: Math.abs(amount),
        from_amount: Math.abs(amount),
        to_amount: Math.abs(amount),
        date,
        description: '期初余额',
        is_opening: true,
        nature: 'regular'
    }, client);
}

/**
 * 关联交易 (代付回款、退款等)
 */
export async function linkTransactions(txId1: string, txId2: string, linkType: 'reimbursement' | 'refund' | 'split', client?: any) {
    const supabase = client || supabaseClientSingleton;
    const { error } = await supabase
        .from('transactions')
        .update({
            linked_transaction_id: txId2,
            link_type: linkType
        } as any)
        .eq('id', txId1);

    if (error) throw error;
    return { success: true };
}

/**
 * 处理期初余额动态调整
 * 如果新传入的交易日期早于现有的期初日期，则自动将期初日期移到该交易之前
 */
async function handleOpeningBalanceAdjustment(accountId: string, txDate: string, client?: any) {
    const supabase = client || supabaseClientSingleton;
    if (accountId === SYSTEM_ACCOUNT_IDS.OPENING_BALANCE) return;

    const { data: openingTx } = await supabase
        .from('transactions')
        .select('id, date')
        .eq('to_account_id', accountId)
        .eq('is_opening', true)
        .maybeSingle();

    if (openingTx && txDate < openingTx.date) {
        // 将期初日期移到该交易之前一秒
        const newOpeningDate = new Date(new Date(txDate).getTime() - 1000).toISOString();
        await supabase
            .from('transactions')
            .update({ date: newOpeningDate })
            .eq('id', openingTx.id);

        console.log(`[Opening Balance] Adjusted opening date for account ${accountId} to ${newOpeningDate}`);
    }
}

