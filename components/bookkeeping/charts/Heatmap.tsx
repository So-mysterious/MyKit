/**
 * [性质]: [组件] 交易热力图
 * [Input]: BookkeepingCache (heatmapAggregation)
 * [Output]: Calendar Heatmap
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import {
    format,
    subMonths,
    startOfYear,
    endOfYear,
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
    isSameDay,
    isAfter,
    startOfDay,
    getYear
} from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useBookkeepingCache } from "@/lib/bookkeeping/cache/BookkeepingCacheProvider";
import { useBookkeepingColors } from "@/lib/bookkeeping/useColors";
import { ChevronLeft, ChevronRight } from "lucide-react";

// --- Types ---

export type HeatmapLevel = -3 | -2 | -1 | 0 | 1 | 2 | 3;

interface HeatmapProps {
    transactions?: any[];
    filterAccountId?: string;
    hideLegend?: boolean;
}

interface BlockProps {
    date: Date;
    value: number;
    level: HeatmapLevel;
    isSelected: boolean;
    isFuture: boolean;
    onClick: () => void;
    colors: { expense: string; income: string };
}

interface HeatmapStats {
    mean: number;
    stdDev: number;
}

// --- Components ---

// Helper to generate lighter shades for heatmap levels
function getShade(colorHex: string, level: number) {
    const opacity = level === 3 ? 1 : level === 2 ? 0.6 : 0.3;
    const hex = colorHex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function getColorStyle(level: HeatmapLevel, colors: { expense: string; income: string }) {
    if (level === 0) return "#f3f4f6";
    if (level > 0) return getShade(colors.income, level);
    return getShade(colors.expense, Math.abs(level));
}

function Block({ date, value, level, isSelected, isFuture, onClick, colors }: BlockProps) {
    const dateStr = format(date, 'yyyy-MM-dd');
    const bgStyle = getColorStyle(level, colors);

    return (
        <div
            onClick={!isFuture ? onClick : undefined}
            className={cn(
                isFuture && "opacity-20 cursor-default",
                !isFuture && "cursor-pointer hover:scale-110 hover:z-20 transition-transform duration-200",
                isSelected && "ring-2 ring-offset-1 ring-black z-10 scale-110 relative",
                level === 0 && "border border-black/5"
            )}
            style={{
                width: '18px',
                height: '18px',
                backgroundColor: bgStyle,
                borderRadius: '5px'
            }}
            title={`${dateStr}: ¥${value.toFixed(2)}`}
        />
    );
}

function Legend({ colors }: { colors: { expense: string; income: string } }) {
    const levels: HeatmapLevel[] = [-3, -2, -1, 0, 1, 2, 3];
    const labels = ["-3", "-2", "-1", "0", "1", "2", "3"];

    return (
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm w-full flex flex-col items-center justify-center gap-3">
            <div className="flex gap-3">
                {levels.map((level, index) => (
                    <div key={level} className="flex flex-col items-center gap-2">
                        <div
                            className={cn(
                                "w-6 h-6 shadow-sm",
                                level === 0 && "border border-black/5"
                            )}
                            style={{
                                backgroundColor: getColorStyle(level, colors),
                                borderRadius: '6px'
                            }}
                        />
                        <span className="text-[10px] text-gray-400 font-mono">{labels[index]}</span>
                    </div>
                ))}
            </div>
            <div className="flex justify-between w-full max-w-[240px] text-[10px] text-gray-400 px-2 uppercase tracking-tight">
                <span>支出强度</span>
                <span>收入强度</span>
            </div>
        </div>
    );
}

// --- Main Heatmap Component ---

export function Heatmap({ transactions, filterAccountId, hideLegend = false }: HeatmapProps) {
    const today = startOfDay(new Date());
    const cache = useBookkeepingCache();
    const { colors } = useBookkeepingColors();
    const [dataMap, setDataMap] = React.useState<Map<string, number> | null>(null);
    const [stats, setStats] = React.useState<HeatmapStats>({ mean: 0, stdDev: 0 });
    const [loading, setLoading] = React.useState(true);
    const [currentYear, setCurrentYear] = React.useState(getYear(today));

    // 找出有流水的最早年份和最晚年份
    const yearRange = React.useMemo(() => {
        if (!dataMap || dataMap.size === 0) return { min: getYear(today), max: getYear(today) };
        const years = Array.from(dataMap.keys()).map(k => parseInt(k.split('-')[0]));
        return {
            min: Math.min(...years, getYear(today)),
            max: Math.max(...years, getYear(today))
        };
    }, [dataMap, today]);

    React.useEffect(() => {
        const loadAggregation = async () => {
            try {
                const data = await cache.getHeatmapAggregation(filterAccountId);
                setDataMap(data.dataMap);
                setStats(data.stats);
            } catch (err) {
                console.error("Failed to load heatmap aggregation:", err);
            } finally {
                setLoading(false);
            }
        };
        loadAggregation();
    }, [cache.getHeatmapAggregation, filterAccountId]);

    const getLevel = React.useCallback((val: number): HeatmapLevel => {
        if (val === 0) return 0;
        const isExpense = val < 0;
        const center = stats.mean;
        const dev = stats.stdDev === 0 ? 1 : stats.stdDev;
        const diff = Math.abs(val - center);
        const sigma = diff / dev;

        let intensity = 1;
        if (sigma > 2.5) intensity = 3;
        else if (sigma > 1) intensity = 2;
        else intensity = 1;

        return (isExpense ? -intensity : intensity) as HeatmapLevel;
    }, [stats]);

    const yearDays = React.useMemo(() => {
        const start = startOfYear(new Date(currentYear, 0, 1));
        const end = endOfYear(new Date(currentYear, 0, 1));
        return eachDayOfInterval({ start, end });
    }, [currentYear]);

    // 💡 锁定为当前最近两个月，不受 currentYear 影响
    const monthDays = React.useMemo(() => {
        return eachDayOfInterval({
            start: startOfMonth(subMonths(today, 1)),
            end: endOfMonth(today)
        });
    }, [today]);

    if (loading || !dataMap) {
        return (
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm w-full">
                <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                    加载中...
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 w-full min-w-0">
            {/* 1. 年度概览 - 带翻页 */}
            <HeatmapSection
                title={`${currentYear} 年度分布`}
                days={yearDays}
                dataMap={dataMap}
                getLevel={getLevel}
                today={today}
                stats={stats}
                colors={colors}
                pagination={{
                    onPrev: () => setCurrentYear(p => p - 1),
                    onNext: () => setCurrentYear(p => p + 1),
                    canPrev: currentYear > yearRange.min,
                    canNext: currentYear < yearRange.max
                }}
            />

            {/* 2. 最近动态 - 锁定历史 */}
            <HeatmapSection
                title="最近动态"
                days={monthDays}
                dataMap={dataMap}
                getLevel={getLevel}
                today={today}
                stats={stats}
                colors={colors}
            />

            {!hideLegend && <Legend colors={colors} />}
        </div>
    );
}

