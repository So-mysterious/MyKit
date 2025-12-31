'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { FileSpreadsheet, Trash2, Info, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { getImportBatches, rollbackImportBatch } from '@/lib/bookkeeping/actions';

// ============================================
// 类型定义
// ============================================

interface ImportBatch {
    id: string;
    created_at: string;
    filename: string;
    total_rows: number;
    valid_count: number;
    duplicate_count: number;
    invalid_count: number;
    uploaded_count: number;
    status: 'completed' | 'partial' | 'failed' | 'rolled_back';
    transaction_ids: string[];
    error_summary?: {
        invalid_tags?: string[];
        invalid_accounts?: string[];
        duplicate_rows?: number[];
    } | null;
    upload_duration_ms?: number | null;
    user_notes?: string | null;
}

// ============================================
// 状态徽章组件
// ============================================

function StatusBadge({ status }: { status: ImportBatch['status'] }) {
    const config = {
        completed: { icon: CheckCircle2, color: 'green', text: '已完成' },
        partial: { icon: AlertTriangle, color: 'yellow', text: '部分成功' },
        failed: { icon: XCircle, color: 'red', text: '失败' },
        rolled_back: { icon: Trash2, color: 'gray', text: '已撤销' },
    }[status];

    const Icon = config.icon;

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
      ${status === 'completed' ? 'bg-green-100 text-green-700' : ''}
      ${status === 'partial' ? 'bg-yellow-100 text-yellow-700' : ''}
      ${status === 'failed' ? 'bg-red-100 text-red-700' : ''}
      ${status === 'rolled_back' ? 'bg-gray-100 text-gray-700' : ''}
    `}>
            <Icon size={12} />
            {config.text}
        </span>
    );
}

// ============================================
// 详情对话框
// ============================================

interface BatchDetailDialogProps {
    batch: ImportBatch | null;
    open: boolean;
    onClose: () => void;
}

function BatchDetailDialog({ batch, open, onClose }: BatchDetailDialogProps) {
    if (!batch) return null;

    const errorSummary = batch.error_summary as { invalid_tags?: string[]; invalid_accounts?: string[] } | null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>批次详情</DialogTitle>
                    <DialogDescription>{batch.filename}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* 基本信息 */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs text-gray-500">上传时间</p>
                            <p className="text-sm font-medium">
                                {new Date(batch.created_at).toLocaleString('zh-CN')}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">处理时长</p>
                            <p className="text-sm font-medium">
                                {batch.upload_duration_ms ? `${(batch.upload_duration_ms / 1000).toFixed(2)}秒` : '-'}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">状态</p>
                            <p className="text-sm"><StatusBadge status={batch.status} /></p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">上传流水数</p>
                            <p className="text-sm font-medium">{batch.uploaded_count} 条</p>
                        </div>
                    </div>

                    {/* 统计信息 */}
                    <div className="border rounded-lg p-4 bg-gray-50">
                        <h4 className="text-sm font-medium mb-3">数据统计</h4>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Excel总行数:</span>
                                <span className="font-medium">{batch.total_rows}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">合规流水:</span>
                                <span className="font-medium text-green-600">{batch.valid_count}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">疑似重复:</span>
                                <span className="font-medium text-yellow-600">{batch.duplicate_count}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">不合规流水:</span>
                                <span className="font-medium text-red-600">{batch.invalid_count}</span>
                            </div>
                        </div>
                    </div>

                    {/* 错误详情 */}
                    {errorSummary && (
                        <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                            <h4 className="text-sm font-medium text-red-900 mb-2">错误详情</h4>
                            {errorSummary.invalid_accounts && errorSummary.invalid_accounts.length > 0 && (
                                <div className="text-xs text-red-700 mb-2">
                                    <span className="font-medium">无效账户:</span> {errorSummary.invalid_accounts.join(', ')}
                                </div>
                            )}
                            {errorSummary.invalid_tags && errorSummary.invalid_tags.length > 0 && (
                                <div className="text-xs text-red-700">
                                    <span className="font-medium">无效标签:</span> {errorSummary.invalid_tags.join(', ')}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 流水ID列表 */}
                    {batch.transaction_ids && batch.transaction_ids.length > 0 && (
                        <div className="border rounded-lg p-4">
                            <h4 className="text-sm font-medium mb-2">已上传流水ID</h4>
                            <p className="text-xs text-gray-600">
                                {batch.transaction_ids.length} 条流水已成功上传到数据库
                            </p>
                            <details className="mt-2">
                                <summary className="text-xs text-blue-600 cursor-pointer hover:underline">
                                    查看所有ID
                                </summary>
                                <div className="mt-2 max-h-40 overflow-y-auto bg-gray-50 rounded p-2 text-xs font-mono text-gray-700">
                                    {batch.transaction_ids.slice(0, 10).join(', ')}
                                    {batch.transaction_ids.length > 10 && ` ... (共${batch.transaction_ids.length}条)`}
                                </div>
                            </details>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        关闭
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ============================================
// 撤销确认对话框
// ============================================

interface RollbackConfirmDialogProps {
    batch: ImportBatch | null;
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    rolling: boolean;
}

function RollbackConfirmDialog({ batch, open, onConfirm, onCancel, rolling }: RollbackConfirmDialogProps) {
    if (!batch) return null;

    return (
        <Dialog open={open} onOpenChange={onCancel}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>确认撤销导入</DialogTitle>
                    <DialogDescription>
                        此操作将删除本批次上传的所有流水，不可恢复！
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-4">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p className="text-sm font-medium text-yellow-900 mb-2">⚠️ 警告</p>
                        <ul className="text-xs text-yellow-800 space-y-1">
                            <li>• 将删除 {batch.uploaded_count} 条流水记录</li>
                            <li>• 已手动删除的流水会被自动跳过</li>
                            <li>• 批次状态将更新为"已撤销"</li>
                        </ul>
                    </div>

                    <div className="text-sm text-gray-700">
                        <p><span className="font-medium">文件名:</span> {batch.filename}</p>
                        <p><span className="font-medium">上传时间:</span> {new Date(batch.created_at).toLocaleString('zh-CN')}</p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onCancel} disabled={rolling}>
                        取消
                    </Button>
                    <Button variant="destructive" onClick={onConfirm} disabled={rolling}>
                        {rolling ? '撤销中...' : '确认撤销'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ============================================
// 主组件：ImportHistory
// ============================================

export function ImportHistory() {
    const [batches, setBatches] = React.useState<ImportBatch[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [selectedBatch, setSelectedBatch] = React.useState<ImportBatch | null>(null);
    const [detailDialogOpen, setDetailDialogOpen] = React.useState(false);
    const [rollbackDialogOpen, setRollbackDialogOpen] = React.useState(false);
    const [rolling, setRolling] = React.useState(false);

    // 加载数据
    const fetchBatches = React.useCallback(async () => {
        setLoading(true);
        try {
            const data = await getImportBatches();
            setBatches(data as ImportBatch[]);
        } catch (error) {
            console.error('加载导入历史失败:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchBatches();
    }, [fetchBatches]);

    const handleViewDetail = (batch: ImportBatch) => {
        setSelectedBatch(batch);
        setDetailDialogOpen(true);
    };

    const handleRollback = (batch: ImportBatch) => {
        setSelectedBatch(batch);
        setRollbackDialogOpen(true);
    };

    const handleConfirmRollback = async () => {
        if (!selectedBatch) return;

        setRolling(true);
        try {
            const result = await rollbackImportBatch(selectedBatch.id);

            if (result.success) {
                // 更新本地状态
                setBatches(prev =>
                    prev.map(b =>
                        b.id === selectedBatch.id
                            ? { ...b, status: 'rolled_back' as const }
                            : b
                    )
                );
                setRollbackDialogOpen(false);
                alert(`撤销成功！删除了 ${result.deletedCount} 条流水${result.skippedCount > 0 ? `，跳过 ${result.skippedCount} 条已不存在的流水` : ''}`);
            } else {
                alert('撤销失败：' + result.error);
            }
        } catch (error) {
            console.error('撤销失败:', error);
            alert('撤销操作失败，请稍后重试');
        } finally {
            setRolling(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-500">加载中...</span>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="space-y-3">
                {batches.length === 0 ? (
                    <div className="text-center py-12 border border-dashed rounded-lg">
                        <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm text-gray-500">暂无导入记录</p>
                        <p className="text-xs text-gray-400 mt-1">导入流水后，记录会显示在这里</p>
                    </div>
                ) : (
                    batches.map((batch) => (
                        <div
                            key={batch.id}
                            className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white"
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <FileSpreadsheet className="w-5 h-5 text-gray-400" />
                                        <h4 className="font-medium text-gray-900">{batch.filename}</h4>
                                        <StatusBadge status={batch.status} />
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                        <div>
                                            <p className="text-xs text-gray-500">上传时间</p>
                                            <p className="font-medium">
                                                {formatDistanceToNow(new Date(batch.created_at), {
                                                    addSuffix: true,
                                                    locale: zhCN,
                                                })}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500">上传数量</p>
                                            <p className="font-medium text-green-600">{batch.uploaded_count} 条</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500">问题数量</p>
                                            <p className="font-medium text-red-600">
                                                {batch.invalid_count + batch.duplicate_count} 条
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500">总行数</p>
                                            <p className="font-medium">{batch.total_rows} 行</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-2 ml-4">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleViewDetail(batch)}
                                    >
                                        <Info size={14} className="mr-1" />
                                        详情
                                    </Button>
                                    {batch.status === 'completed' && (
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => handleRollback(batch)}
                                        >
                                            <Trash2 size={14} className="mr-1" />
                                            撤销
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* 详情对话框 */}
            <BatchDetailDialog
                batch={selectedBatch}
                open={detailDialogOpen}
                onClose={() => setDetailDialogOpen(false)}
            />

            {/* 撤销确认对话框 */}
            <RollbackConfirmDialog
                batch={selectedBatch}
                open={rollbackDialogOpen}
                onConfirm={handleConfirmRollback}
                onCancel={() => setRollbackDialogOpen(false)}
                rolling={rolling}
            />
        </div>
    );
}
