/**
 * [性质]: [组件] 余额趋势图
 * [Input]: data (history), currency
 * [Output]: AreaChart (Recharts)
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useBookkeepingColors } from "@/lib/bookkeeping/useColors";

interface BalanceChartProps {
    data: Array<{ date: string; balance: number }>;
    currency?: string;
    height?: number;
}

export function BalanceChart({ data, currency = "CNY", height = 250 }: BalanceChartProps) {
    const { colors } = useBookkeepingColors();

    const formattedData = React.useMemo(() => {
        return data.map((item) => ({
            ...item,
            displayDate: format(parseISO(item.date), "MM-dd"),
            fullDate: format(parseISO(item.date), "yyyy-MM-dd"),
        }));
    }, [data]);

    const yAxisDomain = React.useMemo(() => {
        if (data.length === 0) return [0, 100];
        const balances = data.map(d => d.balance);
        const min = Math.min(...balances);
        const max = Math.max(...balances);
        const padding = (max - min) * 0.1 || 10;
        return [min - padding, max + padding];
    }, [data]);

    const formatCurrency = (value: number) => {
        return value.toLocaleString('zh-CN', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        });
    };

    return (
        <div style={{ width: '100%', height }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                    data={formattedData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                    <defs>
                        <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={colors.transfer} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={colors.transfer} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis
                        dataKey="displayDate"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: '#9ca3af' }}
                        minTickGap={30}
                    />
                    <YAxis
                        hide
                        domain={yAxisDomain}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#fff',
                            borderRadius: '8px',
                            border: '1px solid #f0f0f0',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        }}
                        labelStyle={{ fontWeight: 'bold', marginBottom: '4px', color: '#374151' }}
                        formatter={(value: number) => [formatCurrency(value), "余额"]}
                        labelFormatter={(label, payload) => {
                            if (payload && payload[0]) {
                                return payload[0].payload.fullDate;
                            }
                            return label;
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="balance"
                        stroke={colors.transfer}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorBalance)"
                        animationDuration={1000}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
