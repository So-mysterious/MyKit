/**
 * [性质]: [组件] 交易探索 (收支趋势分析)
 * [Input]: transactions (dashboard data)
 * [Output]: Bar/Line Chart (Custom SVG)
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { format, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, isSameDay, isSameWeek, isSameMonth, parseISO, subDays, isAfter } from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import { useBookkeepingColors } from "@/lib/bookkeeping/useColors";
import { TransactionWithAccounts } from "@/types/database";

// 扩展类型以包含 UI 需要的隐含字段
interface DashboardTransaction extends TransactionWithAccounts {
    type: 'expense' | 'income' | 'transfer';
}

interface TransactionExplorerProps {
    transactions: TransactionWithAccounts[];
}

type Metric = 'expense' | 'income' | 'net';
type Granularity = 'day' | 'week' | 'month';
type TimeRange = '7d' | '30d' | '90d' | 'all';

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
    { value: '7d', label: '7天' },
    { value: '30d', label: '30天' },
    { value: '90d', label: '90天' },
    { value: 'all', label: '全部' },
];

export function TransactionExplorer({ transactions }: TransactionExplorerProps) {
    const [metric, setMetric] = React.useState<Metric>('expense');
    const [granularity, setGranularity] = React.useState<Granularity>('day');
    const [timeRange, setTimeRange] = React.useState<TimeRange>('30d');
    const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
    const { colors } = useBookkeepingColors();

    const dashboardTransactions = transactions as DashboardTransaction[];

    // 根据时间范围过滤交易
    const filteredTransactions = React.useMemo(() => {
        if (timeRange === 'all') return dashboardTransactions;

        const now = new Date();
        const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
        const cutoff = subDays(now, days);

        return dashboardTransactions.filter(tx => {
            const txDate = typeof tx.date === 'string' ? parseISO(tx.date) : new Date(tx.date);
            return isAfter(txDate, cutoff);
        });
    }, [dashboardTransactions, timeRange]);

    // 1. Process Data
    const chartData = React.useMemo(() => {
        if (filteredTransactions.length === 0) return [];

        const sorted = [...filteredTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const startDate = new Date(sorted[0].date);
        const endDate = new Date(sorted[sorted.length - 1].date);

        let intervals: Date[] = [];
        let formatStr = '';

        if (granularity === 'day') {
            intervals = eachDayOfInterval({ start: startDate, end: endDate });
            formatStr = 'MM-dd';
        } else if (granularity === 'week') {
            intervals = eachWeekOfInterval({ start: startDate, end: endDate }, { weekStartsOn: 1 });
            formatStr = 'MM-dd';
        } else {
            intervals = eachMonthOfInterval({ start: startDate, end: endDate });
            formatStr = 'yyyy-MM';
        }

        return intervals.map(date => {
            let value = 0;
            const inInterval = sorted.filter(tx => {
                const txDate = new Date(tx.date);
                if (granularity === 'day') return isSameDay(txDate, date);
                if (granularity === 'week') return isSameWeek(txDate, date, { weekStartsOn: 1 });
                return isSameMonth(txDate, date);
            });

            if (metric === 'expense') {
                value = inInterval.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(t.amount), 0);
            } else if (metric === 'income') {
                value = inInterval.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
            } else {
                const inc = inInterval.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
                const exp = inInterval.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(t.amount), 0);
                value = inc - exp;
            }

            return {
                date: date,
                label: format(date, formatStr, { locale: zhCN }),
                value: Number(value.toFixed(2))
            };
        });
    }, [filteredTransactions, metric, granularity]);

    // 2. Stats
    const stats = React.useMemo(() => {
        if (chartData.length === 0) return { max: 0, min: 0, avg: 0, range: 0 };
        const values = chartData.map(d => d.value);
        let max = Math.max(...values);
        let min = Math.min(...values);

        // 对于支出/收入，下限保证为0，这样X轴在底部
        if (metric !== 'net') {
            min = 0;
            max = Math.max(max, 1); // 避免全是0
        }

        const sum = values.reduce((a, b) => a + b, 0);
        const avg = sum / values.length;
        return { max, min, avg, range: max - min };
    }, [chartData, metric]);

    const totalValue = chartData.reduce((s, d) => s + d.value, 0);
    const lineColor = metric === 'income' ? colors.income : metric === 'expense' ? colors.expense : colors.transfer;

    // 3. SVG Drawing Helpers
    const width = 800;
    const height = 200;
    const padding = { top: 20, right: 20, bottom: 20, left: 20 };

    const getX = (index: number) => {
        if (chartData.length <= 1) return padding.left;
        return padding.left + (index / (chartData.length - 1)) * (width - padding.left - padding.right);
    };

    const getY = (value: number) => {
        const range = stats.range === 0 ? 1 : stats.range;
        return height - padding.bottom - ((value - stats.min) / range) * (height - padding.top - padding.bottom);
    };

    const yZero = getY(0);
    const points = chartData.map((d, i) => `${getX(i)},${getY(d.value)}`).join(" ");

    // 分割为正负两个填充区域 (仅在净流水模式下)
    const generateAreaPath = (isPositive: boolean) => {
        if (chartData.length === 0) return "";
        let path = `M ${getX(0)},${yZero} `;

        chartData.forEach((d, i) => {
            const y = getY(d.value);
            // 如果是正向路径且值大于0，或者负向路径且值小于0，则取实际Y值，否则取yZero
            const constrainedY = isPositive
                ? (d.value > 0 ? y : yZero)
                : (d.value < 0 ? y : yZero);
            path += `L ${getX(i)},${constrainedY} `;
        });

        path += `L ${getX(chartData.length - 1)},${yZero} Z`;
        return path;
    };

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm h-full flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                    <div className="text-sm text-gray-500 mb-1">交易探索</div>
                    <div className="text-3xl font-bold text-gray-900 font-mono">
                        {metric === 'net' && totalValue > 0 ? '+' : ''}
                        {metric === 'expense' ? '-' : ''}
                        ¥{Math.abs(totalValue).toFixed(0)}
                    </div>
                </div>
                <div className="p-2 bg-gray-100 rounded-lg">
                    <ArrowUpRight className="text-gray-500" size={20} />
                </div>
            </div>

            <div className="relative w-full flex-1 min-h-0 mb-4">
                {chartData.length > 0 ? (
                    <div className="relative w-full h-full">
                        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full">
                            {/* 网格线 */}
                            <line x1={padding.left} y1={getY(stats.min)} x2={width - padding.right} y2={getY(stats.min)} stroke="#f3f4f6" strokeWidth="1" />
                            <line x1={padding.left} y1={getY(stats.max)} x2={width - padding.right} y2={getY(stats.max)} stroke="#f3f4f6" strokeWidth="1" />

                            {/* 零位轴 */}
                            <line x1={padding.left} y1={yZero} x2={width - padding.right} y2={yZero} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="2 2" />

                            <defs>
                                <linearGradient id="positiveGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={colors.income} stopOpacity="0.15" />
                                    <stop offset="100%" stopColor={colors.income} stopOpacity="0" />
                                </linearGradient>
                                <linearGradient id="negativeGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={colors.expense} stopOpacity="0" />
                                    <stop offset="100%" stopColor={colors.expense} stopOpacity="0.15" />
                                </linearGradient>
                            </defs>

                            {metric === 'net' ? (
                                <>
                                    <path d={generateAreaPath(true)} fill="url(#positiveGradient)" stroke="none" />
                                    <path d={generateAreaPath(false)} fill="url(#negativeGradient)" stroke="none" />
                                </>
                            ) : (
                                <path
                                    d={`M ${getX(0)},${yZero} L ${points.split(' ').join(' L ')} L ${getX(chartData.length - 1)},${yZero} Z`}
                                    fill={metric === 'income' ? "url(#positiveGradient)" : "url(#negativeGradient)"}
                                    stroke="none"
                                />
                            )}

                            <polyline
                                points={points}
                                fill="none"
                                stroke={lineColor}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />

                            {hoveredIndex !== null && (
                                <g>
                                    <line
                                        x1={getX(hoveredIndex)}
                                        y1={padding.top}
                                        x2={getX(hoveredIndex)}
                                        y2={height - padding.bottom}
                                        stroke="#e5e7eb"
                                        strokeDasharray="4 4"
                                    />
                                    <circle
                                        cx={getX(hoveredIndex)}
                                        cy={getY(chartData[hoveredIndex].value)}
                                        r="4"
                                        fill="white"
                                        stroke={lineColor}
                                        strokeWidth="2"
                                    />
                                </g>
                            )}

                            {chartData.map((_, i) => (
                                <rect
                                    key={i}
                                    x={getX(i) - (width / chartData.length / 2)}
                                    y={0}
                                    width={width / chartData.length}
                                    height={height}
                                    fill="transparent"
                                    onMouseEnter={() => setHoveredIndex(i)}
                                    onMouseLeave={() => setHoveredIndex(null)}
                                />
                            ))}

                            {hoveredIndex !== null && (
                                <g>
                                    <rect
                                        x={Math.max(10, Math.min(getX(hoveredIndex) - 40, width - 90))}
                                        y={Math.max(5, getY(chartData[hoveredIndex].value) - 45)}
                                        width="80"
                                        height="40"
                                        rx="6"
                                        fill="white"
                                        stroke="#e5e7eb"
                                        strokeWidth="1"
                                    />
                                    <text
                                        x={Math.max(10, Math.min(getX(hoveredIndex) - 40, width - 90)) + 40}
                                        y={Math.max(5, getY(chartData[hoveredIndex].value) - 45) + 16}
                                        textAnchor="middle"
                                        fontSize="11"
                                        fontWeight="600"
                                        fill="#111827"
                                    >
                                        {chartData[hoveredIndex].label}
                                    </text>
                                    <text
                                        x={Math.max(10, Math.min(getX(hoveredIndex) - 40, width - 90)) + 40}
                                        y={Math.max(5, getY(chartData[hoveredIndex].value) - 45) + 32}
                                        textAnchor="middle"
                                        fontSize="11"
                                        fill="#6b7280"
                                    >
                                        ¥{chartData[hoveredIndex].value.toFixed(2)}
                                    </text>
                                </g>
                            )}
                        </svg>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-300 text-sm">
                        数据不足
                    </div>
                )}
            </div>

            <div className="grid grid-cols-4 gap-4 mb-4 shrink-0">
                <div>
                    <div className="text-xs text-gray-400 mb-1">最高</div>
                    <div className="font-mono font-medium text-sm">{stats.max.toFixed(0)}</div>
                </div>
                <div>
                    <div className="text-xs text-gray-400 mb-1">最低</div>
                    <div className="font-mono font-medium text-sm">{stats.min.toFixed(0)}</div>
                </div>
                <div>
                    <div className="text-xs text-gray-400 mb-1">波幅</div>
                    <div className="font-mono font-medium text-sm">{stats.range.toFixed(0)}</div>
                </div>
                <div>
                    <div className="text-xs text-gray-400 mb-1">平均</div>
                    <div className="font-mono font-medium text-sm">{stats.avg.toFixed(0)}</div>
                </div>
            </div>

            <div className="flex flex-col gap-2 shrink-0">
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    {(['expense', 'income', 'net'] as Metric[]).map(m => (
                        <button
                            key={m}
                            onClick={() => setMetric(m)}
                            className={cn(
                                "flex-1 py-1.5 text-sm font-medium rounded-md transition-all",
                                metric === m ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                            )}
                        >
                            {m === 'expense' ? '支出' : m === 'income' ? '收入' : '净流水'}
                        </button>
                    ))}
                </div>

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

                <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-700">分组方式</div>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        {(['day', 'week', 'month'] as Granularity[]).map(g => (
                            <button
                                key={g}
                                onClick={() => setGranularity(g)}
                                className={cn(
                                    "px-3 py-1 text-xs font-medium rounded-md transition-all",
                                    granularity === g ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                                )}
                            >
                                {g === 'day' ? '天' : g === 'week' ? '周' : '月'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
