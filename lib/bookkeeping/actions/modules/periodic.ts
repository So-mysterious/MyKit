/**
 * [性质]: [功能] 周期任务管理模块
 * [Input]: Supabase
 * [Output]: 周期任务CRUD, executePeriodicTasks (自动执行)
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */

import { supabase } from '@/lib/supabase/client';
import { SYSTEM_ACCOUNT_IDS } from '@/types/database';
import { createTransaction } from './transactions';

/**
 * 获取周期任务列表
 */
export async function getPeriodicTasks() {
    const { data, error } = await supabase
        .from('periodic_tasks')
        .select(`
            *,
            from_account:accounts!periodic_tasks_from_account_id_fkey(name, currency, type, full_path),
            to_account:accounts!periodic_tasks_to_account_id_fkey(name, currency, type, full_path),
            project:projects(name)
        `)
        .order('next_run_date', { ascending: true });

    if (error) throw error;
    return data || [];
}

/**
 * 创建周期任务
 */
export async function createPeriodicTask(data: any) {
    const { data: inserted, error } = await supabase
        .from('periodic_tasks')
        .insert({
            ...data,
            is_active: true
        } as any)
        .select()
        .single();

    if (error) throw error;
    return inserted;
}

/**
 * 更新周期任务
 */
export async function updatePeriodicTask(id: string, data: any) {
    const { data: updated, error } = await supabase
        .from('periodic_tasks')
        .update(data)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return updated;
}

/**
 * 删除周期任务
 */
export async function deletePeriodicTask(id: string) {
    const { error } = await supabase.from('periodic_tasks').delete().eq('id', id);
    if (error) throw error;
    return true;
}

/**
 * 切换周期任务状态
 */
export async function togglePeriodicTaskActive(id: string, isActive: boolean) {
    const { data, error } = await supabase
        .from('periodic_tasks')
        .update({ is_active: isActive })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * 执行到期的周期任务
 */
export async function executePeriodicTasks() {
    const today = new Date().toISOString().split('T')[0];
    const { data: tasks, error } = await supabase
        .from('periodic_tasks')
        .select('*')
        .eq('is_active', true)
        .lte('next_run_date', today);

    if (error) throw error;
    if (!tasks || tasks.length === 0) return { executed: 0, tasks: [] };

    let executedCount = 0;
    const executedTasks: Array<{ taskId: string; taskName: string; date: string }> = [];

    for (const task of tasks as any[]) {
        let currentRunDate = task.next_run_date;

        while (currentRunDate <= today) {
            await createTransaction({
                from_account_id: task.from_account_id,
                to_account_id: task.to_account_id || SYSTEM_ACCOUNT_IDS.EXPENSE_ROOT,
                amount: task.amount,
                nature: 'periodic',
                description: task.description || `周期任务自动执行`,
                date: `${currentRunDate}T12:00:00.000Z`,
            });

            executedTasks.push({
                taskId: task.id,
                taskName: task.description || '周期交易',
                date: currentRunDate
            });

            const nextDate = new Date(currentRunDate);
            if (task.frequency === 'daily') nextDate.setDate(nextDate.getDate() + 1);
            else if (task.frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
            else if (task.frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
            else if (task.frequency === 'yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);
            else break;

            currentRunDate = nextDate.toISOString().split('T')[0];
            executedCount++;
        }

        await supabase.from('periodic_tasks').update({ next_run_date: currentRunDate }).eq('id', task.id);
    }

    return { executed: executedCount, tasks: executedTasks };
}
