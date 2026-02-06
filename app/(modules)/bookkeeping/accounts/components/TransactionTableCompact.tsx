/**
 * [性质]: [组件] 紧凑型交易流水表格 (Dashboard/Compact View)
 * [Input]: transactions, displaySettings
 * [Output]: TransactionTableCompact
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { TransactionWithAccounts } from "@/types/database";
import { formatAmount, BookkeepingSettings } from "@/lib/bookkeeping/useSettings";
import { useBookkeepingColors } from "@/lib/bookkeeping/useColors";
import { inferTransactionType, CURRENCY_SYMBOLS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ArrowRight, MoreHorizontal } from "lucide-react";

interface TransactionTableCompactProps {
    transactions: TransactionWithAccounts[];
    displaySettings?: Partial<BookkeepingSettings>;
}

function getCurrencySymbol(currency: string | null | undefined): string {
    if (!currency) return "¥";
    return CURRENCY_SYMBOLS[currency] || currency;
}

// 判断是否为实账户（必须是 account_class='real' 的账户）
function isRealAccount(account: { type?: string; account_class?: string } | undefined): boolean {
    if (!account) return false;
    // 使用 account_class 判断，如果没有则回退到 type 判断
    if (account.account_class) {
        return account.account_class === 'real';
    }
    return account.type === 'asset' || account.type === 'liability';
}

const NATURE_LABELS: Record<string, string> = {
    regular: "常规",
    unexpected: "意外",
    periodic: "周期",
};

export function TransactionTableCompact({
    transactions,
    displaySettings,
}: TransactionTableCompactProps) {
    const { colors } = useBookkeepingColors();

    if (transactions.length === 0) {
        return (
            <div className="py-8 text-center text-gray-400 text-sm">
                暂无相关流水
            </div>
        );
    }

    return (
        <div className="w-full overflow-hidden">
            <table className="w-full text-left border-collapse table-fixed">
                <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                        <th className="py-2 pl-3 font-medium w-[50px]">日期</th>
                        <th className="py-2 font-medium w-[180px] text-center">转出账户</th>
                        <th className="py-2 font-medium w-[180px] text-center">金额</th>
                        <th className="py-2 font-medium w-[180px] text-center">转入账户</th>
                        <th className="py-2 font-medium">备注</th>
                        <th className="py-2 pr-4 font-medium w-[40px]"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {transactions.map((tx) => (
                        <TransactionRow
                            key={tx.id}
                            tx={tx}
                            colors={colors}
                            displaySettings={displaySettings}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
}

interface TransactionRowProps {
    tx: TransactionWithAccounts;
    colors: { expense: string; income: string; transfer: string };
    displaySettings?: Partial<BookkeepingSettings>;
}

function TransactionRow({ tx, colors, displaySettings }: TransactionRowProps) {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);

    const dateObj = parseISO(tx.date);
    const displayDate = format(dateObj, "MM-dd");

    let txType = inferTransactionType(
        tx.from_account?.type as any,
        tx.to_account?.type as any
    );

    if (tx.is_opening) {
        txType = "opening";
    }

    // 判断账户颜色 - 使用完整账户对象
    const fromIsReal = isRealAccount(tx.from_account);
    const toIsReal = isRealAccount(tx.to_account);

    // 获取金额显示
    const fromCurrency = tx.from_account?.currency || "CNY";
    const toCurrency = tx.to_account?.currency || "CNY";
    // 只在币种确实不同时显示跨币种箭头，期初交易不显示
    const isCrossCurrency = txType !== 'opening' && fromCurrency !== toCurrency && tx.from_amount && tx.to_amount;

    const fromSymbol = getCurrencySymbol(fromCurrency);
    const toSymbol = getCurrencySymbol(toCurrency);

    let amountColor = colors.transfer;
    let amountSign = "";
    if (txType === "expense") {
        amountColor = colors.expense;
        amountSign = "-";
    } else if (txType === "income") {
        amountColor = colors.income;
        amountSign = "+";
    } else if (txType === "opening") {
        if (tx.amount >= 0) {
            amountColor = colors.income;
            amountSign = "+";
        } else {
            amountColor = colors.expense;
            amountSign = "-";
        }
    }

    // 检查是否有附加信息
    const hasInfo = tx.location || tx.created_at || tx.project;
    const formattedCreatedAt = tx.created_at
        ? format(new Date(tx.created_at), "yyyy-MM-dd HH:mm", { locale: zhCN })
        : null;

    const handleMouseEnter = () => {
        if (buttonRef.current && hasInfo) {
            const rect = buttonRef.current.getBoundingClientRect();
            const tooltipWidth = 200; // min-w-[200px]
            // 计算左边位置，确保不超出右边界
            let leftPos = rect.right - tooltipWidth;
            // 确保不超出左边界
            if (leftPos < 8) leftPos = 8;
            setTooltipPos({
                top: rect.bottom + 4,
                left: leftPos,
            });
            setShowTooltip(true);
        }
    };

    const handleMouseLeave = () => {
        setShowTooltip(false);
    };

    return (
        <tr className="hover:bg-gray-50/50 transition-colors">
            {/* 日期 */}
            <td className="py-2 pl-3 text-[11px] font-mono text-gray-500 whitespace-nowrap">
                {displayDate}
            </td>

            {/* 转出账户 */}
            <td className="py-2 text-center">
                <span
                    className={cn(
                        "text-[11px] font-medium truncate max-w-[160px] inline-block",
                        fromIsReal ? "text-gray-800" : "text-gray-400"
                    )}
                    title={tx.from_account?.name}
                >
                    {tx.from_account?.name || "-"}
                </span>
            </td>

            {/* 金额 */}
            <td className="py-2 text-center">
                {isCrossCurrency ? (
                    <div className="flex items-center justify-center gap-1 text-[10px] font-mono whitespace-nowrap" style={{ color: amountColor }}>
                        <span>{fromSymbol}{formatAmount(tx.from_amount!, displaySettings)}</span>
                        <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span>{toSymbol}{formatAmount(tx.to_amount!, displaySettings)}</span>
                    </div>
                ) : (
                    <span
                        className="text-[11px] font-bold font-mono whitespace-nowrap"
                        style={{ color: amountColor }}
                    >
                        {amountSign}{fromSymbol}{formatAmount(Math.abs(tx.amount), displaySettings)}
                    </span>
                )}
            </td>

            {/* 转入账户 */}
            <td className="py-2 text-center">
                <span
                    className={cn(
                        "text-[11px] font-medium truncate max-w-[160px] inline-block",
                        toIsReal ? "text-gray-800" : "text-gray-400"
                    )}
                    title={tx.to_account?.name}
                >
                    {tx.to_account?.name || "-"}
                </span>
            </td>

            {/* 备注 */}
            <td className="py-2">
                <div
                    className="text-[11px] text-gray-500 truncate max-w-[100px]"
                    title={tx.description || ""}
                >
                    {tx.description || "-"}
                </div>
            </td>

            {/* 更多信息 */}
            <td className="py-2 pr-4">
                <button
                    ref={buttonRef}
                    type="button"
                    className={cn(
                        "p-1 rounded transition-colors",
                        hasInfo
                            ? "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            : "text-gray-200 cursor-default"
                    )}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    disabled={!hasInfo}
                >
                    <MoreHorizontal size={14} />
                </button>

                {showTooltip && hasInfo && typeof document !== 'undefined' &&
                    createPortal(
                        <div
                            className="fixed z-[9999] bg-white border border-gray-200 shadow-xl rounded-lg p-3 text-xs min-w-[200px]"
                            style={{
                                top: tooltipPos.top,
                                left: tooltipPos.left,
                            }}
                            onMouseEnter={() => setShowTooltip(true)}
                            onMouseLeave={handleMouseLeave}
                        >
                            <div className="space-y-2">
                                {tx.location && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-gray-400 w-12">发生地</span>
                                        <span className="text-gray-700 font-medium">{tx.location}</span>
                                    </div>
                                )}
                                {tx.project && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-gray-400 w-12">项目</span>
                                        <span className="text-gray-700 font-medium">{(tx.project as any).name}</span>
                                    </div>
                                )}
                                {formattedCreatedAt && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-gray-400 w-12">创建于</span>
                                        <span className="text-gray-500 font-mono text-[11px]">{formattedCreatedAt}</span>
                                    </div>
                                )}
                            </div>
                        </div>,
                        document.body
                    )}
            </td>
        </tr>
    );
}
