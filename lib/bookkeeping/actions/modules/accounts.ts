/**
 * [性质]: [核心] 账户管理模块
 * [Input]: Supabase, Cache, Currency
 * [Output]: 账户增删改查, 树形结构构建, 余额聚合
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */

import { supabase } from '@/lib/supabase/client';
import { AccountRow, AccountWithBalance } from '@/types/database';
import { AccountType } from '@/lib/constants';
import { invalidateCache } from './cache';
import { getCurrencyRates, convertCurrency } from './currency';
import { calculateBalance } from './snapshots';

/**
 * 构建账户树结构
 */
export function buildAccountTree(flatAccounts: AccountWithBalance[]): AccountWithBalance[] {
    const map = new Map<string, AccountWithBalance>();
    const roots: AccountWithBalance[] = [];

    flatAccounts.forEach(acc => {
        map.set(acc.id, { ...acc, children: [] });
    });

    flatAccounts.forEach(acc => {
        const node = map.get(acc.id)!;
        if (acc.parent_id && map.has(acc.parent_id)) {
            const parent = map.get(acc.parent_id)!;
            if (!parent.children) parent.children = [];
            parent.children.push(node);
        } else {
            roots.push(node);
        }
    });

    const sortFunc = (a: AccountWithBalance, b: AccountWithBalance) => (a.sort_order || 0) - (b.sort_order || 0);

    const sortTree = (nodes: AccountWithBalance[]) => {
        nodes.sort(sortFunc);
        nodes.forEach(node => {
            if (node.children && node.children.length > 0) {
                sortTree(node.children);
            }
        });
    };

    sortTree(roots);
    return roots;
}

/**
 * 递归计算父账户的总余额
 */
export async function aggregateParentBalances(
    nodes: AccountWithBalance[],
    targetCurrency: string,
    rates: Record<string, Record<string, number>>
): Promise<number> {
    let totalForThisLevel = 0;

    for (const node of nodes) {
        if (node.is_group && node.children && node.children.length > 0) {
            node.balance = await aggregateParentBalances(node.children, targetCurrency, rates);
            node.currency = targetCurrency;
        }

        totalForThisLevel += await convertCurrency(node.balance, node.currency || targetCurrency, targetCurrency, rates);
    }

    return totalForThisLevel;
}

/**
 * 获取账户列表
 */
export async function getAccounts(options?: {
    rootId?: string;
    includeBalance?: boolean;
    targetCurrency?: string;
    isActive?: boolean;
    accountClass?: 'real' | 'nominal';
}) {
    const {
        rootId,
        includeBalance = true,
        targetCurrency = 'CNY',
        isActive,  // undefined = 返回所有账户，true = 仅启用，false = 仅停用
        accountClass
    } = options || {};

    let query = supabase.from('accounts').select('*').order('sort_order', { ascending: true });
    if (isActive !== undefined) query = query.eq('is_active', isActive);
    if (accountClass) query = query.eq('account_class', accountClass);
    if (rootId) query = query.or(`id.eq.${rootId},parent_id.eq.${rootId}`);

    const { data: accounts, error } = await query;
    if (error) throw error;
    if (!accounts) return [];

    let accountsWithBalance: AccountWithBalance[] = accounts.map((acc: any) => ({
        ...acc,
        balance: 0,
        children: []
    }));

    if (includeBalance) {
        // 使用 calculateBalance 函数计算余额（支持前推/后推）
        const now = new Date();
        const balancePromises = accountsWithBalance
            .filter(acc => !acc.is_group) // 只计算叶子账户
            .map(async (acc) => {
                try {
                    const balance = await calculateBalance(supabase, acc.id, now);
                    return { id: acc.id, balance };
                } catch (error) {
                    console.error(`Failed to calculate balance for account ${acc.id}:`, error);
                    return { id: acc.id, balance: 0 };
                }
            });

        const balances = await Promise.all(balancePromises);
        const balanceMap = new Map(balances.map(b => [b.id, b.balance]));

        accountsWithBalance.forEach(acc => {
            if (!acc.is_group) {
                acc.balance = balanceMap.get(acc.id) || 0;
            }
        });
    }

    const tree = buildAccountTree(accountsWithBalance);

    if (includeBalance) {
        const rates = await getCurrencyRates();
        await aggregateParentBalances(tree, targetCurrency, rates);
    }

    return tree;
}

