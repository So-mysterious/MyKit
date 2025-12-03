'use client';

import { useState } from 'react';
import { exportData } from '@/lib/bookkeeping/actions';
import { downloadBlob } from '@/lib/bookkeeping/exporters';
import { AccountRow } from '@/types/database';

interface ExportSectionProps {
    accounts: AccountRow[];
}

export default function ExportSection({ accounts }: ExportSectionProps) {
    const [dataType, setDataType] = useState<'transactions' | 'snapshots'>('transactions');
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [format, setFormat] = useState<'csv' | 'xlsx'>('xlsx');
    const [loading, setLoading] = useState(false);

    const handleAccountToggle = (accountId: string) => {
        setSelectedAccounts(prev =>
            prev.includes(accountId)
                ? prev.filter(id => id !== accountId)
                : [...prev, accountId]
        );
    };

    const handleSelectAll = () => {
        if (selectedAccounts.length === accounts.length) {
            setSelectedAccounts([]);
        } else {
            setSelectedAccounts(accounts.map(a => a.id));
        }
    };

    const handleExport = async () => {
        setLoading(true);

        try {
            const blob = await exportData({
                dataType,
                accountIds: selectedAccounts.length > 0 ? selectedAccounts : undefined,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                format
            });

            const filename = `${dataType === 'transactions' ? '流水' : '快照'}_${new Date().toISOString().split('T')[0]}.${format}`;
            downloadBlob(blob, filename);
        } catch (error: any) {
            alert(`导出失败: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">📤 数据导出</h3>
                <p className="text-sm text-gray-600">
                    导出流水或快照数据为 Excel 或 CSV 文件，支持筛选账户和时间范围。
                </p>
            </div>

            {/* 数据类型选择 */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    导出类型
                </label>
                <div className="flex gap-4">
                    <label className="flex items-center">
                        <input
                            type="radio"
                            value="transactions"
                            checked={dataType === 'transactions'}
                            onChange={(e) => setDataType(e.target.value as 'transactions')}
                            className="mr-2"
                        />
                        <span className="text-sm text-gray-700">流水</span>
                    </label>
                    <label className="flex items-center">
                        <input
                            type="radio"
                            value="snapshots"
                            checked={dataType === 'snapshots'}
                            onChange={(e) => setDataType(e.target.value as 'snapshots')}
                            className="mr-2"
                        />
                        <span className="text-sm text-gray-700">快照</span>
                    </label>
                </div>
            </div>

            {/* 账户筛选 */}
            <div>
                <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                        账户筛选（可选）
                    </label>
                    <button
                        onClick={handleSelectAll}
                        className="text-xs text-blue-600 hover:text-blue-700"
                    >
                        {selectedAccounts.length === accounts.length ? '取消全选' : '全选'}
                    </button>
                </div>
                <div className="border border-gray-300 rounded-md p-3 max-h-48 overflow-y-auto">
                    {accounts.length === 0 ? (
                        <div className="text-sm text-gray-500 text-center py-2">暂无账户</div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            {accounts.map(account => (
                                <label key={account.id} className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={selectedAccounts.includes(account.id)}
                                        onChange={() => handleAccountToggle(account.id)}
                                        className="mr-2"
                                    />
                                    <span className="text-sm text-gray-700">{account.name}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                    {selectedAccounts.length > 0
                        ? `已选择 ${selectedAccounts.length} 个账户`
                        : '全部账户'}
                </div>
            </div>

            {/* 时间范围 */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        开始日期（可选）
                    </label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        结束日期（可选）
                    </label>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                </div>
            </div>

            {/* 导出格式 */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    导出格式
                </label>
                <div className="flex gap-4">
                    <label className="flex items-center">
                        <input
                            type="radio"
                            value="xlsx"
                            checked={format === 'xlsx'}
                            onChange={(e) => setFormat(e.target.value as 'xlsx')}
                            className="mr-2"
                        />
                        <span className="text-sm text-gray-700">Excel (.xlsx)</span>
                    </label>
                    <label className="flex items-center">
                        <input
                            type="radio"
                            value="csv"
                            checked={format === 'csv'}
                            onChange={(e) => setFormat(e.target.value as 'csv')}
                            className="mr-2"
                        />
                        <span className="text-sm text-gray-700">CSV (.csv)</span>
                    </label>
                </div>
            </div>

            {/* 导出按钮 */}
            <button
                onClick={handleExport}
                disabled={loading}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
                {loading ? '正在导出...' : '导出数据'}
            </button>
        </div>
    );
}
