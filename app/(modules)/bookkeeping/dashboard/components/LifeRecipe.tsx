"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import { getBookkeepingSettings } from "@/lib/bookkeeping/actions";

interface LifeRecipeProps {
    transactions: any[];
}

type Metric = 'expense' | 'income';

export function LifeRecipe({ transactions }: LifeRecipeProps) {
    const [metric, setMetric] = React.useState<Metric>('expense');
    const [activeIndex, setActiveIndex] = React.useState<number | undefined>(undefined);
    const [colors, setColors] = React.useState({
        expense: '#ef4444',
        income: '#22c55e'
    });

    React.useEffect(() => {
        getBookkeepingSettings().then(settings => {
            setColors({
                expense: settings.expense_color,
                income: settings.income_color
            });
        });
    }, []);

    // 1. Process Data
    const data = React.useMemo(() => {
        const map = new Map<string, number>();
        let total = 0;

        transactions.forEach(tx => {
            if (tx.type !== metric) return;
            const amount = Math.abs(tx.amount);
            if (amount === 0) return;

            map.set(tx.category, (map.get(tx.category) || 0) + amount);
            total += amount;
        });

        return Array.from(map.entries())
            .map(([name, value]) => ({
                name,
                value,
                percent: total > 0 ? (value / total) : 0
            }))
            .sort((a, b) => b.value - a.value);
    }, [transactions, metric]);

    const totalAmount = data.reduce((s, i) => s + i.value, 0);

    // 2. Chart Calculations
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    let currentOffset = 0;

    // Generate shades of the main color for segments
    const getSegmentColor = (index: number, totalSegments: number) => {
        const baseColor = colors[metric];
        // Simple opacity/lightness variation logic could be better, 
        // but for now let's just use the base color with varying opacity
        // OR use HSL if we parsed the hex. 
        // Let's stick to a simple opacity trick via CSS or just use the same color 
        // but maybe different shades if possible. 
        // Since we want "pure visual control" per dev log, let's use opacity.
        
        // Actually, standard donut charts usually have different colors for categories.
        // But user requested "Global Color" for Expense/Income. 
        // This implies all expenses are Red, all incomes Green.
        // To distinguish segments, we MUST use shades or opacity.
        
        // Opacity approach: 1.0 down to 0.2
        const opacity = 1 - (index / (totalSegments + 1)) * 0.8;
        
        // Convert hex to rgba
        const hex = baseColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    };

    const segments = data.map((item, index) => {
        const strokeDasharray = `${item.percent * circumference} ${circumference}`;
        const strokeDashoffset = -currentOffset;
        currentOffset += item.percent * circumference;
        
        return {
            ...item,
            strokeDasharray,
            strokeDashoffset,
            color: getSegmentColor(index, data.length)
        };
    });

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 shrink-0">
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

            {/* Chart Area */}
            <div className="relative w-full flex-1 min-h-[200px] flex items-center justify-center mb-6">
                {data.length > 0 ? (
                    <div className="relative w-64 h-64">
                        {/* SVG Donut Chart */}
                        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                            {segments.map((segment, index) => (
                                <circle
                                    key={segment.name}
                                    cx="50"
                                    cy="50"
                                    r={radius}
                                    fill="transparent"
                                    stroke={segment.color}
                                    strokeWidth="12"
                                    strokeDasharray={segment.strokeDasharray}
                                    strokeDashoffset={segment.strokeDashoffset}
                                    className={cn(
                                        "transition-all duration-300 cursor-pointer hover:opacity-80",
                                        activeIndex === index ? "stroke-[14]" : ""
                                    )}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    onMouseLeave={() => setActiveIndex(undefined)}
                                />
                            ))}
                        </svg>
                        
                        {/* Center Text */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-xs text-gray-400">合计</span>
                            <span className="text-lg font-bold text-gray-900 font-mono">
                                {activeIndex !== undefined && data[activeIndex]
                                    ? `¥${data[activeIndex].value.toFixed(0)}`
                                    : `¥${totalAmount.toFixed(0)}`
                                }
                            </span>
                            {activeIndex !== undefined && data[activeIndex] && (
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

            {/* Controls */}
            <div className="flex items-center justify-between mb-4 shrink-0">
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

            {/* Legend List */}
            <div className="space-y-3 overflow-y-auto max-h-[200px] pr-2 custom-scrollbar flex-1">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                    <span>显示所有交易</span>
                    <span>{data.length}</span>
                </div>
                {data.map((item, i) => (
                    <div
                        key={item.name}
                        className={cn(
                            "flex items-center justify-between text-sm p-2 rounded-lg transition-colors cursor-pointer",
                            activeIndex === i ? "bg-gray-50" : "hover:bg-gray-50"
                        )}
                        onMouseEnter={() => setActiveIndex(i)}
                        onMouseLeave={() => setActiveIndex(undefined)}
                    >
                        <div className="flex items-center gap-2">
                            <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: segments[i]?.color || '#e5e7eb' }}
                            />
                            <span className="text-gray-700">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-gray-400 text-xs">¥{item.value.toFixed(0)}</span>
                            <span className="font-mono font-medium text-gray-900 w-10 text-right">
                                {(item.percent * 100).toFixed(1)}%
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
