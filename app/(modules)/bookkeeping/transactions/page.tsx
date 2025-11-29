"use client";

import * as React from "react";
import { useInView } from "react-intersection-observer";
import { getTransactions, TransactionFilter, getAccountsWithBalance, getAvailableTags } from "@/lib/bookkeeping/actions";
import { TransactionItem } from "@/components/TransactionItem";
import { Loader2, Filter, Wallet, ArrowUpCircle, ArrowDownCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransactionModal } from "@/components/TransactionModal";
import { cn } from "@/lib/utils";
import { format, parseISO, subDays, subMonths } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useBookkeepingColors, BookkeepingColors } from "@/lib/bookkeeping/useColors";
import { useBookkeepingSettings, formatAmount } from "@/lib/bookkeeping/useSettings";

// ... (mergeTransfers remains exactly the same) ...
function mergeTransfers(rawTransactions: any[]) {
    const merged: any[] = [];
    const processedIds = new Set();
    const transferMap = new Map();

    rawTransactions.forEach(tx => {
        if (tx.type === 'transfer' && tx.transfer_group_id) {
            if (!transferMap.has(tx.transfer_group_id)) {
                transferMap.set(tx.transfer_group_id, []);
            }
            transferMap.get(tx.transfer_group_id).push(tx);
        }
    });

    for (const tx of rawTransactions) {
        if (processedIds.has(tx.id)) continue;

        if (tx.type === 'transfer' && tx.transfer_group_id) {
            const group = transferMap.get(tx.transfer_group_id);

            if (group && group.length === 2) {
                const source = group.find((t: any) => t.amount < 0);
                const target = group.find((t: any) => t.amount > 0);

                if (source && target) {
                    if (tx.id === source.id) {
                        merged.push({ ...source, relatedTransfer: target });
                        processedIds.add(source.id);
                        processedIds.add(target.id);
                    } else if (tx.id === target.id) {
                        const sourceInPage = group.some((t: any) => t.id === source.id);
                        if (!sourceInPage) {
                            merged.push(tx);
                            processedIds.add(tx.id);
                        }
                    }
                } else {
                    merged.push(tx);
                    processedIds.add(tx.id);
                }
            } else {
                merged.push(tx);
                processedIds.add(tx.id);
            }
        } else {
            merged.push(tx);
            processedIds.add(tx.id);
        }
    }
    return merged;
}

const AMOUNT_RANGES = [
    { label: "0 - 100", min: 0, max: 100 },
    { label: "100 - 500", min: 100, max: 500 },
    { label: "500 - 2000", min: 500, max: 2000 },
    { label: "2000+", min: 2000, max: undefined },
];

const TYPE_OPTIONS = [
    { label: "全部", value: "all" },
    { label: "支出", value: "expense" },
    { label: "收入", value: "income" },
    { label: "划转", value: "transfer" },
] as const;

const TIME_PRESET_OPTIONS: Record<DatePreset, string> = {
    all: "全部",
    "3d": "近三天",
    week: "近一周",
    month: "近一月",
};

const TIME_PRESET_ORDER: DatePreset[] = ["all", "3d", "week", "month"];

const TIME_LABEL_TO_PRESET = Object.entries(TIME_PRESET_OPTIONS).reduce<Record<string, DatePreset>>((acc, [key, label]) => {
    acc[label] = key as DatePreset;
    return acc;
}, {});

interface TimeRangeSelectorProps {
    label?: string;
    options: string[];
    selectedValues: string[];
    onChange: (values: string[], triggeredOption?: string) => void;
    className?: string;
}

const isAllOption = (option: string) => option === 'ALL' || option.includes('全部');