// --- Section Component ---

interface HeatmapSectionProps {
    title: string;
    days: Date[];
    dataMap: Map<string, number>;
    getLevel: (val: number) => HeatmapLevel;
    today: Date;
    stats: HeatmapStats;
    colors: { expense: string; income: string };
    pagination?: {
        onPrev: () => void;
        onNext: () => void;
        canPrev: boolean;
        canNext: boolean;
    };
}

function HeatmapSection({ title, days, dataMap, getLevel, today, stats, colors, pagination }: HeatmapSectionProps) {
    const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);

    // 使用稳定的依赖项，避免无限循环
    const daysKey = React.useMemo(() => {
        if (days.length === 0) return '';
        return `${days.length}-${format(days[0], 'yyyy-MM-dd')}-${format(days[days.length - 1], 'yyyy-MM-dd')}`;
    }, [days]);

    React.useEffect(() => {
        if (days.length === 0) {
            setSelectedDate(null);
            return;
        }
        const validDays = days.filter(d => !isAfter(d, today));
        if (validDays.length > 0) {
            const lastOne = validDays[validDays.length - 1];
            // 只在日期确实变化时更新
            setSelectedDate(prev => {
                if (prev && format(prev, 'yyyy-MM-dd') === format(lastOne, 'yyyy-MM-dd')) {
                    return prev;
                }
                return lastOne;
            });
        } else {
            setSelectedDate(null);
        }
    }, [daysKey, today]);

    const selectedVal = selectedDate ? (dataMap.get(format(selectedDate, 'yyyy-MM-dd')) || 0) : 0;

    if (!days || days.length === 0) return null;

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm w-full min-w-0">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4 min-h-[40px]">
                <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-gray-900 shrink-0">{title}</h2>
                    {pagination && (
                        <div className="flex gap-1 ml-1">
                            <button
                                onClick={pagination.onPrev}
                                disabled={!pagination.canPrev}
                                className="p-1 hover:bg-gray-100 rounded-md disabled:opacity-20 transition-colors"
                            >
                                <ChevronLeft size={18} className="text-gray-600" />
                            </button>
                            <button
                                onClick={pagination.onNext}
                                disabled={!pagination.canNext}
                                className="p-1 hover:bg-gray-100 rounded-md disabled:opacity-20 transition-colors"
                            >
                                <ChevronRight size={18} className="text-gray-600" />
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex flex-1 justify-center items-center gap-6 text-sm text-gray-500">
                    <div className="flex items-center gap-3 font-mono text-[10px] opacity-60">
                        <span title="中位数流水">M: {stats.mean >= 0 ? '+' : ''}{stats.mean.toFixed(0)}</span>
                        <span className="text-gray-300">|</span>
                        <span title="强健标准差">S: {stats.stdDev.toFixed(0)}</span>
                    </div>
                    {selectedDate && (
                        <div className={cn(
                            "font-mono font-bold text-base",
                            selectedVal > 0 ? "text-emerald-600" :
                                selectedVal < 0 ? "text-red-600" : "text-gray-500"
                        )}>
                            {selectedVal > 0 ? '+' : ''}¥{selectedVal.toFixed(2)}
                        </div>
                    )}
                </div>

                <div className="text-sm font-medium text-gray-500 shrink-0 text-right w-[120px]">
                    {selectedDate ? format(selectedDate, 'yyyy年M月d日', { locale: zhCN }) : '未选择'}
                </div>
            </div>

            {/* Grid Container */}
            <div
                className="grid gap-1 w-full"
                style={{
                    gridTemplateColumns: 'repeat(auto-fill, 18px)',
                    justifyContent: 'start'
                }}
            >
                {days.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const val = dataMap.get(dateStr) || 0;
                    const isFutureDate = isAfter(day, today);
                    return (
                        <Block
                            key={dateStr}
                            date={day}
                            value={val}
                            level={getLevel(val)}
                            isSelected={selectedDate ? isSameDay(day, selectedDate) : false}
                            isFuture={isFutureDate}
                            onClick={() => setSelectedDate(day)}
                            colors={colors}
                        />
                    );
                })}
            </div>
        </div>
    );
}
