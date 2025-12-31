import * as React from 'react';
import { Wallet, CreditCard, Banknote, TrendingUp, Calendar, Activity } from 'lucide-react';
import { ACCOUNTS_TYPES, AccountType } from '@/lib/constants';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface AccountCardProps {
    account: {
        id: string;
        name: string;
        type: string; // ✅ 改为string以匹配后端数据
        currency: string;
        balance: number;
        created_at?: string;
        last_snapshot_date?: string;
        transaction_count?: number;
    };
}

const TYPE_ICONS = {
    Checking: Banknote,
    Credit: CreditCard,
    Asset: TrendingUp,
    Wallet: Wallet,
};

const TYPE_COLORS = {
    Checking: 'text-blue-600 bg-blue-50',
    Credit: 'text-purple-600 bg-purple-50',
    Asset: 'text-green-600 bg-green-50',
    Wallet: 'text-orange-600 bg-orange-50',
};

export function AccountCard({ account }: AccountCardProps) {
    const Icon = TYPE_ICONS[account.type as AccountType] || Wallet;
    const colorClass = TYPE_COLORS[account.type as AccountType] || 'text-gray-600 bg-gray-50';

    // ✅ 防御性检查：确保currency有效
    const validCurrency = account.currency && account.currency.length === 3 ? account.currency : 'CNY';
    if (!account.currency || account.currency.length !== 3) {
        console.warn(`Invalid currency for account "${account.name}": "${account.currency}", using CNY as fallback`);
    }

    // Format balance with currency
    const formattedBalance = new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency: validCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(account.balance);

    // 计算余额颜色
    const balanceColor = account.balance >= 0
        ? 'text-gray-900'
        : 'text-red-600';

    // Format last snapshot date
    const lastSnapshotText = account.last_snapshot_date
        ? formatDistanceToNow(new Date(account.last_snapshot_date), {
            addSuffix: true,
            locale: zhCN,
        })
        : '从未校准';

    return (
        <div className="relative rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md h-full flex flex-col">
            {/* Header: Icon + Name + Type */}
            <div className="flex items-start gap-3 mb-4">
                <div className={`rounded-lg p-2.5 ${colorClass}`}>
                    <Icon size={20} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg text-gray-900 truncate leading-tight">
                        {account.name}
                    </h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {ACCOUNTS_TYPES[account.type as AccountType]}
                    </p>
                </div>
            </div>

            {/* Balance */}
            <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">当前估算余额</p>
                <p className={`text-2xl font-bold tracking-tight ${balanceColor}`}>
                    {formattedBalance}
                </p>
            </div>

            {/* Metadata */}
            <div className="mt-auto space-y-2 pt-4 border-t border-gray-100">
                {/* Last Snapshot */}
                <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Calendar size={14} className="flex-shrink-0" />
                    <span className="truncate">
                        最近校准：{lastSnapshotText}
                    </span>
                </div>

                {/* Transaction Count (if available) */}
                {account.transaction_count !== undefined && (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Activity size={14} className="flex-shrink-0" />
                        <span>
                            {account.transaction_count} 笔流水
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
