/**
 * [性质]: [组件] 账户详情页头部 (名称/余额/操作栏)
 * [Input]: Account Data
 * [Output]: Header UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { Edit, MoreVertical, Scale, Power, Trash2, GitMerge, Wallet, CreditCard, PiggyBank, TrendingUp, Banknote, Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AccountWithBalance } from "@/types/database";
import { cn } from "@/lib/utils";

interface AccountHeaderProps {
    account: AccountWithBalance;
    onEdit: () => void;
    onCalibrate: () => void;
    onDeactivate: () => void;
    onDelete: () => void;
    onMerge: () => void;
    onAddCurrencySubAccount?: () => void; // 添加币种户头（仅叶子账户可用）
}

// 账户类型标签
const SUBTYPE_LABELS: Record<string, string> = {
    cash: '现金',
    checking: '活期账户',
    savings: '储蓄账户',
    investment: '投资账户',
    receivable: '应收款',
    credit_card: '信用卡',
    loan: '贷款',
    payable: '应付款',
};

// 根据 subtype 获取图标
const getAccountIcon = (subtype?: string | null) => {
    const iconMap: Record<string, React.ElementType> = {
        cash: Banknote,
        checking: Building2,
        savings: PiggyBank,
        investment: TrendingUp,
        credit_card: CreditCard,
        loan: Building2,
        receivable: Wallet,
        payable: Wallet,
    };
    return iconMap[subtype || ''] || Wallet;
};

// 格式化金额
const formatAmount = (amount: number, currency?: string | null) => {
    const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : currency === 'HKD' ? 'HK$' : '';
    return `${symbol}${Math.abs(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
};

export function AccountHeader({
    account,
    onEdit,
    onCalibrate,
    onDeactivate,
    onDelete,
    onMerge,
    onAddCurrencySubAccount,
}: AccountHeaderProps) {
    const Icon = getAccountIcon(account.subtype);
    const balance = account.balance || 0;
    const isNegative = balance < 0;

    // 信用卡特殊显示（通过 credit_limit 判断）
    const isCreditCard = (account.credit_limit || 0) > 0;
    const creditLimit = account.credit_limit || 0;
    const availableCredit = creditLimit - Math.abs(balance);

    return (
        <div className="p-6">
            {/* 顶部信息行 */}
            <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                    {/* 图标 */}
                    <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center",
                        account.type === 'asset' ? "bg-emerald-100" : "bg-rose-100"
                    )}>
                        <Icon className={cn(
                            "w-6 h-6",
                            account.type === 'asset' ? "text-emerald-600" : "text-rose-600"
                        )} />
                    </div>

                    {/* 名称和类型 */}
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900">{account.name}</h2>
                        <p className="text-sm text-gray-500">
                            {SUBTYPE_LABELS[account.subtype || ''] || '账户'}
                            {account.currency && <span className="ml-2 text-gray-400">({account.currency})</span>}
                        </p>
                    </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={onEdit}>
                        <Edit className="w-4 h-4 mr-1" />
                        编辑
                    </Button>
                    <Button variant="outline" size="sm" onClick={onCalibrate}>
                        <Scale className="w-4 h-4 mr-1" />
                        校准
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" className="h-8 w-8">
                                <MoreVertical className="w-4 h-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>更多操作</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {/* 添加币种户头（仅叶子账户显示） */}
                            {!account.is_group && onAddCurrencySubAccount && (
                                <>
                                    <DropdownMenuItem onClick={onAddCurrencySubAccount}>
                                        <Plus className="w-4 h-4 mr-2" />
                                        添加币种户头
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                </>
                            )}
                            <DropdownMenuItem onClick={onMerge}>
                                <GitMerge className="w-4 h-4 mr-2" />
                                合并到其他账户
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onDeactivate}>
                                <Power className="w-4 h-4 mr-2" />
                                {account.is_active ? '停用账户' : '启用账户'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
                                <Trash2 className="w-4 h-4 mr-2" />
                                删除账户
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* 余额信息行 */}
            <div className="grid grid-cols-2 gap-6">
                {/* 当前余额 */}
                <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-sm text-gray-500 mb-1">当前余额</p>
                    <p className={cn(
                        "text-2xl font-semibold tabular-nums",
                        isNegative ? "text-rose-600" : "text-gray-900"
                    )}>
                        {isNegative && '-'}{formatAmount(balance, account.currency)}
                    </p>
                </div>

                {/* 信用卡：显示可用额度 */}
                {isCreditCard && creditLimit > 0 && (
                    <div className="bg-gray-50 rounded-xl p-4">
                        <p className="text-sm text-gray-500 mb-1">可用额度</p>
                        <p className="text-2xl font-semibold tabular-nums text-gray-900">
                            {formatAmount(availableCredit, account.currency)}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                            总额度 {formatAmount(creditLimit, account.currency)}
                        </p>
                    </div>
                )}

                {/* 信用卡：显示账单日/还款日 */}
                {isCreditCard && (account.statement_day || account.due_day) && (
                    <div className="bg-gray-50 rounded-xl p-4 col-span-2">
                        <div className="flex gap-8">
                            {account.statement_day && (
                                <div>
                                    <p className="text-sm text-gray-500">账单日</p>
                                    <p className="text-lg font-medium">每月 {account.statement_day} 日</p>
                                </div>
                            )}
                            {account.due_day && (
                                <div>
                                    <p className="text-sm text-gray-500">还款日</p>
                                    <p className="text-lg font-medium">每月 {account.due_day} 日</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
