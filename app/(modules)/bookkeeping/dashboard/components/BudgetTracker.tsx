/**
 * [性质]: [组件] 预算追踪仪表盘
 * [Input]: BookkeepingCache (dashboardBudgetData)
 * [Output]: BudgetTracker UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { Wallet, TrendingDown, Star, Circle, ChevronRight } from "lucide-react";
import Link from "next/link";
import { BudgetPlanRow, BudgetPeriodRecordRow } from "@/types/database";
import { useBookkeepingColors } from "@/lib/bookkeeping/useColors";
import { useBookkeepingCache } from "@/lib/bookkeeping/cache/BookkeepingCacheProvider";

// 扩展类型以包含 UI 需要的字段
type BudgetPlanData = {
    plan: BudgetPlanRow & { category_name?: string };
    currentPeriod: BudgetPeriodRecordRow | null;
    allRecords: BudgetPeriodRecordRow[];
}

export function BudgetTracker() {
    const { colors } = useBookkeepingColors();
    const cache = useBookkeepingCache();
    const [loading, setLoading] = React.useState(true);
    const [plans, setPlans] = React.useState<BudgetPlanData[]>([]);

    const loadData = React.useCallback(async () => {
        setLoading(true);
        try {
            const data = await cache.getDashboardBudgetData();
            // 后端 getDashboardBudgetData 已更新为返回 activePlans 数组，每个对象包含 category_name
            setPlans((data.activePlans || []).map((p: any) => ({
                plan: p,
                currentPeriod: p.records[0] || null,
                allRecords: p.records || []
            })));
        } catch (err) {
            console.error("Failed to load budget data:", err);
        } finally {
            setLoading(false);
        }
    }, [cache.getDashboardBudgetData]);

    React.useEffect(() => {
        loadData();
    }, [loadData]);

    const renderIndicator = (status: string, index: number) => {
        switch (status) {
            case "star":
                return <Star key={index} className="w-3 h-3 fill-amber-400 text-amber-400" />;
            case "green":
                return <Circle key={index} className="w-3 h-3 fill-green-500 text-green-500" />;
            case "red":
                return <Circle key={index} className="w-3 h-3 fill-red-500 text-red-500" />;
            default:
                return <Circle key={index} className="w-3 h-3 text-gray-300" />;
        }
    };

    const renderProgressBar = (
        actualAmount: number | null,
        hardLimit: number,
        softLimit: number | null
    ) => {
        const actual = actualAmount || 0;
        const maxLimit = Math.max(hardLimit, softLimit || 0);
        const barMax = maxLimit * 1.3;
        const percentage = Math.min((actual / barMax) * 100, 100);

        const hardPos = (hardLimit / barMax) * 100;
        const softPos = softLimit ? (softLimit / barMax) * 100 : null;

        let barColor = "bg-green-500";
        if (softLimit !== null) {
            const minLimit = Math.min(hardLimit, softLimit);
            const maxLimitValue = Math.max(hardLimit, softLimit);

            if (actual > maxLimitValue) {
                barColor = "bg-red-500";
            } else if (actual > minLimit) {
                barColor = "bg-amber-500";
            }
        } else {
            if (actual > hardLimit) {
                barColor = "bg-red-500";
            }
        }

        return (
            <div className="relative h-3 bg-gray-100 rounded-sm overflow-visible">
                <div
                    className={`absolute left-0 top-0 h-full rounded-sm transition-all duration-500 ${barColor}`}
                    style={{ width: `${percentage}%` }}
                />
                <div
                    className="absolute top-0 w-0.5 h-full bg-gray-800 z-10"
                    style={{ left: `${hardPos}%` }}
                    title={`刚性约束: ${hardLimit.toLocaleString()}`}
                />
                {softPos !== null && (
                    <div
                        className="absolute top-0 w-0.5 h-full z-10"
                        style={{
                            left: `${softPos}%`,
                            background: "repeating-linear-gradient(to bottom, #6b7280 0px, #6b7280 2px, transparent 2px, transparent 4px)",
                        }}
                        title={`柔性约束: ${softLimit?.toLocaleString()}`}
                    />
                )}
            </div>
        );
    };

    const renderPlanCard = (planData: BudgetPlanData) => {
        const { plan, currentPeriod, allRecords } = planData;
        const isTotal = plan.plan_type === "total";

        const actual = currentPeriod?.actual_amount || 0;
        const hardLimit = currentPeriod?.hard_limit || plan.hard_limit;
        const percentage = Math.round((actual / hardLimit) * 100);

        let remainingDays = 0;
        if (currentPeriod) {
            const endDate = new Date(currentPeriod.period_end);
            const today = new Date();
            remainingDays = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
        }

        let statusText = "安全";
        if (percentage > 100) {
            statusText = "已超支";
        } else if (percentage > 80) {
            statusText = "注意";
        }

        return (
            <div key={plan.id} className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {isTotal ? (
                            <Wallet className="w-4 h-4 text-gray-600" />
                        ) : (
                            <TrendingDown className="w-4 h-4" style={{ color: colors.expense }} />
                        )}
                        <span className="text-sm font-medium">
                            {isTotal ? "总支出" : plan.category_name}
                        </span>
                    </div>
                    <span className="text-sm text-gray-600">
                        {plan.limit_currency} {actual.toLocaleString(undefined, { maximumFractionDigits: 0 })}/{hardLimit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                </div>

                {renderProgressBar(actual, hardLimit, currentPeriod?.soft_limit || null)}

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-0.5">
                        {allRecords
                            .sort((a, b) => a.period_index - b.period_index)
                            .map((record, idx) => renderIndicator(record.indicator_status, idx))}
                    </div>
                    <span className="text-xs text-gray-500">
                        {percentage}% · {statusText}
                        {remainingDays > 0 && ` · 剩余${remainingDays}天`}
                    </span>
                </div>
            </div>
        );
    };

    const weeklyPlans = plans.filter(p => p.plan.period === "weekly");
    const monthlyPlans = plans.filter(p => p.plan.period === "monthly");

    if (loading) {
        return (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-900 mb-4">预算追踪</h3>
                <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                    加载中...
                </div>
            </div>
        );
    }

    if (plans.length === 0) {
        return (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900">预算追踪</h3>
                    <Link
                        href="/bookkeeping/budget"
                        className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                    >
                        设置预算
                        <ChevronRight className="w-3 h-3" />
                    </Link>
                </div>
                <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                    暂无活跃的预算计划
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">预算追踪</h3>
                <Link
                    href="/bookkeeping/budget"
                    className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                    查看全部
                    <ChevronRight className="w-3 h-3" />
                </Link>
            </div>

            <div className="space-y-6">
                {monthlyPlans.length > 0 && (
                    <div className="space-y-4">
                        {weeklyPlans.length > 0 && (
                            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                                月度预算
                            </div>
                        )}
                        {monthlyPlans.map((planData) => renderPlanCard(planData))}
                    </div>
                )}

                {weeklyPlans.length > 0 && (
                    <div className="space-y-4">
                        {monthlyPlans.length > 0 && (
                            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider pt-2 border-t border-gray-100">
                                周度预算
                            </div>
                        )}
                        {weeklyPlans.map((planData) => renderPlanCard(planData))}
                    </div>
                )}
            </div>

            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span>优秀</span>
                </div>
                <div className="flex items-center gap-1">
                    <Circle className="w-3 h-3 fill-green-500 text-green-500" />
                    <span>达标</span>
                </div>
                <div className="flex items-center gap-1">
                    <Circle className="w-3 h-3 fill-red-500 text-red-500" />
                    <span>超支</span>
                </div>
                <div className="flex items-center gap-1">
                    <Circle className="w-3 h-3 text-gray-300" />
                    <span>未到</span>
                </div>
            </div>
        </div>
    );
}
