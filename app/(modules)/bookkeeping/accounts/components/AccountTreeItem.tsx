/**
 * [性质]: [组件] 账户树单项 (递归组件)
 * [Input]: Account Node
 * [Output]: Tree Item UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, Wallet, CreditCard, PiggyBank, TrendingUp, Banknote, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AccountWithBalance } from "@/types/database";

interface AccountTreeItemProps {
    account: AccountWithBalance;
    level: number;
    selectedAccountId: string | null; // 改为传递选中的账户 ID
    expandedIds: Set<string>;
    onSelect: (account: AccountWithBalance) => void;
    onToggle: (id: string) => void;
}

// 根据账户获取图标（暂时简化，后续支持自定义）
const getAccountIcon = (account: AccountWithBalance, isExpanded: boolean) => {
    if (account.is_group) {
        return isExpanded ? FolderOpen : Folder;
    }

    // 信用卡特殊处理
    if (account.credit_limit && account.credit_limit > 0) {
        return CreditCard;
    }

    // 根据类型返回默认图标
    if (account.type === 'liability') {
        return CreditCard;
    }

    return Wallet;
};

// 根据账户类型获取颜色
const getAccountColor = (account: AccountWithBalance) => {
    if (account.type === 'asset') return 'text-emerald-600';
    if (account.type === 'liability') return 'text-rose-600';
    return 'text-gray-600';
};

export function AccountTreeItem({
    account,
    level,
    selectedAccountId,
    expandedIds,
    onSelect,
    onToggle,
}: AccountTreeItemProps) {
    const hasChildren = account.children && account.children.length > 0;
    const isExpanded = expandedIds.has(account.id);
    const isSelected = account.id === selectedAccountId; // 自行判断是否选中
    const Icon = getAccountIcon(account, isExpanded);
    const colorClass = getAccountColor(account);

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(account);
    };

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasChildren) {
            onToggle(account.id);
        }
    };

    // 格式化余额显示
    const formatBalance = (balance: number, currency?: string | null) => {
        if (account.is_group) return null;
        const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : currency === 'HKD' ? 'HK$' : '';
        return `${symbol}${balance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
    };

    return (
        <div>
            {/* 节点行 */}
            <div
                className={cn(
                    "flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer transition-colors",
                    "hover:bg-gray-100",
                    isSelected && "bg-blue-50 hover:bg-blue-100",
                    !account.is_active && "opacity-50"
                )}
                style={{ paddingLeft: `${level * 16 + 8}px` }}
                onClick={handleClick}
            >
                {/* 展开/折叠按钮 */}
                <button
                    className={cn(
                        "w-4 h-4 flex items-center justify-center rounded hover:bg-gray-200 transition-colors",
                        !hasChildren && "invisible"
                    )}
                    onClick={handleToggle}
                >
                    {hasChildren && (
                        isExpanded ? (
                            <ChevronDown className="w-3 h-3 text-gray-500" />
                        ) : (
                            <ChevronRight className="w-3 h-3 text-gray-500" />
                        )
                    )}
                </button>

                {/* 图标 */}
                <Icon className={cn("w-4 h-4 flex-shrink-0", colorClass)} />

                {/* 账户名 */}
                <span className={cn(
                    "flex-1 text-sm truncate",
                    isSelected ? "font-medium text-gray-900" : "text-gray-700",
                    account.is_group && "font-medium"
                )}>
                    {account.name}
                </span>

                {/* 停用标志 */}
                {!account.is_active && (
                    <span className="text-[9px] px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded uppercase tracking-tight">
                        已停用
                    </span>
                )}

                {/* 余额（仅叶子节点显示） */}
                {!account.is_group && account.is_active && (
                    <span className={cn(
                        "text-xs font-mono tabular-nums",
                        (account.balance || 0) >= 0 ? "text-gray-500" : "text-rose-500"
                    )}>
                        {formatBalance(account.balance || 0, account.currency)}
                    </span>
                )}
            </div>

            {/* 子节点 - 传递 selectedAccountId 而非 isSelected */}
            {hasChildren && isExpanded && (
                <div>
                    {account.children!.map(child => (
                        <AccountTreeItem
                            key={child.id}
                            account={child}
                            level={level + 1}
                            selectedAccountId={selectedAccountId}
                            expandedIds={expandedIds}
                            onSelect={onSelect}
                            onToggle={onToggle}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

