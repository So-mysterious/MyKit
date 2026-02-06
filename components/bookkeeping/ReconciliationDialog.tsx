/**
 * [性质]: [组件] 查账账户选择对话框
 * [Input]: Account Tree
 * [Output]: Dialog with account selection and period
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { Wallet, CalendarIcon, Loader2, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface AccountMeta {
    id: string;
    name: string;
    currency: string;
    is_group?: boolean;
    children?: AccountMeta[];
}

interface FlatAccount {
    id: string;
    displayName: string;
    currency: string;
}

interface ReconciliationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    accounts: AccountMeta[];
    onSubmit: (accountIds: string[], startDate: string, endDate: string) => Promise<void>;
    trigger?: React.ReactNode;
    progress?: { current: number; total: number } | null; // 进度状态
}

export function ReconciliationDialog({
    open,
    onOpenChange,
    accounts,
    onSubmit,
    trigger,
    progress,
}: ReconciliationDialogProps) {
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
    const [submitting, setSubmitting] = React.useState(false);

    // 默认周期：今天到一年前
    const [endDate, setEndDate] = React.useState(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    });

    const [startDate, setStartDate] = React.useState(() => {
        const now = new Date();
        const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        const year = oneYearAgo.getFullYear();
        const month = String(oneYearAgo.getMonth() + 1).padStart(2, '0');
        const day = String(oneYearAgo.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}T00:00`;
    });

    // 扁平化账户列表
    const flatAccounts = React.useMemo(() => {
        const result: FlatAccount[] = [];

        const traverse = (nodes: AccountMeta[], parentName = "") => {
            for (const node of nodes) {
                if (node.is_group) {
                    // 递归处理子节点，传递当前节点名为父名
                    if (node.children) {
                        traverse(node.children, node.name); // 不累积父名，只用直接父级？用户示例是 "工行（5738）CNY"，其中 "工行（5738）" 是父级。
                        // 如果层级更深？"A - B - C"。通常用直接父级或完整路径。
                        // 根据用户需求，这里使用 "父级名称 子级名称" 的格式。
                        // 如果有更深层级，也许应该传递 parentName ? `${parentName} - ${node.name}` : node.name
                        // 但用户例子看起来是直接父级。我们可以尝试递归传递完整路径。
                        // 暂且使用完整路径逻辑。
                    }
                } else {
                    // 叶子节点
                    const displayName = parentName ? `${parentName} ${node.name}` : node.name;
                    result.push({
                        id: node.id,
                        displayName: displayName,
                        currency: node.currency
                    });
                }
            }
        };

        traverse(accounts);
        return result;
    }, [accounts]);

    // 全选
    const handleSelectAll = () => {
        const allIds = flatAccounts.map(acc => acc.id);
        setSelectedIds(new Set(allIds));
    };

    // 清空选择
    const handleDeselectAll = () => {
        setSelectedIds(new Set());
    };

    // 切换账户选择
    const handleToggle = (accountId: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(accountId)) {
                newSet.delete(accountId);
            } else {
                newSet.add(accountId);
            }
            return newSet;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (selectedIds.size === 0) {
            alert('请至少选择一个账户');
            return;
        }

        const leafAccountIds = Array.from(selectedIds);

        setSubmitting(true);
        try {
            // 注意：这里 Dialog 不负责关闭，等待父组件逻辑完成后手动关闭或更新状态
            // 如果存在 progress 属性，说明父组件会处理进度显示，不立即关闭
            await onSubmit(
                leafAccountIds,
                new Date(startDate).toISOString(),
                new Date(endDate).toISOString()
            );

            // 如果没有 progress 属性支持，则保持原有逻辑 (兼容性)
            if (!progress) {
                onOpenChange(false);
                setSelectedIds(new Set());
            }
        } catch (error: any) {
            alert(error.message || '查账失败');
        } finally {
            setSubmitting(false);
        }
    };

    // 计算进度百分比
    const progressPercent = progress ? Math.round((progress.current / progress.total) * 100) : 0;

    return (
        <Dialog open={open} onOpenChange={(val) => {
            // 查账中禁止关闭
            if (submitting || (progress && progress.current < progress.total)) return;
            onOpenChange(val);
        }}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>一键查账</DialogTitle>
                    <DialogDescription>
                        选择账户及时间范围。系统将遍历所有校准点，比对余额差与流水和。
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                    <div className="flex-1 overflow-y-auto border rounded-lg p-4 mb-4">
                        <div className="flex items-center justify-between mb-2">
                            <Label className="text-sm font-semibold">选择账户</Label>
                            <div className="flex gap-2">
                                <Button type="button" variant="ghost" size="sm" onClick={handleSelectAll} className="h-6 px-2 text-xs">
                                    全选
                                </Button>
                                <Button type="button" variant="ghost" size="sm" onClick={handleDeselectAll} className="h-6 px-2 text-xs">
                                    清空
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-1">
                            {flatAccounts.length > 0 ? (
                                flatAccounts.map(account => (
                                    <div
                                        key={account.id}
                                        className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
                                        onClick={() => handleToggle(account.id)}
                                    >
                                        <Checkbox
                                            checked={selectedIds.has(account.id)}
                                            onCheckedChange={() => handleToggle(account.id)}
                                            // 阻止事件冒泡，防止触发 div 的 onClick
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <Wallet className="w-4 h-4 text-blue-500" />
                                        <span className="flex-1 text-sm">{account.displayName}</span>
                                        <span className="text-xs text-gray-400">({account.currency})</span>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-gray-400 text-center py-4">暂无可用账户</p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4 mb-4">
                        <Label className="text-sm font-semibold">查账周期</Label>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="start-date" className="text-xs text-gray-500">开始时间</Label>
                                <Input
                                    id="start-date"
                                    type="datetime-local"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    // className="pl-9" // Removing Icon wrapper for simplicity or keep if desired, kept simple here
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="end-date" className="text-xs text-gray-500">结束时间</Label>
                                <Input
                                    id="end-date"
                                    type="datetime-local"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    {selectedIds.size > 0 && (
                        <div className="text-sm text-gray-600 mb-4 flex justify-between items-center">
                            <span>已选择 <span className="font-semibold text-blue-600">{selectedIds.size}</span> 个账户</span>
                            {progress && (
                                <span className="text-blue-600 font-medium">
                                    正在查账: {progress.current}/{progress.total} ({progressPercent}%)
                                </span>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                            取消
                        </Button>
                        <Button type="submit" disabled={submitting || selectedIds.size === 0}>
                            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {submitting ? '查账中...' : '确认查账'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
