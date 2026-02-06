/**
 * [性质]: [组件] 周期任务列表项
 * [Input]: Task Data
 * [Output]: Item UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
    Pause,
    Play,
    Pencil,
    Trash2,
    Loader2,
    ArrowDownCircle,
    ArrowUpCircle,
    ArrowRightLeft,
    MapPin,
    Star,
    AlertTriangle,
    Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    getCurrencySymbol,
    formatFrequency,
} from "./constants";

// ============================================================================
// 类型定义
// ============================================================================

export interface PeriodicTaskData {
    id: string;
    from_account_id: string;
    to_account_id: string;
    amount: number;
    from_amount?: number | null;
    to_amount?: number | null;
    description?: string | null;
    frequency: string;
    next_run_date: string;
    is_active: boolean;
    location?: string | null;
    project_id?: string | null;
    is_starred?: boolean;
    needs_review?: boolean;
    from_account?: { name: string; currency: string; type?: string; full_path?: string } | null;
    to_account?: { name: string; currency: string; type?: string; full_path?: string } | null;
    project?: { name: string } | null;
}

interface PeriodicTaskItemProps {
    task: PeriodicTaskData;
    colors: {
        expense: string;
        income: string;
        transfer: string;
    };
    onEdit: (task: PeriodicTaskData) => void;
    onToggleActive: (task: PeriodicTaskData) => void;
    onDelete: (task: PeriodicTaskData) => void;
    isToggling?: boolean;
    isDeleting?: boolean;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 推断交易类型
 */
function inferTransactionType(
    fromAccountType: string | undefined,
    toAccountType: string | undefined
): "expense" | "income" | "transfer" {
    const isFromReal = fromAccountType === "asset" || fromAccountType === "liability";
    const isToReal = toAccountType === "asset" || toAccountType === "liability";

    if (isFromReal && !isToReal && toAccountType === "expense") {
        return "expense";
    }
    if (!isFromReal && isToReal && fromAccountType === "income") {
        return "income";
    }
    if (isFromReal && isToReal) {
        return "transfer";
    }
    return "expense";
}

