/**
 * [性质]: [Action] 导入历史管理
 * [Input]: import_batches
 * [Output]: 批次列表 / 撤销结果
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */

"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getImportBatches() {
    const supabase = await createClient();

    const { data: rawData, error } = await supabase
        .from('operation_logs')
        .select('*')
        .eq('type', 'import')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Fetch Batches Error:', error);
        throw new Error('获取导入记录失败');
    }

    const data = rawData as any[];

    return data.map(row => ({
        id: row.id,
        created_at: row.created_at,
        filename: row.filename || 'Unknown',
        total_rows: row.total_rows || 0,
        uploaded_count: row.transaction_ids?.length || 0,
        valid_count: (row.rows_valid_uploaded?.length || 0) + (row.rows_valid_skipped?.length || 0),
        duplicate_count: (row.rows_duplicate_uploaded?.length || 0) + (row.rows_duplicate_skipped?.length || 0),
        invalid_count: row.rows_error?.length || 0,
        status: row.status,
        transaction_ids: row.transaction_ids || [],
        error_summary: row.details?.error_summary || null,
        upload_duration_ms: row.details?.duration_ms || null,
        user_notes: row.notes
    }));
}

export async function rollbackImportBatch(batchId: string) {
    const supabase = await createClient();

    const { data: batch, error: fetchError } = await supabase
        .from('operation_logs')
        .select('transaction_ids, status')
        .eq('id', batchId)
        .single();

    if (fetchError || !batch) {
        return { success: false, error: '未找到该导入批次' };
    }

    if (batch.status === 'rolled_back') {
        return { success: false, error: '该批次已撤销' };
    }

    const txIds = (batch as any).transaction_ids as string[];

    if (txIds && txIds.length > 0) {
        const { error: deleteError } = await supabase
            .from('transactions')
            .delete()
            .in('id', txIds);

        if (deleteError) {
            return { success: false, error: '删除交易失败: ' + deleteError.message };
        }
    }

    const { error: updateError } = await supabase
        .from('operation_logs')
        .update({ status: 'rolled_back' } as any)
        .eq('id', batchId);

    if (updateError) {
        return { success: false, error: '更新批次状态失败' };
    }

    revalidatePath('/bookkeeping/data');
    revalidatePath('/bookkeeping/transactions');
    revalidatePath('/bookkeeping/accounts');
    revalidatePath('/bookkeeping/dashboard');

    return {
        success: true,
        deletedCount: txIds.length,
        skippedCount: 0
    };
}
