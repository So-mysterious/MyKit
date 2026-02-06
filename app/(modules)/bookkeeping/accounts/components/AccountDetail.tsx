/**
 * [性质]: [组件] 账户详情视图 (图表/指标/流水)
 * [Input]: Account Data
 * [Output]: Detail UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { AccountWithBalance } from "@/types/database";
import { AccountHeader } from "./AccountHeader";
import { Wallet, Plus, Edit, Power, Calendar, Globe, Clock, RefreshCw, Landmark, ArrowUpRight, ArrowDownRight, History, PieChart as PieChartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBookkeepingCache } from "@/lib/bookkeeping/cache/BookkeepingCacheProvider";
import { getAccountDetailAction, getTransactions } from "@/lib/bookkeeping/actions";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { BalanceChart } from "@/components/bookkeeping/charts/BalanceChart";
import { Heatmap } from "@/components/bookkeeping/charts/Heatmap";
import { LifeRecipe } from "@/components/bookkeeping/charts/LifeRecipe";
import { TransactionTableCompact } from "./TransactionTableCompact";
import { formatAmount } from "@/lib/bookkeeping/useSettings";
import { useBookkeepingSettings } from "@/lib/bookkeeping/useSettings";
import { TransactionWithAccounts } from "@/types/database";
import { useBookkeepingColors } from "@/lib/bookkeeping/useColors";
import { cn } from "@/lib/utils";

interface AccountDetailProps {
    account: AccountWithBalance | null;
    onEdit: () => void;
    onCalibrate: () => void;
    onDeactivate: () => void;
    onDelete: () => void;
    onMerge: () => void;
    onAddCurrencySubAccount?: () => void;
    isConvertedGroup?: boolean;
}

export function AccountDetail({
    account,
    onEdit,
    onCalibrate,
    onDeactivate,
    onDelete,
    onMerge,
    onAddCurrencySubAccount,
    isConvertedGroup = false,
}: AccountDetailProps) {
    const cache = useBookkeepingCache();
    const { settings } = useBookkeepingSettings();
    const { colors } = useBookkeepingColors();

    const [detailData, setDetailData] = React.useState<any>(null);
    const [balanceHistory, setBalanceHistory] = React.useState<any[]>([]);
    const [balanceHistoryCurrency, setBalanceHistoryCurrency] = React.useState<string>('CNY');
    const [recentTransactions, setRecentTransactions] = React.useState<TransactionWithAccounts[]>([]);
    const [dashboardTxs, setDashboardTxs] = React.useState<any[]>([]); // for LifeRecipe
    const [loading, setLoading] = React.useState(false);

    // 加载增强详情数据
    React.useEffect(() => {
        if (!account) return;

        const loadData = async () => {
            setLoading(true);
            try {
                const [detail, balanceResult, txs, dTxs] = await Promise.all([
                    getAccountDetailAction(account.id),
                    cache.getBalanceHistory(account.id, 90), // 近三个自然月
                    getTransactions({
                        accountId: account.id,
                        limit: 50,
                        startDate: format(new Date(new Date().getTime() - 90 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"), // 近三个月
                    }),
                    cache.getDashboardTransactions() // for LifeRecipe
                ]);
                setDetailData(detail);
                setBalanceHistory(balanceResult.history);
                setBalanceHistoryCurrency(balanceResult.currency);
                setRecentTransactions(txs.transactions);
                setDashboardTxs(dTxs);
            } catch (error) {
                console.error("Failed to load account details:", error);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [account]); // ✅ 不再依赖 cache，因为 cacheProvider 已优化且 account 改变才需要重新加载

    // 未选中账户时显示占位符
    if (!account) {
        return (
            <div className="flex-1 flex items-center justify-center bg-gray-50/50">
                <div className="text-center text-gray-400">
                    <Wallet className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">选择一个账户查看详情</p>
                </div>
            </div>
        );
    }

    // 分组账户处理类似页面的布局，但加入汇总统计图
    if (account.is_group) {
        const childCount = account.children?.length || 0;
        const totalBalance = account.balance || 0;

        return (
            <div className="flex-1 overflow-y-auto">
                <div className="p-6 border-b border-gray-100">
                    <div className="flex items-start justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                                <Wallet className="w-6 h-6 text-gray-500" />
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900">{account.name}</h2>
                                <p className="text-sm text-gray-500">
                                    {isConvertedGroup ? '多币种账户' : '分组'} · 包含 {childCount} 个{isConvertedGroup ? '币种户头' : '子账户'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {isConvertedGroup && onAddCurrencySubAccount && (
                                <Button variant="outline" size="sm" onClick={onAddCurrencySubAccount}>
                                    <Plus className="w-4 h-4 mr-1" />
                                    添加币种
                                </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={onEdit}>
                                <Edit className="w-4 h-4 mr-1" />
                                编辑
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 md:col-span-1">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">汇总余额 (CNY)</p>
                            <p className="text-2xl font-bold tabular-nums text-gray-900">
                                ¥{totalBalance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                        <div className="md:col-span-2">
                            <BalanceChart data={balanceHistory} currency="CNY" height={100} />
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    <h3 className="text-sm font-medium text-gray-500 mb-4 flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        {isConvertedGroup ? '分币种余额' : '子账户列表'}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {account.children?.map(child => (
                            <div
                                key={child.id}
                                className="p-4 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-default group"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-sm font-medium text-gray-700">{child.name}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-mono uppercase">
                                        {child.currency}
                                    </span>
                                </div>
                                <p className="text-lg font-bold font-mono text-gray-900">
                                    {child.currency === 'USD' ? '$' : child.currency === 'CNY' ? '¥' : 'HK$'}
                                    {(child.balance || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-white custom-scrollbar">
            {/* 账户头部 & 操作 */}
            <AccountHeader
                account={account}
                onEdit={onEdit}
                onCalibrate={onCalibrate}
                onDeactivate={onDeactivate}
                onDelete={onDelete}
                onMerge={onMerge}
                onAddCurrencySubAccount={onAddCurrencySubAccount}
            />

            <div className="px-6 space-y-8 pb-10">
                {/* 1. 核心详情指标 */}
                <section>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Landmark className="w-3.5 h-3.5" />
                        账户指标
                    </h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Row 1: 账户状态 */}
                        <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1 flex items-center gap-1.5">
                                <Power className="w-3 h-3" /> 账户状态
                            </p>
                            <p className={cn(
                                "text-sm font-medium",
                                account.is_active ? "text-emerald-600" : "text-gray-400"
                            )}>
                                {account.is_active ? '已启用' : '已停用'}
                            </p>
                        </div>
                        {/* Row 1: 创建时间 */}
                        <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1 flex items-center gap-1.5">
                                <Calendar className="w-3 h-3" /> 创建时间
                            </p>
                            <p className="text-sm font-medium text-gray-700">
                                {account.created_at ? format(parseISO(account.created_at), "yyyy-MM-dd") : '-'}
                            </p>
                        </div>
                        {/* Row 1: 上次校准时间 */}
                        <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1 flex items-center gap-1.5">
                                <Clock className="w-3 h-3" /> 上次校准
                            </p>
                            <p className="text-sm font-medium text-gray-700 truncate">
                                {detailData?.lastSnapshot ? format(parseISO(detailData.lastSnapshot.date), "yyyy-MM-dd HH:mm") : '从未校准'}
                            </p>
                        </div>
                        {/* Row 1: 上次校准余额 */}
                        <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1 flex items-center gap-1.5">
                                <Landmark className="w-3 h-3" /> 校准余额
                            </p>
                            <p className="text-sm font-medium text-gray-700">
                                {detailData?.lastSnapshot
                                    ? formatAmount(detailData.lastSnapshot.balance, settings)
                                    : '-'}
                            </p>
                        </div>
                        {/* Row 2: 上次快照时间 */}
                        <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1 flex items-center gap-1.5">
                                <Clock className="w-3 h-3" /> 上次快照
                            </p>
                            <p className="text-sm font-medium text-gray-700 truncate">
                                {detailData?.lastSnapshot ? format(parseISO(detailData.lastSnapshot.date), "yyyy-MM-dd HH:mm") : '暂无快照'}
                            </p>
                        </div>
                        {/* Row 2: 资产类型 */}
                        <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1 flex items-center gap-1.5">
                                <Wallet className="w-3 h-3" /> 资产类型
                            </p>
                            <p className="text-sm font-medium text-gray-700">
                                {account.type === 'asset' ? '资产' : account.type === 'liability' ? '负债' : account.type === 'expense' ? '支出' : account.type === 'income' ? '收入' : account.type}
                                {account.subtype === 'credit_card' && ' (信用卡)'}
                            </p>
                        </div>
                        {/* Row 2: 近一月流水量 */}
                        <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1 flex items-center gap-1.5">
                                <History className="w-3 h-3" /> 近一月流水量
                            </p>
                            <p className="text-sm font-medium text-gray-700">
                                {detailData?.stats30d?.txCount || 0} 笔
                            </p>
                        </div>
                        {/* Row 2: 近一月净流水 */}
                        <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100">
                            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1 flex items-center gap-1.5">
                                <RefreshCw className="w-3 h-3" /> 近一月净流水
                            </p>
                            <p className={cn(
                                "text-sm font-bold flex items-center gap-1",
                                (detailData?.stats30d?.netFlow || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                            )}>
                                {(detailData?.stats30d?.netFlow || 0) >= 0 ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                                {formatAmount(detailData?.stats30d?.netFlow || 0, settings)}
                            </p>
                        </div>
                    </div>
                </section>

                {/* 2. 统计图表 */}
                <section className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    {/* 余额趋势 */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <History className="w-3.5 h-3.5" />
                            余额趋势 (近90天)
                        </h3>
                        <div className="bg-white rounded-2xl border border-gray-100 p-2 h-[480px] flex items-center justify-center">
                            {loading ? (
                                <div className="animate-pulse bg-gray-50 w-full h-full rounded-xl" />
                            ) : (
                                <BalanceChart data={balanceHistory} currency={balanceHistoryCurrency} height={460} />
                            )}
                        </div>
                    </div>

                    {/* 收支构成 */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <PieChartIcon className="w-3.5 h-3.5" />
                            收支分布 (近90天)
                        </h3>
                        <LifeRecipe
                            transactions={dashboardTxs}
                            height={480}
                            initialRange={{ start: format(new Date(new Date().getTime() - 90 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"), end: format(new Date(), "yyyy-MM-dd") }}
                            filterAccountId={account.id}
                            hideTitle
                        />
                    </div>

                    {/* 活动热力图 */}
                    <div className="xl:col-span-2 space-y-4">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5" />
                            交易频次
                        </h3>
                        <Heatmap filterAccountId={account.id} hideLegend />
                    </div>
                </section>

                {/* 3. 相关流水 */}
                <section className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <History className="w-3.5 h-3.5" />
                        近期流水记录 (近三个月)
                    </h3>
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        <TransactionTableCompact
                            transactions={recentTransactions}
                            displaySettings={settings}
                        />
                        {recentTransactions.length >= 50 && (
                            <div className="p-3 text-center border-t border-gray-50 bg-gray-50/30">
                                <p className="text-[10px] text-gray-400">仅显示最近 50 笔交易</p>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