/**
 * 创建新账户
 * @param data 账户数据
 * @param openingInfo 期初信息（可选，仅叶子账户）
 */
export async function createAccount(
    data: Partial<AccountRow>,
    openingInfo?: {
        opening_date?: string;
        opening_balance?: number;
    }
) {
    if (data.parent_id) {
        const { data: parent } = await supabase.from('accounts').select('type, account_class').eq('id', data.parent_id).single();
        if (parent) {
            data.type = parent.type as AccountType;
            data.account_class = parent.account_class as any;
        }
    }

    const { data: inserted, error } = await supabase
        .from('accounts')
        .insert(data as any)
        .select()
        .single();

    if (error) throw error;

    // 如果是叶子账户且有期初余额，创建期初交易
    if (!data.is_group && openingInfo?.opening_balance !== undefined && openingInfo.opening_balance !== 0) {
        const OPENING_BALANCE_ACCOUNT_ID = '00000000-0000-0000-0000-000000000006';
        // 使用完整的 ISO 时间戳，如果只提供日期则补充时间为 00:00:00
        const openingDate = openingInfo.opening_date
            ? (openingInfo.opening_date.includes('T')
                ? openingInfo.opening_date
                : `${openingInfo.opening_date}T00:00:00.000Z`)
            : new Date().toISOString();
        let balance = openingInfo.opening_balance;

        // 如果是负债类账户且用户填入了正数，自动转为负数（代表欠款）
        if (data.type === 'liability' && balance > 0) {
            balance = -balance;
        }

        // 统一逻辑：期初账户 -> 新账户，金额直接使用填写的余额（允许负数）
        const { error: txError } = await supabase.from('transactions').insert({
            date: openingDate,
            from_account_id: OPENING_BALANCE_ACCOUNT_ID,
            to_account_id: (inserted as any).id,
            amount: balance,
            from_amount: balance,
            to_amount: balance,
            is_opening: true,
            description: '期初余额',
            nature: 'regular',
        } as any);

        if (txError) {
            console.error('创建期初交易失败:', txError);
            // 不抛出错误，账户已创建成功
        }

        // 创建期初校准记录（期初余额也视为用户确认的真实余额）
        const { error: calibrationError } = await supabase.from('calibrations').insert({
            account_id: (inserted as any).id,
            balance: balance,
            date: openingDate,
            source: 'manual',
            is_opening: true,
            note: '期初余额校准',
        });

        if (calibrationError) {
            console.error('创建期初校准失败:', calibrationError);
        }
    }

    await invalidateCache({ global: true });

    return inserted;
}

/**
 * 更新账户信息
 */
export async function updateAccount(id: string, data: Partial<AccountRow>) {
    const { data: existing } = await supabase.from('accounts').select('is_system').eq('id', id).single();
    if (existing?.is_system) {
        delete data.type;
        delete data.account_class;
        delete data.parent_id;
    }

    const { data: updated, error } = await supabase
        .from('accounts')
        .update(data as any)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;

    await invalidateCache({ accountId: id });
    return updated;
}

/**
 * 删除账户
 */
export async function deleteAccount(id: string) {
    const { data: acc } = await supabase.from('accounts').select('is_system, name').eq('id', id).single();
    if (acc?.is_system) throw new Error(`系统账户 "${acc.name}" 不可删除`);

    const { count: childCount } = await supabase.from('accounts').select('*', { count: 'exact', head: true }).eq('parent_id', id);
    if (childCount && childCount > 0) throw new Error('该账户含有子账户，请先删除或移动子账户');

    const { count: txCount } = await supabase.from('transactions').select('*', { count: 'exact', head: true })
        .or(`from_account_id.eq.${id},to_account_id.eq.${id}`);

    if (txCount && txCount > 0) throw new Error('该账户已有交易记录，无法物理删除。请改为停用账户。');

    const { count: ptCount } = await supabase.from('periodic_tasks').select('*', { count: 'exact', head: true })
        .or(`from_account_id.eq.${id},to_account_id.eq.${id}`);

    if (ptCount && ptCount > 0) throw new Error('该账户已有周期任务关联，无法物理删除。请先删除相关任务或停用账户。');

    const { error } = await supabase.from('accounts').delete().eq('id', id);
    if (error) throw error;

    await invalidateCache({ global: true });
    return true;
}

