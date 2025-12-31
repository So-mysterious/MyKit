"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ImportWizard } from "@/components/ImportWizard";
import { ImportHistory } from "@/components/ImportHistory";
import {
    Upload,
    Download,
    Database,
    RefreshCw,
    Loader2,
} from "lucide-react";
import { getExportData, getAccounts } from "@/lib/bookkeeping/actions";
import * as XLSX from "xlsx";

// ============================================
// 类型定义
// ============================================

interface Account {
    id: string;
    name: string;
    currency: string;
}

// ============================================
// 列名映射 - 导出时从数据库字段名转换为可读的中文
// ============================================

const TRANSACTION_COLUMN_MAP: Record<string, string> = {
    'date': '日期',
    'type': '类型',
    'amount': '金额',
    'account_name': '账户',
    'category': '分类',
    'description': '备注',
    'account_currency': '币种',
    'created_at': '创建时间',
    'nominal_amount': '原始金额',
    'nominal_currency': '原始币种',
};

const SNAPSHOT_COLUMN_MAP: Record<string, string> = {
    'date': '日期',
    'account_name': '账户',
    'balance': '余额',
    'type': '类型',
    'account_currency': '币种',
    'created_at': '创建时间',
};

// 类型值映射
const TYPE_VALUE_MAP: Record<string, string> = {
    'income': '收入',
    'expense': '支出',
    'transfer': '划转',
};

// ============================================
// 导出部分
// ============================================

interface ExportSectionProps {
    accounts: Account[];
}

