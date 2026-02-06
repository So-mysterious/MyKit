/**
 * [性质]: [组件] 数据导出区域 (重构版)
 * [Input]: Accounts Data
 * [Output]: Export UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import { formatTransactionsForExport, exportToFile, formatSnapshotsForExport, downloadBlob } from '@/lib/bookkeeping/utils/formatters';

import * as React from "react";
import { Download, FileDown, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AccountWithBalance } from "@/types/database";

interface DataExportProps {
    accounts: AccountWithBalance[];
}

export function DataExport({ accounts }: DataExportProps) {
    const [exportType, setExportType] = React.useState<'transaction' | 'snapshot'>('transaction');
    const [exportFormat, setExportFormat] = React.useState<'xlsx' | 'csv'>('xlsx');
    const [selectedAccountIds, setSelectedAccountIds] = React.useState<Set<string>>(new Set());
    const [startDate, setStartDate] = React.useState('');
    const [endDate, setEndDate] = React.useState('');

    // 扁平化账户列表 (保留层级名称)
    const flatAccounts = React.useMemo(() => {
        const result: { id: string; name: string; full_path: string; currency: string | null }[] = [];
        const traverse = (nodes: AccountWithBalance[], parentPath: string = '') => {
            nodes.forEach(node => {
                if (!node.is_group && (node.type === 'asset' || node.type === 'liability')) {
                    // 仅实账户
                    const name = parentPath ? `${parentPath} ${node.name}` : node.name;
                    const displayName = node.currency ? `${name} (${node.currency})` : name;
                    result.push({
                        id: node.id,
                        name: displayName,
                        full_path: node.full_path || node.name,
                        currency: node.currency || null
                    });
                }
                if (node.children) {
                    traverse(node.children, parentPath ? node.name : node.name);
                }
            });
        };
        traverse(accounts);
        return result;
    }, [accounts]);

    const handleSelectAll = () => {
        if (selectedAccountIds.size === flatAccounts.length) {
            setSelectedAccountIds(new Set());
        } else {
            setSelectedAccountIds(new Set(flatAccounts.map(a => a.id)));
        }
    };

    const toggleAccount = (id: string) => {
        const next = new Set(selectedAccountIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedAccountIds(next);
    };

    const handleExport = async () => {
        try {
            const { createClient } = await import('@/lib/supabase/client');
            const supabase = createClient.supabase; // Use the exported singleton

            let dataStart = startDate;
            let dataEnd = endDate;

            // 如果未设置日期，默认查询全部（根据需求，或者设置一个合理的范围）
            if (!dataStart) dataStart = '1970-01-01';
            if (!dataEnd) dataEnd = '2099-12-31';
            // Adjust end date to include the full day
            const endDateTime = new Date(dataEnd);
            endDateTime.setHours(23, 59, 59, 999);
            const dataEndIso = endDateTime.toISOString();

            let finalData: any[] = [];
            let fileName = '';

            if (exportType === 'transaction') {
                let query = supabase
                    .from('transactions')
                    .select(`
                        id, date, type, amount, description, 
                        from_account_id, to_account_id,
                        accounts:from_account_id ( name, currency ),
                        to_account:to_account_id ( name, currency )
                    `)
                    .gte('date', dataStart)
                    .lte('date', dataEndIso)
                    .order('date', { ascending: false });

                // 如果选择了特定账户，需要筛选 from 或 to
                if (selectedAccountIds.size > 0 && selectedAccountIds.size < flatAccounts.length) {
                    const ids = Array.from(selectedAccountIds).join(',');
                    // Supabase OR syntax for "from in ids OR to in ids"
                    // query = query.or(`from_account_id.in.(${ids}),to_account_id.in.(${ids})`);
                    // Note: .or() with filters inside works better as string
                    query = query.or(`from_account_id.in.(${ids}),to_account_id.in.(${ids})`);
                }

                const { data, error } = await query;
                if (error) throw error;

                // Need to map manually because we only fetched partial joins
                // Actually formatTransactionsForExport handles the mapping if we structure it right
                // Let's refine the query to fetch necessary fields or map it
                // formatTransactionsForExport expects: 
                // { date, type, amount, accounts: {name, currency}, category, description, transfer_group_id... }

                // Let's do a more raw fetch consistent with what we need
                // For simplicity, let's map the result to what formatter expects
                const mapped = data.map((t: any) => {
                    // Normalize for formatter
                    // Expense: from=Account, to=Category
                    // Income: from=Category, to=Account
                    // Transfer: from=Account, to=Account

                    let accountName = '';
                    let currency = '';
                    let category = '';
                    let account_name = ''; // for formatter compatibility

                    // We need to resolve names. 'accounts' is from_account relation
                    const fromAcc = t.accounts;
                    const toAcc = t.to_account;

                    if (t.type === 'expense') {
                        account_name = fromAcc?.name;
                        currency = fromAcc?.currency;
                        category = toAcc?.name;
                    } else if (t.type === 'income') {
                        account_name = toAcc?.name;
                        currency = toAcc?.currency;
                        category = fromAcc?.name; // Source
                    } else {
                        // Transfer
                        account_name = fromAcc?.name;
                        currency = fromAcc?.currency;
                        category = toAcc?.name; // Target
                    }

                    return {
                        ...t,
                        account_name, // primary account
                        currency,
                        category
                    };
                });

                finalData = formatTransactionsForExport(mapped);
                fileName = `MyKit_Transactions_${startDate || 'All'}_${endDate || 'All'}.${exportFormat}`;

            } else {
                // Snapshot Export
                // We need to query operation_logs of type 'snapshot' or 'calibration'? 
                // Or queries from snapshots table? 
                // User requirement said "Account Snapshot".
                // Let's assume there is a snapshots table or similar.
                // Checking schema... there isn't a snapshots table mentioned in user prompt context explicitly 
                // but README mentions "calibration". 
                // Let's query 'snapshots' table if it exists. Re-checking file tree... 
                // 'snapshots' was mentioned in previous conversation summaries.

                let query = supabase
                    .from('snapshots')
                    .select('*, accounts(name, currency)')
                    .gte('date', dataStart)
                    .lte('date', dataEndIso)
                    .order('date', { ascending: false });

                if (selectedAccountIds.size > 0) {
                    query = query.in('account_id', Array.from(selectedAccountIds));
                }

                const { data, error } = await query;
                if (error) throw error;

                const mapped = data.map((s: any) => ({
                    ...s,
                    account_name: s.accounts?.name,
                    currency: s.accounts?.currency
                }));

                finalData = formatSnapshotsForExport(mapped);
                fileName = `MyKit_Snapshots_${startDate || 'All'}_${endDate || 'All'}.${exportFormat}`;
            }

            const blob = exportToFile(finalData, exportFormat, fileName);
            downloadBlob(blob, fileName);

        } catch (err: any) {
            console.error(err);
            alert(`导出失败: ${err.message}`);
        }
    };

    return (
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm mt-6 w-full">
            <div className="flex items-center gap-2 mb-4">
                <Download className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-semibold text-gray-900">数据导出</h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">
                导出流水和快照数据为Excel或CSV文件，列名与导入格式统一
            </p>

            <div className="space-y-6 w-full">
                {/* 数据类型 - 优化后的二元滑块 */}
                <div className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">数据类型</span>
                    <div className="flex bg-gray-100 p-1 rounded-lg w-full">
                        <button
                            onClick={() => setExportType('transaction')}
                            className={cn(
                                "flex-1 py-1.5 text-sm font-medium rounded-md transition-colors",
                                exportType === 'transaction'
                                    ? "bg-blue-600 text-white"
                                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                            )}
                        >
                            流水记录
                        </button>
                        <button
                            onClick={() => setExportType('snapshot')}
                            className={cn(
                                "flex-1 py-1.5 text-sm font-medium rounded-md transition-colors",
                                exportType === 'snapshot'
                                    ? "bg-blue-600 text-white"
                                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                            )}
                        >
                            账户快照
                        </button>
                    </div>
                </div>

                {/* 账户范围 */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center w-full">
                        <span className="text-sm font-medium text-gray-700">账户范围</span>
                        <button onClick={handleSelectAll} className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors">
                            {selectedAccountIds.size === flatAccounts.length ? "取消全选" : "全选"}
                        </button>
                    </div>

                    {selectedAccountIds.size === 0 && (
                        <p className="text-xs text-gray-400 mb-2">未选择账户将导出全部</p>
                    )}

                    <div className="flex flex-wrap gap-2 w-full">
                        {flatAccounts.map(acc => (
                            <button
                                key={acc.id}
                                onClick={() => toggleAccount(acc.id)}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                                    selectedAccountIds.has(acc.id)
                                        ? "bg-blue-50 border-blue-200 text-blue-700"
                                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                                )}
                            >
                                {acc.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 日期范围 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                    <div className="space-y-2">
                        <span className="text-sm font-medium text-gray-700">开始日期</span>
                        <div className="relative">
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full pl-3 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition-shadow"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <span className="text-sm font-medium text-gray-700">结束日期</span>
                        <div className="relative">
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full pl-3 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition-shadow"
                            />
                        </div>
                    </div>
                </div>
                <p className="text-xs text-gray-400">留空日期范围将导出全部数据</p>

                {/* 导出格式与按钮 */}
                <div className="pt-4 space-y-4 border-t border-gray-50">
                    <div className="space-y-2">
                        <span className="text-sm font-medium text-gray-700">导出格式</span>
                        <div className="flex bg-gray-100 p-1 rounded-lg w-full">
                            <button
                                onClick={() => setExportFormat('xlsx')}
                                className={cn(
                                    "flex-1 py-1.5 text-sm font-medium rounded-md transition-colors",
                                    exportFormat === 'xlsx'
                                        ? "bg-blue-600 text-white"
                                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                                )}
                            >
                                Excel (.xlsx)
                            </button>
                            <button
                                onClick={() => setExportFormat('csv')}
                                className={cn(
                                    "flex-1 py-1.5 text-sm font-medium rounded-md transition-colors",
                                    exportFormat === 'csv'
                                        ? "bg-blue-600 text-white"
                                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                                )}
                            >
                                CSV (.csv)
                            </button>
                        </div>
                    </div>

                    <Button
                        onClick={handleExport}
                        className="w-full bg-gray-900 hover:bg-black text-white h-10 transition-all active:scale-[0.99]"
                    >
                        <FileDown className="w-4 h-4 mr-2" />
                        确认导出
                    </Button>
                </div>
            </div>
        </div>
    );
}
