/**
 * [性质]: [组件] 生活配方 (收支构成图)
 * [Input]: transactions (dashboard data)
 * [Output]: Donut Chart (Custom SVG)
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import { subDays, isAfter, parseISO } from "date-fns";
import { useBookkeepingColors } from "@/lib/bookkeeping/useColors";
import { TransactionWithAccounts } from "@/types/database";

// 扩展类型以包含 UI 需要的隐含字段
interface DashboardTransaction extends TransactionWithAccounts {
    type: 'expense' | 'income' | 'transfer';
    category: string;
}

interface LifeRecipeProps {
    transactions?: TransactionWithAccounts[];
    height?: number;
    initialRange?: { start: string; end: string };
    filterAccountId?: string;
    hideTitle?: boolean;
}

type Metric = 'expense' | 'income';
type TimeRange = '7d' | '30d' | '90d' | 'all';

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
    { value: '7d', label: '7天' },
    { value: '30d', label: '30天' },
    { value: '90d', label: '90天' },
    { value: 'all', label: '全部' },
];

export function LifeRecipe({
    transactions = [],
    height,
    initialRange,
    filterAccountId,
    hideTitle = false
}: LifeRecipeProps) {
    const [metric, setMetric] = React.useState<Metric>('expense');
    const [timeRange, setTimeRange] = React.useState<TimeRange>(initialRange ? 'all' : '30d');
    const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
    const { colors } = useBookkeepingColors();
    const svgRef = React.useRef<SVGSVGElement>(null);

    const dashboardTransactions = transactions as DashboardTransaction[];

    // 根据时间范围和账户过滤交易
    const filteredTransactions = React.useMemo(() => {
        let list = dashboardTransactions;

        // 账户过滤
        if (filterAccountId) {
            list = list.filter(tx =>
                tx.from_account_id === filterAccountId ||
                tx.to_account_id === filterAccountId
            );
        }

        // 时间过滤
        if (initialRange) {
            list = list.filter(tx => {
                const txDate = tx.date.split('T')[0];
                return txDate >= initialRange.start && txDate <= initialRange.end;
            });
        }

        if (timeRange === 'all') return list;

        const now = new Date();
        const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
        const cutoff = subDays(now, days);

        return list.filter(tx => {
            const txDate = typeof tx.date === 'string' ? parseISO(tx.date) : new Date(tx.date);
            return isAfter(txDate, cutoff);
        });
    }, [dashboardTransactions, timeRange, filterAccountId, initialRange]);

    // 1. Process Data
    const data = React.useMemo(() => {
        const map = new Map<string, number>();
        let total = 0;

        filteredTransactions.forEach(tx => {
            if (tx.type !== metric) return;
            const amount = Math.abs(tx.amount);
            if (amount === 0) return;

            // 核心修复逻辑：
            // 支出交易：标签是 to_account (费用类虚账户)
            // 收入交易：标签是 from_account (收入类虚账户)
            const categoryAccount = tx.type === 'expense' ? tx.to_account : tx.from_account;
            const categoryName = categoryAccount?.name || '未分类';

            map.set(categoryName, (map.get(categoryName) || 0) + amount);
            total += amount;
        });

        return Array.from(map.entries())
            .map(([name, value]) => ({
                name,
                value,
                percent: total > 0 ? (value / total) : 0
            }))
            .sort((a, b) => b.value - a.value);
    }, [filteredTransactions, metric]);

    const totalAmount = data.reduce((s, i) => s + i.value, 0);

    // 2. Chart Calculations
    const radius = 40;
    const strokeWidth = 12;
    const center = 50;

    // Generate shades of the main color for segments
    const getSegmentColor = (index: number, totalSegments: number) => {
        const baseColor = colors[metric] || (metric === 'expense' ? '#ef4444' : '#22c55e');
        const opacity = 1 - (index / (totalSegments + 1)) * 0.7;

        const hex = baseColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    };

    // 计算每个扇形的起始和结束角度
    const segments = React.useMemo(() => {
        let startAngle = -90; // 从顶部开始
        return data.map((item, index) => {
            const angle = item.percent * 360;
            const segment = {
                ...item,
                startAngle,
                endAngle: startAngle + angle,
                color: getSegmentColor(index, data.length)
            };
            startAngle += angle;
            return segment;
        });
    }, [data, colors, metric]);

    const describeArc = (startAngle: number, endAngle: number, innerRadius: number, outerRadius: number) => {
        const angleDiff = endAngle - startAngle;

        if (angleDiff >= 359.9) {
            return `
                M ${center - outerRadius} ${center}
                A ${outerRadius} ${outerRadius} 0 1 1 ${center + outerRadius} ${center}
                A ${outerRadius} ${outerRadius} 0 1 1 ${center - outerRadius} ${center}
                M ${center - innerRadius} ${center}
                A ${innerRadius} ${innerRadius} 0 1 0 ${center + innerRadius} ${center}
                A ${innerRadius} ${innerRadius} 0 1 0 ${center - innerRadius} ${center}
                Z
            `;
        }

        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;

        const x1 = center + outerRadius * Math.cos(startRad);
        const y1 = center + outerRadius * Math.sin(startRad);
        const x2 = center + outerRadius * Math.cos(endRad);
        const y2 = center + outerRadius * Math.sin(endRad);
        const x3 = center + innerRadius * Math.cos(endRad);
        const y3 = center + innerRadius * Math.sin(endRad);
        const x4 = center + innerRadius * Math.cos(startRad);
        const y4 = center + innerRadius * Math.sin(startRad);

        const largeArc = angleDiff > 180 ? 1 : 0;

        return `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`;
    };

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!svgRef.current || data.length === 0) return;

        const rect = svgRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100 - center;
        const y = ((e.clientY - rect.top) / rect.height) * 100 - center;

        const distance = Math.sqrt(x * x + y * y);
        const innerRadius = radius - strokeWidth / 2;
        const outerRadius = radius + strokeWidth / 2;

        if (distance >= innerRadius && distance <= outerRadius) {
            let angle = Math.atan2(y, x) * (180 / Math.PI);
            angle = (angle + 90 + 360) % 360;

            for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                const start = ((seg.startAngle + 90) % 360 + 360) % 360;
                let end = ((seg.endAngle + 90) % 360 + 360) % 360;

                if (end < start) end += 360;
                let checkAngle = angle;
                if (checkAngle < start) checkAngle += 360;

                if (checkAngle >= start && checkAngle < end) {
                    setActiveIndex(i);
                    return;
                }
            }
        }

        setActiveIndex(null);
    };

    const handleMouseLeave = () => {
        setActiveIndex(null);
    };

    return (
        <div
            className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm h-full flex flex-col overflow-hidden"
            style={height ? { height } : undefined}
        >
            {!hideTitle && (
                <div className="flex items-center justify-between mb-4 shrink-0">
                    <div>
                        <div className="text-sm text-gray-500 mb-1">生活配方</div>
                        <div className="text-3xl font-bold text-gray-900 font-mono">
                            ¥{totalAmount.toFixed(0)}
                        </div>
                    </div>
                    <div className="p-2 bg-gray-100 rounded-lg">
                        <ArrowUpRight className="text-gray-500" size={20} />
                    </div>
                </div>
            )}

            <div className="relative w-full flex-1 min-h-0 flex items-center justify-center mb-4">
                {data.length > 0 ? (
                    <div className="relative w-56 h-56">
                        <svg
                            ref={svgRef}
                            viewBox="0 0 100 100"
                            className="w-full h-full"
                            onMouseMove={handleMouseMove}
                            onMouseLeave={handleMouseLeave}
                        >
                            {segments.map((segment, index) => {
                                if (segment.percent < 0.001) return null;

                                const innerRadius = radius - strokeWidth / 2;
                                const outerRadius = radius + strokeWidth / 2;
                                const isActive = activeIndex === index;

                                const activeInner = isActive ? innerRadius - 2 : innerRadius;
                                const activeOuter = isActive ? outerRadius + 2 : outerRadius;

                                return (
                                    <path
                                        key={segment.name}
                                        d={describeArc(segment.startAngle, segment.endAngle, activeInner, activeOuter)}
                                        fill={segment.color}
                                        className="transition-all duration-200 cursor-pointer"
                                        style={{
                                            filter: isActive ? 'brightness(1.1)' : 'none'
                                        }}
                                    />
                                );
                            })}
                        </svg>

                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-xs text-gray-400">合计</span>
                            <span className="text-lg font-bold text-gray-900 font-mono">
                                {activeIndex !== null && data[activeIndex]
                                    ? `¥${data[activeIndex].value.toFixed(0)}`
                                    : `¥${totalAmount.toFixed(0)}`
                                }
                            </span>
                            {activeIndex !== null && data[activeIndex] && (
                                <span className="text-xs text-gray-500 mt-1">
                                    {data[activeIndex].name} ({(data[activeIndex].percent * 100).toFixed(1)}%)
                                </span>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-300 text-sm">
                        暂无数据
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-2 mb-3 shrink-0">
                {!initialRange && (
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-gray-700">时间范围</div>
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            {TIME_RANGE_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setTimeRange(opt.value)}
                                    className={cn(
                                        "px-2 py-1 text-xs font-medium rounded-md transition-all",
                                        timeRange === opt.value ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                                    )}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-700">交易类型</div>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        {(['expense', 'income'] as Metric[]).map(m => (
                            <button
                                key={m}
                                onClick={() => setMetric(m)}
                                className={cn(
                                    "px-3 py-1 text-xs font-medium rounded-md transition-all",
                                    metric === m ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                                )}
                            >
                                {m === 'expense' ? '支出' : '收入'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
                {data.map((item, i) => (
                    <div
                        key={item.name}
                        className={cn(
                            "flex items-center justify-between text-sm py-1.5 px-2 rounded-lg transition-colors cursor-pointer",
                            activeIndex === i ? "bg-gray-100" : "hover:bg-gray-50"
                        )}
                        onMouseEnter={() => setActiveIndex(i)}
                        onMouseLeave={() => setActiveIndex(null)}
                    >
                        <div className="flex items-center gap-2">
                            <div
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: segments[i]?.color || '#e5e7eb' }}
                            />
                            <span className="text-gray-700 truncate">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-gray-400 text-xs">¥{item.value.toFixed(0)}</span>
                            <span className="font-mono font-medium text-gray-900 w-12 text-right">
                                {(item.percent * 100).toFixed(1)}%
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