function ExportSection({ accounts }: ExportSectionProps) {
    const [exporting, setExporting] = React.useState(false);
    const [exportStartDate, setExportStartDate] = React.useState("");
    const [exportEndDate, setExportEndDate] = React.useState("");
    const [selectedAccountIds, setSelectedAccountIds] = React.useState<string[]>([]);
    // ✅ 改为二选一：'transactions' | 'snapshots'
    const [exportType, setExportType] = React.useState<'transactions' | 'snapshots'>('transactions');

    const handleToggleAccount = (accountId: string) => {
        setSelectedAccountIds(prev => {
            if (prev.includes(accountId)) {
                return prev.filter(id => id !== accountId);
            } else {
                return [...prev, accountId];
            }
        });
    };

    const handleSelectAllAccounts = () => {
        if (selectedAccountIds.length === accounts.length) {
            setSelectedAccountIds([]);
        } else {
            setSelectedAccountIds(accounts.map(a => a.id));
        }
    };

    // ============================================
    // 货币符号辅助函数
    // ============================================
    const getCurrencySymbol = (currency: string) => {
        const symbols: Record<string, string> = {
            'CNY': '¥',
            'USD': '$',
            'HKD': 'HK$',
            'EUR': '€',
            'GBP': '£',
            'JPY': '¥',
        };
        return symbols[currency] || currency;
    };

    // ============================================
    // 格式化日期时间（使用UTC，不做时区转换）
    // ============================================
    const formatDateTimeForExport = (dateStr: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const year = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        const hours = d.getUTCHours();
        const minutes = d.getUTCMinutes();
        const seconds = d.getUTCSeconds();

        // 如果有具体时间（不是00:00:00），则包含时间
        if (hours !== 0 || minutes !== 0 || seconds !== 0) {
            return `${year}-${month}-${day} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        return `${year}-${month}-${day}`;
    };

    // ============================================
    // 合并划转交易
    // ============================================
    const mergeTransfersForExport = (transactions: any[]) => {
        const result: any[] = [];
        const processedGroupIds = new Set<string>();

        // 按 transfer_group_id 分组
        const transferGroups = new Map<string, any[]>();
        transactions.forEach(tx => {
            if (tx.type === 'transfer' && tx.transfer_group_id) {
                if (!transferGroups.has(tx.transfer_group_id)) {
                    transferGroups.set(tx.transfer_group_id, []);
                }
                transferGroups.get(tx.transfer_group_id)!.push(tx);
            }
        });

        transactions.forEach(tx => {
            if (tx.type === 'transfer' && tx.transfer_group_id) {
                // 已处理过的划转组跳过
                if (processedGroupIds.has(tx.transfer_group_id)) return;

                const group = transferGroups.get(tx.transfer_group_id);
                if (group && group.length === 2) {
                    // 合并划转对：source (negative) -> target (positive)
                    const source = group.find((t: any) => t.amount < 0);
                    const target = group.find((t: any) => t.amount > 0);

                    if (source && target) {
                        result.push({
                            ...source,
                            _mergedTransfer: target,
                        });
                        processedGroupIds.add(tx.transfer_group_id);
                        return;
                    }
                }
                // 未配对的划转单独导出
                result.push(tx);
                processedGroupIds.add(tx.transfer_group_id);
            } else {
                // 非划转交易
                result.push(tx);
            }
        });

        return result;
    };

    // ============================================
    // 格式化单条交易为导出格式（标准8列）
    // ============================================
    const formatTransactionForExport = (tx: any) => {
        const symbol = getCurrencySymbol(tx.account_currency);
        const amount = Math.abs(tx.amount);

        const formatted: Record<string, any> = {
            '日期': formatDateTimeForExport(tx.date),
            '类型': TYPE_VALUE_MAP[tx.type] || tx.type,
            '金额': `${symbol}${amount.toFixed(2)}`,
            '账户': tx.account_name,
            '分类': tx.category || '',
            '备注': tx.description || '',
            '对方账户': '',
            '对方金额': '',
        };

        // 处理合并的划转
        if (tx._mergedTransfer) {
            const target = tx._mergedTransfer;
            const targetSymbol = getCurrencySymbol(target.account_currency);
            const targetAmount = Math.abs(target.amount);
            formatted['对方账户'] = target.account_name;
            formatted['对方金额'] = `${targetSymbol}${targetAmount.toFixed(2)}`;
        }

        return formatted;
    };

    const formatSnapshotForExport = (snap: any) => {
        const symbol = getCurrencySymbol(snap.account_currency);
        return {
            '日期': formatDateTimeForExport(snap.date),
            '账户': snap.account_name,
            '余额': `${symbol}${snap.balance.toFixed(2)}`,
            '类型': snap.type || '',
        };
    };

    const handleExport = async (format: "xlsx" | "csv") => {
        setExporting(true);
        try {
            const includeTransactions = exportType === 'transactions';
            const includeSnapshots = exportType === 'snapshots';

            const data = await getExportData({
                startDate: exportStartDate || undefined,
                endDate: exportEndDate || undefined,
                includeTransactions,
                includeSnapshots,
            });

            // 根据选择的账户过滤
            let transactions = data.transactions;
            let snapshots = data.snapshots;

            if (selectedAccountIds.length > 0) {
                transactions = transactions.filter(tx => selectedAccountIds.includes(tx.account_id));
                snapshots = snapshots.filter(snap => selectedAccountIds.includes(snap.account_id));
            }

            // ✅ 合并划转交易
            const mergedTransactions = mergeTransfersForExport(transactions);

            // 转换为可读格式
            const formattedTransactions = mergedTransactions.map(formatTransactionForExport);
            const formattedSnapshots = snapshots.map(formatSnapshotForExport);

            if (format === "xlsx") {
                const wb = XLSX.utils.book_new();

                if (includeTransactions && formattedTransactions.length > 0) {
                    const txSheet = XLSX.utils.json_to_sheet(formattedTransactions);
                    XLSX.utils.book_append_sheet(wb, txSheet, "流水");
                }

                if (includeSnapshots && formattedSnapshots.length > 0) {
                    const snapSheet = XLSX.utils.json_to_sheet(formattedSnapshots);
                    XLSX.utils.book_append_sheet(wb, snapSheet, "快照");
                }

                const today = new Date().toISOString().split("T")[0];
                const typeName = includeTransactions ? '流水' : '快照';
                XLSX.writeFile(wb, `${typeName}_${today}.xlsx`);
            } else {
                // CSV只导出选中的类型
                if (includeTransactions && formattedTransactions.length > 0) {
                    const txSheet = XLSX.utils.json_to_sheet(formattedTransactions);
                    const csv = XLSX.utils.sheet_to_csv(txSheet);
                    downloadFile(csv, `流水_${new Date().toISOString().split("T")[0]}.csv`, "text/csv");
                } else if (includeSnapshots && formattedSnapshots.length > 0) {
                    const snapSheet = XLSX.utils.json_to_sheet(formattedSnapshots);
                    const csv = XLSX.utils.sheet_to_csv(snapSheet);
                    downloadFile(csv, `快照_${new Date().toISOString().split("T")[0]}.csv`, "text/csv");
                }
            }

            const totalCount = includeTransactions ? formattedTransactions.length : formattedSnapshots.length;
            alert(`导出成功！共 ${totalCount} 条记录`);
        } catch (error: any) {
            alert(`导出失败: ${error.message}`);
        } finally {
            setExporting(false);
        }
    };

    return (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="space-y-6">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Download className="w-5 h-5 text-green-600" />
                        <h3 className="text-lg font-semibold text-gray-900">数据导出</h3>
                    </div>
                    <p className="text-sm text-gray-600">
                        导出流水和快照数据为Excel或CSV文件，列名与导入格式统一
                    </p>
                </div>

                {/* 数据类型选择 - 滑块二选一 */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">数据类型</label>
                    <div className="flex p-1 bg-gray-100 rounded-lg">
                        <button
                            type="button"
                            onClick={() => setExportType('transactions')}
                            className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all ${exportType === 'transactions'
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            流水记录
                        </button>
                        <button
                            type="button"
                            onClick={() => setExportType('snapshots')}
                            className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all ${exportType === 'snapshots'
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            账户快照
                        </button>
                    </div>
                </div>

                {/* 账户范围选择 */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700">账户范围</label>
                        <button
                            type="button"
                            onClick={handleSelectAllAccounts}
                            className="text-xs text-blue-600 hover:underline"
                        >
                            {selectedAccountIds.length === accounts.length ? '取消全选' : '全选'}
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {accounts.map(account => (
                            <label
                                key={account.id}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm cursor-pointer transition-colors ${selectedAccountIds.includes(account.id)
                                    ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                    : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                                    }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedAccountIds.includes(account.id)}
                                    onChange={() => handleToggleAccount(account.id)}
                                    className="sr-only"
                                />
                                {account.name}
                                <span className="text-xs opacity-70">{account.currency}</span>
                            </label>
                        ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        {selectedAccountIds.length === 0 ? '未选择账户将导出全部' : `已选择 ${selectedAccountIds.length} 个账户`}
                    </p>
                </div>

                {/* 日期范围 */}
                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
                        <input
                            type="date"
                            value={exportStartDate}
                            onChange={(e) => setExportStartDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
                        <input
                            type="date"
                            value={exportEndDate}
                            onChange={(e) => setExportEndDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        />
                    </div>
                </div>

                <div className="flex gap-3">
                    <Button onClick={() => handleExport("xlsx")} disabled={exporting} className="flex-1">
                        {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        导出Excel
                    </Button>
                    <Button onClick={() => handleExport("csv")} disabled={exporting} variant="outline" className="flex-1">
                        <Download className="w-4 h-4 mr-2" />
                        导出CSV
                    </Button>
                </div>

                <p className="text-xs text-gray-500">
                    留空日期范围将导出全部数据
                </p>
            </div>
        </section>
    );
}

function downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob(["\ufeff" + content], { type: mimeType + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ============================================
// 主页面
// ============================================

export default function DataManagementPage() {
    const [importWizardOpen, setImportWizardOpen] = React.useState(false);
    const [historyKey, setHistoryKey] = React.useState(0);
    const [accounts, setAccounts] = React.useState<Account[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const loadAccounts = async () => {
            try {
                const data = await getAccounts({ includeBalance: false });
                setAccounts(data as Account[]);
            } catch (error) {
                console.error('加载账户失败:', error);
            } finally {
                setLoading(false);
            }
        };
        loadAccounts();
    }, []);

    const handleImportComplete = () => {
        // 刷新历史列表
        setHistoryKey(prev => prev + 1);
    };

    if (loading) {
        return (
            <div className="max-w-6xl mx-auto py-8 px-4 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-500">加载中...</span>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
            {/* 页面标题 */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">数据管理</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        批量导入导出流水数据，管理导入历史
                    </p>
                </div>
                <Button variant="outline" onClick={() => setHistoryKey(prev => prev + 1)}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    刷新
                </Button>
            </div>

            {/* 导入区域 - 整行 */}
            <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="space-y-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Upload className="w-5 h-5 text-blue-600" />
                            <h3 className="text-lg font-semibold text-gray-900">批量导入</h3>
                        </div>
                        <p className="text-sm text-gray-600">
                            上传标准格式Excel文件，支持验证、重复检测和撤销操作
                        </p>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h4 className="text-sm font-medium text-blue-900 mb-2">💡 标准格式要求</h4>
                        <div className="grid md:grid-cols-2 gap-4">
                            <ul className="text-xs text-blue-800 space-y-1">
                                <li>• 8列：日期、类型、金额、账户、分类、备注、对方账户、对方金额</li>
                                <li>• 类型必须为：支出 / 收入 / 划转</li>
                                <li>• 账户和分类必须与系统中已有的完全匹配</li>
                                <li>• 划转类型必须填写对方账户</li>
                            </ul>
                            <ul className="text-xs text-blue-800 space-y-1">
                                <li>• 日期格式：YYYY-MM-DD 或 YYYY/MM/DD</li>
                                <li>• 金额为正数，系统自动处理符号</li>
                                <li>• 跨币种划转需填写对方金额</li>
                                <li>• 备注和对方金额可留空</li>
                            </ul>
                        </div>
                    </div>

                    <Button onClick={() => setImportWizardOpen(true)} size="lg" className="w-full md:w-auto">
                        <Upload className="w-4 h-4 mr-2" />
                        开始导入
                    </Button>
                </div>
            </section>

            {/* 导出区域 - 整行 */}
            <ExportSection accounts={accounts} />

            {/* 导入历史 - 整行 */}
            <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-6">
                    <Database className="w-5 h-5 text-purple-600" />
                    <h2 className="text-lg font-semibold text-gray-900">导入历史</h2>
                </div>
                <ImportHistory key={historyKey} />
            </section>

            {/* Import Wizard Dialog */}
            <ImportWizard
                open={importWizardOpen}
                onOpenChange={setImportWizardOpen}
                onComplete={handleImportComplete}
            />
        </div>
    );
}
