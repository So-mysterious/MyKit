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
    startOfDay
} from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useBookkeepingCache } from "@/lib/bookkeeping/cache/BookkeepingCacheProvider";
import { useBookkeepingColors } from "@/lib/bookkeeping/useColors";

// --- Types ---

export type HeatmapLevel = -3 | -2 | -1 | 0 | 1 | 2 | 3;

interface HeatmapProps {
    transactions: any[];
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
    // level is 1, 2, or 3 (intensity)
    // 3 is darkest/purest, 1 is lightest
    const opacity = level === 3 ? 1 : level === 2 ? 0.6 : 0.3;

    const hex = colorHex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function getColorStyle(level: HeatmapLevel, colors: { expense: string; income: string }) {
    if (level === 0) return "#f3f4f6"; // gray-100

    if (level > 0) {
        // Positive/Income
        return getShade(colors.income, level);
    } else {
        // Negative/Expense
        return getShade(colors.expense, Math.abs(level));
    }
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
                level === 0 && "border border-black/5" // Add border for empty cells
            )}
            style={{
                width: '20px',
                height: '20px',
                backgroundColor: bgStyle,
                borderRadius: '6px'
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
                                "w-8 h-8 shadow-sm",
                                level === 0 && "border border-black/5"
                            )}
                            style={{
                                backgroundColor: getColorStyle(level, colors),
                                borderRadius: '8px'
                            }}
                        />
                        <span className="text-xs text-gray-400 font-mono">{labels[index]}</span>
                    </div>
                ))}
            </div>
            <div className="flex justify-between w-full max-w-[280px] text-xs text-gray-400 px-2">
                <span>支出 (标准差)</span>
                <span>收入 (标准差)</span>
            </div>
        </div>
    );
}

// --- Main Heatmap Component ---

export function Heatmap({ transactions }: HeatmapProps) {
    const today = startOfDay(new Date());
    const cache = useBookkeepingCache(); // ✅ 使用缓存
    const { colors } = useBookkeepingColors(); // ✅ 从缓存获取颜色
    const [dataMap, setDataMap] = React.useState<Map<string, number> | null>(null); // ✅ 初始为null
    const [stats, setStats] = React.useState<HeatmapStats>({ mean: 0, stdDev: 0 });
    const [loading, setLoading] = React.useState(true);

    // ✅ 从缓存获取聚合数据（而不是从transactions计算）
    React.useEffect(() => {
        const loadAggregation = async () => {
            try {
                const data = await cache.getHeatmapAggregation();
                setDataMap(data.dataMap);
                setStats(data.stats);
            } catch (err) {
                console.error("Failed to load heatmap aggregation:", err);
            } finally {
                setLoading(false);
            }
        };
        loadAggregation();
    }, [cache.getHeatmapAggregation]); // ✅ 稳定函数引用

    // 2. Level Calculation Logic (Based on StdDev)
    const getLevel = React.useCallback((val: number): HeatmapLevel => {
        if (val === 0) return 0;

        // How many stdDevs away from mean?
        const isExpense = val < 0;
        const absVal = Math.abs(val);

        // If stdDev is 0 (all values same), treat as level 1 if not 0
        const dev = stats.stdDev === 0 ? 1 : stats.stdDev;

        const sigma = absVal / dev;

        let intensity = 1;
        if (sigma > 2) intensity = 3;      // > 2σ
        else if (sigma > 1) intensity = 2; // 1σ - 2σ
        else intensity = 1;                // 0 - 1σ

        return (isExpense ? -intensity : intensity) as HeatmapLevel;
    }, [stats]);

    // 3. Date Ranges
    const yearDays = React.useMemo(() => {
        try {
            return eachDayOfInterval({ start: startOfYear(today), end: endOfYear(today) });
        } catch (e) { return []; }
    }, [today]);

    const monthDays = React.useMemo(() => {
        try {
            return eachDayOfInterval({
                start: startOfMonth(subMonths(today, 1)),
                end: endOfMonth(today)
            });
        } catch (e) { return []; }
    }, [today]);

    // ✅ 在dataMap加载完成前显示loading
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
            <HeatmapSection
                title="年度热力图"
                days={yearDays}
                dataMap={dataMap}
                getLevel={getLevel}
                today={today}
                stats={stats}
                colors={colors}
            />
            <HeatmapSection
                title="月度热力图"
                days={monthDays}
                dataMap={dataMap}
                getLevel={getLevel}
                today={today}
                stats={stats}
                colors={colors}
            />
            {/* Unified Legend */}
            <Legend colors={colors} />
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
}

function HeatmapSection({ title, days, dataMap, getLevel, today, stats, colors }: HeatmapSectionProps) {
    const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);

    React.useEffect(() => {
        const validDays = days.filter(d => !isAfter(d, today));
        const target = validDays.find(d => isSameDay(d, today)) || validDays[validDays.length - 1];
        if (target) setSelectedDate(target);
    }, [days, today]);

    const selectedVal = selectedDate ? (dataMap.get(format(selectedDate, 'yyyy-MM-dd')) || 0) : 0;

    if (!days || days.length === 0) return null;

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm w-full min-w-0">
            {/* Header: Flex Row layout for Title, Stats, Date */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-4 min-h-[40px]">

                {/* Left: Title */}
                <h2 className="text-lg font-bold text-gray-900 shrink-0">{title}</h2>

                {/* Center: Stats & Active Selection Info (Centered in available space) */}
                <div className="flex flex-1 justify-center items-center gap-6 text-sm text-gray-500">
                    {/* Stats */}
                    <div className="flex items-center gap-3 font-mono text-xs opacity-70">
                        <span title="平均净流水">Avg: {stats.mean >= 0 ? '+' : ''}{stats.mean.toFixed(0)}</span>
                        <span className="text-gray-300">|</span>
                        <span title="标准差">σ: {stats.stdDev.toFixed(0)}</span>
                    </div>

                    {/* Active Selection Amount */}
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

                {/* Right: Date */}
                <div className="text-sm font-medium text-gray-500 shrink-0 text-right w-[120px]">
                    {selectedDate ? format(selectedDate, 'yyyy年M月d日', { locale: zhCN }) : '无数据'}
                </div>
            </div>

            {/* Spacer Section with INLINE STYLE to force height */}
            <div style={{ height: '6px' }} />

            {/* Grid Container */}
            <div
                className="grid gap-1 w-full"
                style={{
                    // Using 20px blocks
                    gridTemplateColumns: 'repeat(auto-fill, 20px)',
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