/**
 * 切换账户启用状态
 */
export async function toggleAccountStatus(id: string, active: boolean) {
    const { data, error } = await supabase
        .from('accounts')
        .update({
            is_active: active,
            deactivated_at: active ? null : new Date().toISOString()
        } as any)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}
/**
 * 合并账户
 * 将源账户的所有交易转移到目标账户，并停用源账户
 */
export async function mergeAccounts(sourceId: string, targetId: string) {
    if (sourceId === targetId) throw new Error('不能合并同一个账户');

    // 1. 检查账户是否存在
    const { data: sourceAcc } = await supabase.from('accounts').select('id, name').eq('id', sourceId).single();
    const { data: targetAcc } = await supabase.from('accounts').select('id, name').eq('id', targetId).single();
    if (!sourceAcc || !targetAcc) throw new Error('源账户或目标账户不存在');

    // 2. 将所有作为来源的交易更新
    const { error: err1 } = await supabase
        .from('transactions')
        .update({ from_account_id: targetId } as any)
        .eq('from_account_id', sourceId);
    if (err1) throw err1;

    // 3. 将所有作为去向的交易更新
    const { error: err2 } = await supabase
        .from('transactions')
        .update({ to_account_id: targetId } as any)
        .eq('to_account_id', sourceId);
    if (err2) throw err2;

    // 4. 将所有校准记录更新为目标账户
    const { error: err3 } = await supabase
        .from('calibrations')
        .update({ account_id: targetId } as any)
        .eq('account_id', sourceId);
    if (err3) throw err3;

    // 5. 停用源账户
    const { error: err4 } = await supabase
        .from('accounts')
        .update({ is_active: false, deactivated_at: new Date().toISOString() } as any)
        .eq('id', sourceId);
    if (err4) throw err4;

    // 6. 失效缓存
    await invalidateCache({ accountId: sourceId });
    await invalidateCache({ accountId: targetId });

    return { success: true };
}

/**
 * 获取单个账户信息
 */
export async function getAccountById(id: string): Promise<AccountRow | null> {
    const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', id)
        .single();

    if (error) return null;
    return data as AccountRow;
}

/**
 * 查找账户的子账户（按币种）
 */
export async function findSubAccountByCurrency(parentId: string, currency: string): Promise<AccountRow | null> {
    const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('parent_id', parentId)
        .eq('currency', currency)
        .eq('is_group', false)
        .single();

    if (error) return null;
    return data as AccountRow;
}

/**
 * 创建币种子账户
 * 名称自动使用币种代码
 */
async function createCurrencySubAccount(parentId: string, currency: string): Promise<AccountRow> {
    const { data: parent } = await supabase
        .from('accounts')
        .select('type, account_class, name')
        .eq('id', parentId)
        .single();

    if (!parent) throw new Error('父账户不存在');

    const { data: inserted, error } = await supabase
        .from('accounts')
        .insert({
            name: currency, // 使用币种代码作为名称
            parent_id: parentId,
            type: parent.type,
            account_class: parent.account_class,
            is_group: false,
            is_system: false,
            is_active: true,
            currency: currency,
        } as any)
        .select()
        .single();

    if (error) throw error;
    return inserted as AccountRow;
}

/**
 * 迁移交易到指定账户
 * 将指定账户的交易按币种迁移到目标子账户
 */
