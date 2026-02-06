/**
 * [性质]: [Action] 数据导出 - 数据获取
 * [Input]: Filters
 * [Output]: Transactions / Snapshots Data
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */

"use server";

import { createClient } from "@/lib/supabase/server";

export async function getExportData(options: {
    startDate?: string;
    endDate?: string;
    includeTransactions?: boolean;
    includeSnapshots?: boolean;
}) {
    const supabase = await createClient();
    const { startDate, endDate, includeTransactions = true, includeSnapshots = true } = options;

    const result = {
        transactions: [] as any[],
        snapshots: [] as any[]
    };

    // 1. 获取充值/消费流水
    if (includeTransactions) {
        let query = supabase
            .from('transactions')
            .select(`
                *,
                from_account:from_account_id(name, currency),
                to_account:to_account_id(name, currency)
            `)
            .order('date', { ascending: false });

        if (startDate) query = query.gte('date', startDate);
        if (endDate) query = query.lte('date', endDate + ' 23:59:59');

        const { data, error } = await query;
        if (error) throw new Error("Fetch transactions failed: " + error.message);
        result.transactions = data || [];
    }

    // 2. 获取快照
    if (includeSnapshots) {
        // Snapshot 并没有直接的 date 过滤? 假设有 created_at
        // 快照表通常是 snapshots.
        // 注意：snapshot 关联 account_id
        let query = supabase
            .from('snapshots')
            .select(`
                *,
                account:account_id(name, currency)
            `)
            .order('created_at', { ascending: false });

        if (startDate) query = query.gte('created_at', startDate);
        if (endDate) query = query.lte('created_at', endDate + ' 23:59:59');

        const { data, error } = await query;
        if (error) throw new Error("Fetch snapshots failed: " + error.message);
        result.snapshots = data || [];
    }

    return result;
}