const CURRENCY_SET = new Set(['CNY', 'USD', 'HKD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'SGD', 'TWD', 'KRW', 'THB', 'MYR', 'PHP', 'INR', 'RUB', 'BRL', 'MXN', 'ZAR', 'USDT']);

/**
 * 获取账户显示名称
 * - 币种子账户：显示 "父账户名 币种"，如 "工行（5738） CNY"
 * - 实账户：显示名称
 * - 虚账户：只显示名称
 */
function getAccountDisplayName(
    account: { name: string; currency?: string; type?: string; full_path?: string } | null,
    fallback: string = "未知"
): string {
    if (!account) return fallback;

    // 如果账户名是币种代码，使用 full_path 获取父账户名
    if (CURRENCY_SET.has(account.name)) {
        if (account.full_path) {
            const parts = account.full_path.split(':');
            if (parts.length >= 2) {
                const parentName = parts[parts.length - 2];
                return `${parentName} ${account.name}`;
            }
        }
        return account.name;
    }

    return account.name;
}

// ============================================================================
// 组件
// ============================================================================

export function PeriodicTaskItem({
    task,
    colors,
    onEdit,
    onToggleActive,
    onDelete,
    isToggling = false,
    isDeleting = false,
}: PeriodicTaskItemProps) {
    // 推断交易类型
    const txType = inferTransactionType(
        task.from_account?.type,
        task.to_account?.type
    );

    // 币种和符号
    const fromCurrency = task.from_account?.currency || "CNY";
    const toCurrency = task.to_account?.currency || "CNY";
    const isCrossCurrency = fromCurrency !== toCurrency;

    // 格式化周期显示
    const displayFrequency = formatFrequency(task.frequency);

    // 颜色
    const color = txType === "expense"
        ? colors.expense
        : txType === "transfer"
            ? colors.transfer
            : colors.income;

    // 账户名和类型（用于字体颜色）
    const fromName = getAccountDisplayName(task.from_account || null);
    const toName = getAccountDisplayName(task.to_account || null);
    const isFromReal = task.from_account?.type === 'asset' || task.from_account?.type === 'liability';
    const isToReal = task.to_account?.type === 'asset' || task.to_account?.type === 'liability';

    // 金额显示
    const displayAmount = () => {
        if (isCrossCurrency && task.from_amount && task.to_amount) {
            const fromSymbol = getCurrencySymbol(fromCurrency);
            const toSymbol = getCurrencySymbol(toCurrency);
            return `${fromSymbol}${task.from_amount.toFixed(2)} → ${toSymbol}${task.to_amount.toFixed(2)}`;
        }
        const symbol = getCurrencySymbol(fromCurrency);
        const prefix = txType === "expense" ? "-" : txType === "income" ? "+" : "";
        return `${prefix}${symbol}${Math.abs(task.amount).toFixed(2)}`;
    };

    // 是否有更多信息
    const hasMoreInfo = task.location || task.project?.name;

    return (
        <div
            className="group grid grid-cols-[32px_60px_70px_1fr_100px_1fr_1fr_70px_20px_96px] gap-2 items-center py-3 px-4 border-b border-gray-100 last:border-b-0 transition-colors hover:bg-gray-50/50"
        >
            {/* 1. 类型图标 */}
            <div
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ color }}
            >
                {txType === "expense" ? (
                    <ArrowUpCircle size={20} />
                ) : txType === "transfer" ? (
                    <ArrowRightLeft size={20} />
                ) : (
                    <ArrowDownCircle size={20} />
                )}
            </div>

            {/* 2. 周期 */}
            <div className="text-xs text-gray-500 truncate">
                {displayFrequency}
            </div>

            {/* 3. 下次执行时间 */}
            <div className="text-sm text-gray-700">
                {format(new Date(task.next_run_date), "MM/dd", { locale: zhCN })}
            </div>

            {/* 4. 转出账户 - 居中对齐，实账户黑色/虚账户灰色 */}
            <div
                className={`text-sm truncate text-center ${isFromReal ? 'text-gray-900' : 'text-gray-400'}`}
                title={fromName}
            >
                {fromName}
            </div>

            {/* 5. 金额 - 居中对齐 */}
            <div
                className="text-sm font-semibold tabular-nums text-center whitespace-nowrap"
                style={{ color }}
            >
                {displayAmount()}
            </div>

            {/* 6. 转入账户 - 居中对齐，实账户黑色/虚账户灰色 */}
            <div
                className={`text-sm truncate text-center ${isToReal ? 'text-gray-900' : 'text-gray-400'}`}
                title={toName}
            >
                {toName}
            </div>

            {/* 7. 备注 - 超过20字截断，悬浮显示浮窗 */}
            <div className="relative group/note">
                <div className="text-xs text-gray-500 truncate">
                    {task.description
                        ? (task.description.length > 20
                            ? task.description.slice(0, 20) + '...'
                            : task.description)
                        : '-'
                    }
                </div>
                {task.description && task.description.length > 20 && (
                    <div className="absolute left-0 bottom-full mb-1 p-2 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover/note:opacity-100 group-hover/note:visible transition-all z-[100] max-w-[300px] whitespace-normal text-xs text-gray-600">
                        {task.description}
                    </div>
                )}
            </div>

            {/* 8. 状态指示灯 - 固定三图标，灰色/着色表示状态 */}
            <div className="flex items-center justify-center gap-1">
                {/* 重要 */}
                <Star
                    size={16}
                    className={task.is_starred ? "text-yellow-400" : "text-gray-200"}
                    fill={task.is_starred ? "currentColor" : "none"}
                />
                {/* 待核对 */}
                <AlertTriangle
                    size={16}
                    className={task.needs_review ? "text-orange-500" : "text-gray-200"}
                />
                {/* 暂停 */}
                <Pause
                    size={16}
                    className={!task.is_active ? "text-amber-500" : "text-gray-200"}
                />
            </div>

            {/* 9. 更多信息 */}
            <div className="flex items-center justify-center">
                {hasMoreInfo && (
                    <div className="relative group/more">
                        <Info size={16} className="text-gray-400 hover:text-gray-600 cursor-help" />
                        {/* 悬浮提示 - 向上弹出避免被截断 */}
                        <div className="absolute right-0 bottom-full mb-1 p-2 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover/more:opacity-100 group-hover/more:visible transition-all z-[100] min-w-[150px] whitespace-nowrap">
                            {task.location && (
                                <div className="flex items-center gap-1 text-xs text-gray-600">
                                    <MapPin size={12} />
                                    <span>{task.location}</span>
                                </div>
                            )}
                            {task.project?.name && (
                                <div className="text-xs text-blue-500 mt-1">
                                    📁 {task.project.name}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* 10. 操作按钮 */}
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onToggleActive(task)}
                    disabled={isToggling}
                    title={task.is_active ? "暂停" : "恢复"}
                >
                    {isToggling ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : task.is_active ? (
                        <Pause size={16} className="text-amber-600" />
                    ) : (
                        <Play size={16} className="text-green-600" />
                    )}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onEdit(task)}
                    title="编辑"
                >
                    <Pencil size={16} className="text-gray-500" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onDelete(task)}
                    disabled={isDeleting}
                    title="删除"
                >
                    {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Trash2 size={16} className="text-red-500" />
                    )}
                </Button>
            </div>
        </div>
    );
}

// ============================================================================
// 表头组件
// ============================================================================

export function PeriodicTaskHeader() {
    return (
        <div className="grid grid-cols-[32px_60px_70px_1fr_100px_1fr_1fr_70px_20px_96px] gap-2 items-center py-2 px-4 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <div /> {/* 类型图标 */}
            <div>周期</div>
            <div>下次执行</div>
            <div className="text-center">转出</div>
            <div className="text-center">金额</div>
            <div className="text-center">转入</div>
            <div>备注</div>
            <div className="text-center">状态</div>
            <div /> {/* 更多信息 */}
            <div /> {/* 操作按钮 */}
        </div>
    );
}