async function migrateTransactionsByCurrency(
    fromAccountId: string,
    toAccountId: string,
    currency: string
): Promise<number> {
    // 更新作为来源的交易
    const { data: fromTxs, error: err1 } = await supabase
        .from('transactions')
        .update({ from_account_id: toAccountId } as any)
        .eq('from_account_id', fromAccountId)
        .eq('currency', currency)
        .select('id');

    if (err1) throw err1;

    // 更新作为去向的交易
    const { data: toTxs, error: err2 } = await supabase
        .from('transactions')
        .update({ to_account_id: toAccountId } as any)
        .eq('to_account_id', fromAccountId)
        .eq('currency', currency)
        .select('id');

    if (err2) throw err2;

    return (fromTxs?.length || 0) + (toTxs?.length || 0);
}

/**
 * 添加币种子账户
 * 如果父账户是叶子账户，自动转换为分组并迁移交易
 * 注意：交易表没有币种字段，所有交易将迁移到原币种子账户
 */
export async function addCurrencySubAccount(parentId: string, newCurrency: string): Promise<{
    created: string[];
    migratedCount: number;
}> {
    const parent = await getAccountById(parentId);
    if (!parent) throw new Error('账户不存在');

    const created: string[] = [];
    let migratedCount = 0;

    // 如果父账户是叶子账户，需要转换
    if (!parent.is_group) {
        const originalCurrency = parent.currency || 'CNY';

        // 1. 将父账户转为分组
        await supabase
            .from('accounts')
            .update({ is_group: true, currency: null } as any)
            .eq('id', parentId);

        // 2. 创建原币种子账户
        const originalSubAccount = await createCurrencySubAccount(parentId, originalCurrency);
        created.push(originalCurrency);

        // 3. 将所有交易迁移到原币种子账户
        const { data: fromTxs, error: err1 } = await supabase
            .from('transactions')
            .update({ from_account_id: originalSubAccount.id } as any)
            .eq('from_account_id', parentId)
            .select('id');

        if (err1) throw err1;

        const { data: toTxs, error: err2 } = await supabase
            .from('transactions')
            .update({ to_account_id: originalSubAccount.id } as any)
            .eq('to_account_id', parentId)
            .select('id');

        if (err2) throw err2;

        migratedCount = (fromTxs?.length || 0) + (toTxs?.length || 0);

        // 4. 如果新币种和原币种不同，创建新币种子账户
        if (newCurrency !== originalCurrency) {
            await createCurrencySubAccount(parentId, newCurrency);
            created.push(newCurrency);
        }
    } else {
        // 父账户已经是分组，直接检查是否存在该币种子账户
        const existing = await findSubAccountByCurrency(parentId, newCurrency);
        if (!existing) {
            await createCurrencySubAccount(parentId, newCurrency);
            created.push(newCurrency);
        }
    }

    await invalidateCache({ global: true });

    return { created, migratedCount };
}

/**
 * 解析交易的目标账户
 * 用于批量导入时根据账户名和币种自动匹配或创建户头
 */
export async function resolveAccountForTransaction(
    accountName: string,
    currency: string
): Promise<string> {
    // 1. 查找账户（精确匹配或模糊匹配）
    const { data: rawAccounts } = await supabase
        .from('accounts')
        .select('*')
        .ilike('name', accountName)
        .eq('is_active', true);

    const accounts = rawAccounts as AccountRow[] | null;

    if (!accounts || accounts.length === 0) {
        throw new Error(`账户不存在: ${accountName}`);
    }

    // 如果有多个匹配，优先选择叶子账户
    const account = accounts.find(a => !a.is_group) || accounts[0];

    // 2. 如果是分组，查找或创建对应币种的子账户
    if (account.is_group) {
        let subAccount = await findSubAccountByCurrency(account.id, currency);
        if (!subAccount) {
            subAccount = await createCurrencySubAccount(account.id, currency);
        }
        return subAccount.id;
    }

    // 3. 如果是叶子账户且币种匹配，直接返回
    if (account.currency === currency) {
        return account.id;
    }

    // 4. 币种不匹配，触发转换
    await addCurrencySubAccount(account.id, currency);
    const subAccount = await findSubAccountByCurrency(account.id, currency);
    if (!subAccount) throw new Error('创建币种户头失败');

    return subAccount.id;
}
