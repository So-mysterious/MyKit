/**
 * [性质]: [Server Action] 数据导入核心逻辑 (分块处理版)
 * [Input]: Import Rows Chunk
 * [Output]: IDs, Errors
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createTransaction } from "./modules/transactions"; // Import internal core
import { supabase } from "@/lib/supabase/client"; // Careful with this static import!
// Note on static supabase client: We will use the instance from `createClient()` (Server Action Context) for DB ops to ensure Auth.

export interface ImportTransactionData {
    date: string;
    type: 'expense' | 'income' | 'transfer';
    amount: number;
    accountId: string;
    categoryName?: string;
    categoryId?: string;

    toAccountId?: string;
    toAmount?: number;

    description?: string;
    location?: string;
    project?: string;
    nature?: 'regular' | 'unexpected' | 'periodic';
    isStarred?: boolean;
    needsReview?: boolean;
}

export interface ChunkResult {
    success: boolean;
    insertedIds: string[];
    errors: { message: string, row?: any }[];
}

// 1. 处理分块数据
export async function processImportChunk(
    transactions: ImportTransactionData[]
): Promise<ChunkResult> {
    const supabase = await createClient();

    // 先拉取 Account Map 优化查询 (每次 chunk 都拉取有点浪费，但比每行查询好)
    // 理想情况 Account Map 应该传入，但 Server Action 不能轻易传复杂对象 Map? Can pass array.
    // 简单起见，这里还是查一次 Accounts，或者假设 IDs 已经很完善。
    // 如果 Parser 已经尽量解析了 ID，我们可以信任 ID。

    // Refine ID logic: Parser usually resolves IDs. 
    // Fallback logic for System Roots should be here or Parser? 
    // Let's keep the fallback logic here for safety.

    const { data: allAccounts } = await supabase.from('accounts').select('id, name, type');
    const accountMap = new Map((allAccounts || []).map(a => [a.name, a.id]));

    const SYSTEM_IDS = {
        INCOME_ROOT: '00000000-0000-0000-0000-000000000003',
        EXPENSE_ROOT: '00000000-0000-0000-0000-000000000004',
    };

    const insertedIds: string[] = [];
    const errors: { message: string, row?: any }[] = [];

    // Parallel processing Helper
    // Process in smaller batches inside the chunk to control concurrency
    const BATCH_SIZE = 5;

    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
        const batch = transactions.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (tx) => {
            try {
                // --- ID 解析补全 ---
                let fromId = "";
                let toId = "";

                if (tx.type === 'transfer') {
                    fromId = tx.accountId;
                    toId = tx.toAccountId!;
                } else if (tx.type === 'expense') {
                    fromId = tx.accountId;
                    if (tx.categoryId) {
                        toId = tx.categoryId;
                    } else if (tx.categoryName) {
                        const acc = (allAccounts || []).find(a => a.name === tx.categoryName && a.type === 'expense');
                        if (acc) {
                            toId = acc.id;
                        } else if (accountMap.has('费用')) {
                            // Very Simplified Fallback
                            toId = (allAccounts || []).find(a => a.type === 'expense')?.id || SYSTEM_IDS.EXPENSE_ROOT;
                        } else {
                            toId = SYSTEM_IDS.EXPENSE_ROOT;
                        }
                    } else {
                        toId = SYSTEM_IDS.EXPENSE_ROOT;
                    }
                } else if (tx.type === 'income') {
                    toId = tx.accountId;
                    if (tx.categoryId) {
                        fromId = tx.categoryId;
                    } else if (tx.categoryName) {
                        const acc = (allAccounts || []).find(a => a.name === tx.categoryName && a.type === 'income');
                        fromId = acc ? acc.id : SYSTEM_IDS.INCOME_ROOT;
                    } else {
                        fromId = SYSTEM_IDS.INCOME_ROOT;
                    }
                }

                // Payload
                const payload: any = {
                    date: tx.date,
                    amount: Math.abs(tx.amount),
                    from_account_id: fromId,
                    to_account_id: toId,
                    from_amount: tx.type === 'transfer' ? Math.abs(tx.amount) : null,
                    to_amount: tx.type === 'transfer' ? (tx.toAmount || Math.abs(tx.amount)) : null,
                    description: tx.description || (tx.categoryName || '批量导入'),
                    needs_review: tx.needsReview || false,
                    is_starred: tx.isStarred || false,
                    nature: tx.nature || 'regular',
                    location: tx.location || null,
                };

                // Execute with skipRevalidation: true
                const inserted = await createTransaction(payload, supabase, { skipRevalidation: true });
                insertedIds.push(inserted.id);

            } catch (err: any) {
                console.error("Row Error:", err.message);
                errors.push({ message: err.message, row: tx });
            }
        }));
    }

    return { success: true, insertedIds, errors };
}

// 2. 保存并完结日志
export async function saveImportLog(
    filename: string,
    rawStats: any,
    insertedIds: string[], // Full list of IDs
    validRowsLog: any[] // Full log details
): Promise<{ success: boolean, batchId?: string, error?: string }> {
    const supabase = await createClient();

    const logPayload = {
        type: 'import',
        status: 'completed',
        filename: filename,
        total_rows: rawStats.totalUpload + rawStats.invalid + (rawStats.skipped || 0),

        // Rows count?
        // rawStats should come from Client's aggregated stats
        rows_valid_uploaded: validRowsLog, // This might be HUGE. 
        // Note: JSONB limit is ~255MB? Should be fine for 500 rows.
        rows_valid_skipped: rawStats.validSkippedRows || [],
        rows_duplicate_uploaded: rawStats.duplicateUploadedRows || [],
        rows_duplicate_skipped: rawStats.duplicateSkippedRows || [],
        rows_error: rawStats.errorRows || [],

        transaction_ids: insertedIds,

        // Deprecated 'columns'? 
        // Align with new schema.
    };

    try {
        const { data: logData, error: logError } = await supabase
            .from('operation_logs')
            .insert(logPayload)
            .select('id')
            .single();

        if (logError) throw logError;

        // Final Revalidate
        revalidatePath('/bookkeeping/data');
        revalidatePath('/bookkeeping/transactions');

        return { success: true, batchId: logData.id };
    } catch (e: any) {
        console.error("Failed to save log:", e);
        return { success: false, error: e.message };
    }
}
