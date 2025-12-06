"use client";

import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { BudgetRecalculationItem } from "@/lib/bookkeeping/actions";

interface BudgetRecalcDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    recalculations: BudgetRecalculationItem[];
    onConfirm: () => Promise<void>;
    loading?: boolean;
}

// 状态中文映射
const STATUS_MAP = {
    star: "✨ 优秀",
    green: "✅ 达标",
    red: "❌ 超支",
    pending: "⏳ 待计算"
} as const;

// 按计划分组
function groupByPlan(items: BudgetRecalculationItem[]) {
    const grouped = new Map<string, BudgetRecalculationItem[]>();

    items.forEach(item => {
        const key = `${item.planId}-${item.planName}`;
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key)!.push(item);
    });

    return Array.from(grouped.entries()).map(([key, items]) => ({
        planName: items[0].planName,
        items: items.sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    }));
}

export function BudgetRecalcDialog({
    open,
    onOpenChange,
    recalculations,
    onConfirm,
    loading = false
}: BudgetRecalcDialogProps) {
    const groupedData = React.useMemo(() => groupByPlan(recalculations), [recalculations]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>预算重算报告</DialogTitle>
                    <DialogDescription>
                        共发现 <span className="font-semibold text-gray-900">{recalculations.length}</span> 个周期需要修正
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {groupedData.map((group, idx) => (
                        <div key={idx} className="border rounded-lg p-4">
                            <h3 className="font-semibold text-lg mb-3">{group.planName}</h3>

                            <div className="space-y-3">
                                {group.items.map((item) => {
                                    const oldAmount = item.oldValues.actual_amount || 0;
                                    const newAmount = item.newValues.actual_amount;
                                    const diff = newAmount - oldAmount;
                                    const statusChanged = item.oldValues.indicator_status !== item.newValues.indicator_status;

                                    return (
                                        <div
                                            key={item.periodId}
                                            className="bg-gray-50 rounded p-3 text-sm"
                                        >
                                            {/* 周期日期 */}
                                            <div className="font-medium text-gray-900 mb-2">
                                                {format(new Date(item.periodStart), 'yyyy年MM月', { locale: zhCN })}
                                                {' '}
                                                ({format(new Date(item.periodStart), 'MM/dd')} - {format(new Date(item.periodEnd), 'MM/dd')})
                                            </div>

                                            {/* 实际消费变化 */}
                                            <div className="flex items-center justify-between text-gray-700">
                                                <span>实际消费:</span>
                                                <span>
                                                    <span className="text-gray-400">¥{oldAmount.toFixed(2)}</span>
                                                    {' → '}
                                                    <span className="font-semibold">¥{newAmount.toFixed(2)}</span>
                                                    {diff !== 0 && (
                                                        <span className={`ml-2 ${diff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                            ({diff > 0 ? '+' : ''}{diff.toFixed(2)})
                                                        </span>
                                                    )}
                                                </span>
                                            </div>

                                            {/* 状态变化 */}
                                            {statusChanged && (
                                                <div className="flex items-center justify-between text-gray-700 mt-1">
                                                    <span>状态:</span>
                                                    <span>
                                                        {STATUS_MAP[item.oldValues.indicator_status as keyof typeof STATUS_MAP]}
                                                        {' → '}
                                                        <span className="font-semibold">
                                                            {STATUS_MAP[item.newValues.indicator_status as keyof typeof STATUS_MAP]}
                                                        </span>
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={loading}
                    >
                        取消
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={loading}
                    >
                        {loading ? "提交中..." : "确认提交"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
