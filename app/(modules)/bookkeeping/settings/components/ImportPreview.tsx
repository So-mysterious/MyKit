'use client';

import { ImportReport, ValidationError } from '@/lib/bookkeeping/importers/types';

interface ImportPreviewProps {
    report?: ImportReport;
    errors?: ValidationError[];
    onConfirm: () => void;
    onCancel: () => void;
    loading?: boolean;
}

export default function ImportPreview({ report, errors, onConfirm, onCancel, loading }: ImportPreviewProps) {
    // 显示错误
    if (errors && errors.length > 0) {
        return (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6">
                <h3 className="text-lg font-semibold text-red-900 mb-4">❌ 验证失败，无法导入</h3>

                <div className="text-sm text-red-800 mb-4">
                    发现 <span className="font-semibold">{errors.length}</span> 处错误：
                </div>

                <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
                    {errors.map((error, index) => (
                        <div key={index} className="p-3 bg-white rounded border border-red-200">
                            <div className="flex items-start gap-2">
                                <span className="text-red-600">❌</span>
                                <div className="flex-1">
                                    <div className="font-medium text-red-900">
                                        第 {error.line} 行：{error.field}
                                    </div>
                                    <div className="text-red-700 mt-1">{error.reason}</div>
                                    {error.value && (
                                        <div className="text-sm text-red-600 mt-1">
                                            值: <code className="bg-red-100 px-1 rounded">{String(error.value)}</code>
                                        </div>
                                    )}
                                    {error.suggestion && (
                                        <div className="text-sm text-red-600 mt-2">
                                            💡 建议：{error.suggestion}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                        关闭
                    </button>
                </div>
            </div>
        );
    }

    // 显示预览和报告
    if (report) {
        const { summary, duplicateWarnings } = report;

        return (
            <div className="rounded-lg border border-green-200 bg-green-50 p-6">
                <h3 className="text-lg font-semibold text-green-900 mb-4">🎉 导入成功</h3>

                {/* 基本统计 */}
                <div className="bg-white rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="text-sm text-gray-600">导入交易数</div>
                            <div className="text-2xl font-bold text-green-600">{summary.totalImported}</div>
                        </div>
                        <div>
                            <div className="text-sm text-gray-600">时间范围</div>
                            <div className="text-lg font-medium text-gray-900">
                                {summary.dateRange.start} ~ {summary.dateRange.end}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 账户统计 */}
                {summary.accounts.length > 0 && (
                    <div className="bg-white rounded-lg p-4 mb-4">
                        <h4 className="font-medium text-gray-900 mb-3">📊 账户统计</h4>
                        <div className="space-y-2">
                            {summary.accounts.map((acc, index) => (
                                <div key={index} className="flex justify-between items-center text-sm">
                                    <span className="text-gray-700">{acc.name}</span>
                                    <div className="flex gap-4">
                                        <span className="text-gray-600">{acc.count} 笔</span>
                                        <span className="font-medium text-gray-900">¥{acc.totalAmount.toFixed(2)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 分类统计 */}
                {summary.categories.length > 0 && (
                    <div className="bg-white rounded-lg p-4 mb-4">
                        <h4 className="font-medium text-gray-900 mb-3">🏷️ 分类统计</h4>
                        <div className="flex flex-wrap gap-2">
                            {summary.categories.map((cat, index) => (
                                <span
                                    key={index}
                                    className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                                >
                                    {cat.name}: {cat.count} 笔
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* 新创建的标签 */}
                {summary.newTagsCreated.length > 0 && (
                    <div className="bg-blue-50 rounded-lg p-4 mb-4 border border-blue-200">
                        <h4 className="font-medium text-blue-900 mb-2">✨ 新创建的标签</h4>
                        <div className="flex flex-wrap gap-2">
                            {summary.newTagsCreated.map((tag, index) => (
                                <span
                                    key={index}
                                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* 疑似重复交易警告 */}
                {duplicateWarnings.length > 0 && (
                    <div className="bg-yellow-50 rounded-lg p-4 mb-4 border border-yellow-200">
                        <h4 className="font-medium text-yellow-900 mb-3">
                            ⚠️ 疑似重复交易（共 {duplicateWarnings.length} 条，需手动检查）
                        </h4>
                        <div className="space-y-3 max-h-64 overflow-y-auto">
                            {duplicateWarnings.slice(0, 5).map((dup, index) => {
                                const tx = dup.importedTransaction;
                                const existingTx = dup.existingTransaction;

                                return (
                                    <div key={index} className="p-3 bg-white rounded border border-yellow-300">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <span className="text-sm font-medium text-yellow-900">
                                                    新导入：{new Date(tx.date).toLocaleDateString()} | {tx.type === 'income' ? '收入' : tx.type === 'expense' ? '支出' : '划转'}
                                                </span>
                                                <div className="text-sm text-gray-700 mt-1">
                                                    {tx.accountName} | ¥{tx.amount} | {tx.category}
                                                </div>
                                            </div>
                                            <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded">
                                                匹配度 {(dup.matchScore * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-600 mt-2">
                                            匹配字段: {dup.matchedFields.join('、')}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            可能与 {new Date(existingTx.date).toLocaleDateString()} 的交易重复
                                        </div>
                                    </div>
                                );
                            })}
                            {duplicateWarnings.length > 5 && (
                                <div className="text-sm text-yellow-700 text-center">
                                    还有 {duplicateWarnings.length - 5} 条重复警告...
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex gap-3">
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                    >
                        完成
                    </button>
                </div>
            </div>
        );
    }

    // 加载中
    if (loading) {
        return (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
                <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                    <span className="ml-3 text-gray-700">正在处理...</span>
                </div>
            </div>
        );
    }

    return null;
}
