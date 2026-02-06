/**
 * [性质]: [功能] 项目管理模块
 * [Input]: Supabase
 * [Output]: 项目CRUD
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */

import { supabase } from '@/lib/supabase/client';

/**
 * 获取项目列表
 */
export async function getProjects(activeOnly: boolean = true) {
    let query = supabase.from('projects').select('*').order('name');
    if (activeOnly) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

/**
 * 创建项目
 */
export async function createProject(data: {
    name: string;
    description?: string;
    start_date?: string;
    end_date?: string;
}) {
    const { data: inserted, error } = await supabase
        .from('projects')
        .insert({
            name: data.name,
            description: data.description || null,
            start_date: data.start_date || null,
            end_date: data.end_date || null,
            is_active: true
        })
        .select()
        .single();

    if (error) throw error;
    return inserted;
}

/**
 * 更新项目
 */
export async function updateProject(id: string, data: Partial<{
    name: string;
    description: string;
    start_date: string;
    end_date: string;
    is_active: boolean;
}>) {
    const { data: updated, error } = await supabase
        .from('projects')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return updated;
}

/**
 * 删除项目
 */
export async function deleteProject(id: string) {
    // 先检查是否有关联交易
    const { count } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', id);

    if (count && count > 0) {
        throw new Error('该项目下有关联交易，无法删除。请先移除交易的项目关联或停用项目。');
    }

    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
    return true;
}
