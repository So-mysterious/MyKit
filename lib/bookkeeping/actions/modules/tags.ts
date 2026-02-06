/**
 * [性质]: [适配] 标签管理模块 (虚账户层)
 * [Input]: Supabase
 * [Output]: listTags, createTag (映射到 accounts 表)
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
/**
 * 标签管理模块 (适配复式记账 - 虚账户化)
 * 
 * 在新架构中，标签实际上是挂载在收入/支出根账户下的虚账户。
 * 此模块通过适配层，将前端的标签操作映射到账户表。
 */

import { supabase } from '@/lib/supabase/client';
import { SYSTEM_ACCOUNT_IDS } from '@/lib/constants';
import { invalidateCache } from './cache';

import { BookkeepingKind } from './types';

const KIND_TO_ROOT: Record<string, string> = {
    income: SYSTEM_ACCOUNT_IDS.INCOME_ROOT,
    expense: SYSTEM_ACCOUNT_IDS.EXPENSE_ROOT,
};

/**
 * 获取所有“标签”账户（损益类虚账户）
 */
export async function listTags() {
    const { data: accounts, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('account_class', 'nominal')
        .in('parent_id', [SYSTEM_ACCOUNT_IDS.INCOME_ROOT, SYSTEM_ACCOUNT_IDS.EXPENSE_ROOT])
        .order('name');

    if (error) throw error;

    // 适配为旧的 TagRow 格式
    return ((accounts || []) as any[]).map(acc => ({
        id: acc.id,
        kind: acc.parent_id === SYSTEM_ACCOUNT_IDS.INCOME_ROOT ? 'income' : 'expense',
        name: acc.name,
        description: acc.description,
        is_active: acc.is_active,
        created_at: acc.created_at
    }));
}

/**
 * 获取可用标签 (仅限活跃的)
 */
export async function getAvailableTags() {
    const tags = await listTags();
    return tags.filter(t => t.is_active);
}

/**
 * 创建标签（实际上是创建虚账户）
 */
export async function createTag(data: {
    kind: BookkeepingKind;
    name: string;
    description?: string;
    is_active?: boolean;
}) {
    if (data.kind === 'transfer') {
        throw new Error('划转不再支持标签');
    }

    const parentId = KIND_TO_ROOT[data.kind];
    if (!parentId) throw new Error('无效的标签类型');

    const { data: inserted, error } = await supabase
        .from('accounts')
        .insert({
            name: data.name,
            parent_id: parentId,
            type: data.kind,
            account_class: 'nominal',
            is_group: false,
            is_system: false,
            is_active: data.is_active ?? true,
            description: data.description || null,
        } as any)
        .select()
        .single();

    if (error) throw error;

    await invalidateCache({ global: true });
    return inserted;
}

/**
 * 更新标签
 */
export async function updateTag(id: string, data: Partial<{
    name: string;
    description: string;
    is_active: boolean;
}>) {
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
 * 删除标签
 */
export async function deleteTag(id: string) {
    // 1. 检查是否有交易记录
    const { count: txCount, error: txError } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .or(`from_account_id.eq.${id},to_account_id.eq.${id}`);

    if (txError) throw txError;
    if (txCount && txCount > 0) {
        throw new Error('该标签已有相关交易流水，无法删除。建议先将其“停用”。');
    }

    // 2. 检查是否有周期性任务使用
    const { count: ptCount, error: ptError } = await supabase
        .from('periodic_tasks')
        .select('*', { count: 'exact', head: true })
        .or(`from_account_id.eq.${id},to_account_id.eq.${id}`);

    if (ptError) throw ptError;
    if (ptCount && ptCount > 0) {
        throw new Error('该标签正被某些“周期性任务”使用，无法删除。请先修改或删除相关周期性任务，或将此标签“停用”。');
    }

    // 3. 执行删除
    const { error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', id);

    if (error) throw error;

    await invalidateCache({ global: true });
    return true;
}