const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({
    label,
    options,
    selectedValues,
    onChange,
    className,
}) => {
    const toggleSelection = (option: string) => {
        if (isAllOption(option)) {
            onChange([], option);
            return;
        }

        if (selectedValues.includes(option)) {
            onChange(selectedValues.filter((v) => v !== option), option);
        } else {
            onChange([...selectedValues, option], option);
        }
    };

    return (
        <div className={cn("flex w-full items-center bg-gray-100 p-1 rounded-lg select-none shadow-sm border border-gray-200/50", className)}>
            {label && (
                <div className="px-3 py-1 text-sm font-semibold text-gray-400 border-r border-gray-300/50 mr-1 whitespace-nowrap">
                    {label}
                </div>
            )}

            <div className="flex items-center overflow-x-auto">
                {options.map((option, index) => {
                    const isSelected = selectedValues.includes(option);
                    const nextOption = options[index + 1];
                    const nextIsSelected = nextOption ? selectedValues.includes(nextOption) : false;
                    const isLast = index === options.length - 1;
                    const hideDivider = isSelected || nextIsSelected;

                    return (
                        <React.Fragment key={option}>
                            <button
                                type="button"
                                onClick={() => toggleSelection(option)}
                                className={`relative px-4 py-1 text-sm font-medium rounded-md transition-colors duration-200 ease-out whitespace-nowrap ${
                                    isSelected
                                        ? 'text-white shadow-sm z-10'
                                        : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                                }`}
                                style={
                                    isSelected
                                        ? { backgroundColor: '#2563eb', color: '#fff' }
                                        : undefined
                                }
                            >
                                {option}
                            </button>
                            
                            {!isLast && (
                                <div
                                    className={`w-px h-3 mx-0.5 transition-opacity duration-200 ${hideDivider ? 'opacity-0' : 'bg-gray-300'}`}
                                />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

type DatePreset = "all" | "3d" | "week" | "month";

export default function TransactionsPage() {
    const [transactions, setTransactions] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [page, setPage] = React.useState(0);
    const [hasMore, setHasMore] = React.useState(true);

    // Filter State
    const [showFilters, setShowFilters] = React.useState(false);
    const [filters, setFilters] = React.useState<TransactionFilter>({});
    const [datePreset, setDatePreset] = React.useState<DatePreset>("all");

    // Dynamic Data
    const [accounts, setAccounts] = React.useState<any[]>([]);
    const [availableTags, setAvailableTags] = React.useState<{ kind: string; name: string }[]>([]);

    // 全局颜色配置
    const { colors } = useBookkeepingColors();
    // 全局显示设置
    const { settings: displaySettings } = useBookkeepingSettings();

    const { ref, inView } = useInView();

    // Load Initial Data
    React.useEffect(() => {
        Promise.all([
            getAccountsWithBalance(),
            getAvailableTags()
        ]).then(([accData, tagData]) => {
            setAccounts(accData as any);
            setAvailableTags(tagData);
        }).catch(console.error);
    }, []);

    const loadTransactions = async (isRefresh = false) => {
        if (isRefresh) {
            setLoading(true);
            setPage(0);
            setTransactions([]);
            setHasMore(true);
        }

        try {
            const currentPage = isRefresh ? 0 : page;
            const newTx = await getTransactions({ page: currentPage, filters });

            if (newTx.length === 0) {
                setHasMore(false);
            } else {
                setTransactions(prev => isRefresh ? newTx : [...prev, ...newTx]);
                setPage(currentPage + 1);
            }
        } catch (error) {
            console.error("Failed to load transactions", error);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        loadTransactions(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);

    React.useEffect(() => {
        if (inView && hasMore && !loading) {
            loadTransactions();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inView]);

    const handleAmountRangeChange = (label: string) => {
        if (label === 'all') {
            setFilters(prev => {
                const { minAmount, maxAmount, ...rest } = prev;
                return rest;
            });
            return;
        }
        const range = AMOUNT_RANGES.find(r => r.label === label);
        if (range) {
            setFilters(prev => ({ ...prev, minAmount: range.min, maxAmount: range.max }));
        }
    };

    const handleQuickDate = (range: Exclude<DatePreset, "all">) => {
        const now = new Date();
        let start = now;

        switch (range) {
            case '3d': start = subDays(now, 3); break;
            case 'week': start = subDays(now, 7); break;
            case 'month': start = subMonths(now, 1); break;
        }

        setFilters(prev => ({
            ...prev,
            startDate: format(start, 'yyyy-MM-dd'),
            endDate: format(now, 'yyyy-MM-dd')
        }));
        setDatePreset(range);
    };

    const handleDateAll = () => {
        setFilters(prev => {
            const { startDate, endDate, ...rest } = prev;
            return rest;
        });
        setDatePreset("all");
    };

    const handleClearFilters = () => {
        setFilters({});
        setDatePreset("all");
    };

    const currentAccountIds = React.useMemo(() => {
        if (!filters.accountId) return [] as string[];
        return Array.isArray(filters.accountId) ? filters.accountId : [filters.accountId];
    }, [filters.accountId]);

    const currentCategories = React.useMemo(() => {
        if (!filters.category) return [] as string[];
        return Array.isArray(filters.category) ? filters.category : [filters.category];
    }, [filters.category]);

    const typeSelectedLabels = React.useMemo(() => {
        if (filters.type) {
            const match = TYPE_OPTIONS.find(opt => opt.value === filters.type);
            if (match) return [match.label];
        }
        return ["全部"];
    }, [filters.type]);

    const amountSelectedLabels = React.useMemo(() => {
        if (typeof filters.minAmount === 'number' || typeof filters.maxAmount === 'number') {
            const match = AMOUNT_RANGES.find(r => r.min === filters.minAmount && r.max === filters.maxAmount);
            if (match) return [match.label];
        }
        return ["不限"];
    }, [filters.minAmount, filters.maxAmount]);

    const timeSelectedLabels = React.useMemo(() => [TIME_PRESET_OPTIONS[datePreset]], [datePreset]);

    const accountIdToName = React.useMemo(() => {
        const map = new Map<string, string>();
        accounts.forEach(acc => map.set(acc.id, acc.name));
        return map;
    }, [accounts]);

    const accountSelectedLabels = React.useMemo(() => {
        if (currentAccountIds.length === 0) return ["全部账户"];
        return currentAccountIds.map(id => accountIdToName.get(id)).filter(Boolean) as string[];
    }, [currentAccountIds, accountIdToName]);

    const tagSelectedLabels = React.useCallback(
        (groupItems: readonly string[]) => currentCategories.filter(cat => groupItems.includes(cat)),
        [currentCategories]
    );

    const handleTypeSelectorChange = (labels: string[], option?: string) => {
        if (labels.length === 0 || (option && isAllOption(option))) {
            setFilters(prev => {
                const { type, ...rest } = prev;
                return rest;
            });
            return;
        }
        const latest = labels[labels.length - 1];
        const matchedOption = TYPE_OPTIONS.find(opt => opt.label === latest);
        if (!matchedOption || matchedOption.value === 'all') {
            setFilters(prev => {
                const { type, ...rest } = prev;
                return rest;
            });
            return;
        }
        setFilters(prev => ({ ...prev, type: matchedOption.value }));
    };

    const handleAmountSelectorChange = (labels: string[], option?: string) => {
        if (labels.length === 0 || (option && (option === "不限" || isAllOption(option)))) {
            handleAmountRangeChange('all');
            return;
        }
        handleAmountRangeChange(labels[labels.length - 1]);
    };

    const handleTimeSelectorChange = (labels: string[], option?: string) => {
        if (labels.length === 0 || (option && isAllOption(option))) {
            handleDateAll();
            return;
        }
        const latest = labels[labels.length - 1];
        const preset = TIME_LABEL_TO_PRESET[latest];
        if (!preset || preset === 'all') {
            handleDateAll();
            return;
        }
        handleQuickDate(preset as Exclude<DatePreset, "all">);
    };

    const handleAccountSelectorChange = (labels: string[], option?: string) => {
        if (labels.length === 0 || (option && isAllOption(option))) {
            setFilters(prev => {
                const { accountId, ...rest } = prev;
                return rest;
            });
            return;
        }

        const nameToId = new Map(Array.from(accountIdToName.entries()).map(([id, name]) => [name, id]));
        const ids = labels.map(label => nameToId.get(label)).filter(Boolean) as string[];

        setFilters(prev => ({ ...prev, accountId: ids.length ? ids : undefined }));
    };

    const handleTagGroupChange = (groupItems: readonly string[]) => (labels: string[], option?: string) => {
        if (labels.length === 0 || (option && isAllOption(option))) {
            setFilters(prev => {
                const prevArray = Array.isArray(prev.category) ? prev.category : prev.category ? [prev.category] : [];
                const remaining = option && isAllOption(option) ? [] : prevArray.filter(cat => !groupItems.includes(cat));
                const next = remaining.length ? remaining : undefined;
                return { ...prev, category: next };
            });
            return;
        }

        setFilters(prev => {
            const prevArray = Array.isArray(prev.category) ? prev.category : prev.category ? [prev.category] : [];
            const filtered = prevArray.filter(cat => !groupItems.includes(cat));
            const next = [...filtered, ...labels];
            return { ...prev, category: next.length ? next : undefined };
        });
    };

    // Prepare Dynamic Tag Groups
    const tagGroups = React.useMemo(() => {
        const dbTags = availableTags;
        // Group by Kind
        const groups: Record<string, string[]> = { expense: [], income: [], transfer: [] };
        
        // Only show available tags from DB
        dbTags.forEach((t: any) => {
            if (groups[t.kind]) {
                groups[t.kind].push(t.name);
            }
        });

        return [
            { label: "支出", items: groups.expense.sort() },
            { label: "收入", items: groups.income.sort() },
            { label: "划转", items: groups.transfer.sort() },
        ];
    }, [availableTags]);

    const mergedTransactions = React.useMemo(() => mergeTransfers(transactions), [transactions]);

    // Grouping Logic
    const groupedTransactions = React.useMemo(() => {
        const groups: Record<string, { date: string; items: any[]; income: number; expense: number }> = {};

        mergedTransactions.forEach((tx: any) => {
            const dateKey = tx.date.split('T')[0]; // YYYY-MM-DD
            if (!groups[dateKey]) {
                groups[dateKey] = { date: dateKey, items: [], income: 0, expense: 0 };
            }
            groups[dateKey].items.push(tx);

            if (tx.type === 'income') {
                groups[dateKey].income += tx.amount;
            } else if (tx.type === 'expense') {
                groups[dateKey].expense += Math.abs(tx.amount); // Expense is negative, make absolute for display
            }
        });

        return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
    }, [mergedTransactions]);

    // Summary Stats
    const stats = React.useMemo(() => {
        const merged = mergedTransactions;
        const totalCount = merged.length;
        const totalIncome = merged.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0);
        const totalExpense = merged.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Math.abs(t.amount), 0);

        return {
            count: totalCount,
            income: totalIncome,
            expense: totalExpense
        };
    }, [mergedTransactions]);

    const formatGroupDate = (dateStr: string) => {
        const date = parseISO(dateStr);
        return format(date, "M月d日 EEE", { locale: zhCN });
    };

    return (
        <div className="h-full flex flex-col -m-6 bg-white">
            {/* Header & Filters */}
            <div className="flex flex-col gap-4 px-6 pt-6 pb-4 border-b border-gray-100 bg-white">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Transactions</p>
                            <h1 className="text-2xl font-bold tracking-tight">流水明细</h1>
                            <p className="text-sm text-gray-500">查看和管理所有收支记录。</p>
                        </div>

                        {/* Top Summary Stats - 简洁风格，无背景框 */}
                        <div className="flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-1.5 text-gray-500">
                                <Wallet size={14} />
                                <span>共 {stats.count} 笔</span>
                            </div>
                            {(stats.income > 0 || stats.expense > 0) && (
                                <>
                                    <div className="flex items-center gap-1.5" style={{ color: colors.income }}>
                                        <ArrowDownCircle size={14} />
                                        <span>收入 ¥{formatAmount(stats.income, displaySettings)}</span>
                                    </div>
                                    
                                    <div className="flex items-center gap-1.5" style={{ color: colors.expense }}>
                                        <ArrowUpCircle size={14} />
                                        <span>支出 ¥{formatAmount(stats.expense, displaySettings)}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleClearFilters}
                            className="gap-1 text-xs"
                        >
                            <XCircle className="w-4 h-4" />
                            清空筛选
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowFilters(!showFilters)}
                            className={cn("gap-2 text-xs", showFilters && "bg-gray-900 text-white border-gray-900 hover:bg-gray-900/90")}
                        >
                            <Filter size={16} />
                            筛选
                        </Button>
                    </div>
                </div>

                {showFilters && (
                    <div className="flex flex-col gap-6 animate-in slide-in-from-top-2 pt-4 border-t border-gray-100 mt-4">
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-wrap gap-4">
                                <div className="w-full overflow-x-auto">
                                    <TimeRangeSelector
                                        label="交易"
                                        options={TYPE_OPTIONS.map(opt => opt.label)}
                                        selectedValues={typeSelectedLabels}
                                        onChange={handleTypeSelectorChange}
                                        className="w-full"
                                    />
                                </div>
                                <div className="w-full overflow-x-auto">
                                    <TimeRangeSelector
                                        label="金额"
                                        options={["不限", ...AMOUNT_RANGES.map(r => r.label)]}
                                        selectedValues={amountSelectedLabels}
                                        onChange={handleAmountSelectorChange}
                                        className="w-full"
                                    />
                                </div>
                                <div className="w-full overflow-x-auto">
                                    <TimeRangeSelector
                                        label="时间"
                                        options={TIME_PRESET_ORDER.map(key => TIME_PRESET_OPTIONS[key])}
                                        selectedValues={timeSelectedLabels}
                                        onChange={handleTimeSelectorChange}
                                        className="w-full"
                                    />
                                </div>
                            </div>

                            <div className="w-full overflow-x-auto">
                                <TimeRangeSelector
                                    label="选择账户"
                                    options={["全部账户", ...accounts.map(acc => acc.name)]}
                                    selectedValues={accountSelectedLabels}
                                    onChange={handleAccountSelectorChange}
                                    className="w-full"
                                />
                            </div>                        
                            
                            <div className="flex flex-col gap-3 w-full">
                                {tagGroups.map(group => (
                                    <div key={group.label} className="w-full overflow-x-auto">
                                        <TimeRangeSelector
                                        label={group.label}
                                        options={["全部标签", ...group.items]}
                                        selectedValues={tagSelectedLabels(group.items)}
                                        onChange={handleTagGroupChange(group.items)}
                                        className="w-full"
                                        />
                                    </div>
                                    ))}
                                </div>
                            </div>
                    </div>
                )}

                {/* Table Header */}
                <div
                    className="mt-4 pt-2 border-t border-gray-100 text-xs font-medium text-gray-500 grid"
                    style={{ gridTemplateColumns: '180px 100px 220px 80px minmax(200px, 1fr) 200px 40px' }}
                >
                    <div>分类</div>
                    <div className="px-2">标签</div>
                    <div className="px-2">备注</div>
                    <div className="px-2">时间</div>
                    <div className="px-2">账户</div>
                    <div className="px-2 text-right">金额</div>
                    <div></div>
                </div>
            </div>

            {/* List with Grouping */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <div className="overflow-y-auto flex-1 pb-20">
                    {groupedTransactions.map((group) => (
                        <div key={group.date} className="mb-0">
                            {/* Day Header */}
                            <div className="flex items-center gap-4 px-6 py-2 bg-gray-50/80 border-b border-gray-100 sticky top-0 z-0">
                                <div className="text-sm font-bold text-gray-900">
                                    {formatGroupDate(group.date)}
                                </div>
                                <div className="flex gap-4 text-xs font-mono">
                                    {group.expense > 0 && (
                                        <span className="flex items-center gap-1 font-medium" style={{ color: colors.expense }}>
                                            <span className="w-2 h-2 rounded-[1px]" style={{ backgroundColor: colors.expense }}></span>
                                            -¥{formatAmount(group.expense, displaySettings)}
                                        </span>
                                    )}
                                    {group.income > 0 && (
                                        <span className="flex items-center gap-1 font-medium" style={{ color: colors.income }}>
                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.income }}></span>
                                            +¥{formatAmount(group.income, displaySettings)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Items */}
                            <div>
                                {group.items.map((tx: any) => (
                                    <TransactionItem
                                        key={tx.id}
                                        transaction={tx}
                                        isMergedTransfer={!!tx.relatedTransfer}
                                        colors={colors}
                                        displaySettings={displaySettings}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}

                    {/* Loading / Sentinel */}
                    <div ref={ref} className="flex justify-center p-4">
                        {loading && <Loader2 className="w-6 h-6 animate-spin text-gray-400" />}
                        {!loading && !hasMore && transactions.length > 0 && (
                            <span className="text-xs text-gray-400 mt-4">没有更多记录了</span>
                        )}
                        {!loading && transactions.length === 0 && (
                            <div className="text-center text-gray-500 py-12 w-full">
                                暂无数据
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* FAB */}
            <div className="fixed bottom-8 right-8">
                <TransactionModal accounts={accounts} onSuccess={() => loadTransactions(true)} />
            </div>
        </div>
    );
}