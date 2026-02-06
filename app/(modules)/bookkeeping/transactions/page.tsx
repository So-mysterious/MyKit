/**
 * [性质]: [页面] 交易流水列表 (分页/筛选)
 * [Input]: None
 * [Output]: Page UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { useInView } from "react-intersection-observer";
import { getTransactions, deleteTransaction, updateTransaction } from "@/lib/bookkeeping/actions";
import { useBookkeepingCache } from "@/lib/bookkeeping/cache/BookkeepingCacheProvider";
import { TransactionItem, LinkedTransactionItem } from "@/components/bookkeeping/TransactionItem";
import { TransactionModal } from "@/components/bookkeeping/TransactionModal";
import { Loader2, Filter, Wallet, ArrowUpCircle, ArrowDownCircle, XCircle, Search, CalendarIcon, ChevronDown, Check, Info, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { format, parseISO, subDays, subMonths } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useBookkeepingColors } from "@/lib/bookkeeping/useColors";
import { useBookkeepingSettings, formatAmount } from "@/lib/bookkeeping/useSettings";
import { inferTransactionType } from "@/lib/constants";
import { TransactionWithAccounts, AccountWithBalance } from "@/types/database";

// ============================================================================
// 常量定义
// ============================================================================

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

const STATUS_OPTIONS = [
    { label: "待核对", value: "needs_review", field: "needs_review" },
    { label: "重要", value: "is_starred", field: "is_starred" },
    { label: "意外", value: "unexpected", field: "nature" },
    { label: "大额", value: "is_large_expense", field: "is_large_expense" },
] as const;

const TIME_PRESET_OPTIONS: Record<DatePreset, string> = {
    all: "全部",
    "3d": "近三天",
    week: "近一周",
    month: "近一月",
    custom: "自定义",
};

const TIME_PRESET_ORDER: DatePreset[] = ["all", "3d", "week", "month"];

const TIME_LABEL_TO_PRESET = Object.entries(TIME_PRESET_OPTIONS).reduce<Record<string, DatePreset>>((acc, [key, label]) => {
    acc[label] = key as DatePreset;
    return acc;
}, {});

type DatePreset = "all" | "3d" | "week" | "month" | "custom";

// ============================================================================
// 筛选器组件
// ============================================================================

interface FilterSelectorProps {
    label?: string;
    options: string[];
    selectedValues: string[];
    onChange: (values: string[], triggeredOption?: string) => void;
    className?: string;
}

const isAllOption = (option: string) => option === 'ALL' || option.includes('全部') || option.includes('不限');

const FilterSelector: React.FC<FilterSelectorProps> = ({
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
                                className={`relative px-4 py-1 text-sm font-medium rounded-md transition-colors duration-200 ease-out whitespace-nowrap ${isSelected
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

// ============================================================================
// 分组逻辑：按日期分组，关联交易附属在主交易下
// ============================================================================

interface TransactionGroup {
    date: string;
    items: Array<{
        transaction: TransactionWithAccounts;
        linkedChildren: TransactionWithAccounts[];
    }>;
    income: number;
    expense: number;
}

function groupTransactions(transactions: TransactionWithAccounts[]): TransactionGroup[] {
    // 1. 建立关联关系映射
    const linkedMap = new Map<string, TransactionWithAccounts[]>();
    const mainTxIds = new Set<string>();

    transactions.forEach(tx => {
        if (tx.linked_transaction_id) {
            const parentId = tx.linked_transaction_id;
            if (!linkedMap.has(parentId)) {
                linkedMap.set(parentId, []);
            }
            linkedMap.get(parentId)!.push(tx);
        } else {
            mainTxIds.add(tx.id);
        }
    });

    // 2. 过滤出主交易（非关联子交易）
    const mainTransactions = transactions.filter(tx => !tx.linked_transaction_id);

    // 3. 按日期分组
    const groups: Record<string, TransactionGroup> = {};

    mainTransactions.forEach(tx => {
        const dateKey = tx.date.split('T')[0];
        if (!groups[dateKey]) {
            groups[dateKey] = { date: dateKey, items: [], income: 0, expense: 0 };
        }

        const txType = inferTransactionType(
            tx.from_account?.type as any,
            tx.to_account?.type as any
        );

        // 计算统计
        if (txType === 'expense') {
            groups[dateKey].expense += tx.amount;
        } else if (txType === 'income') {
            groups[dateKey].income += tx.amount;
        }

        // 添加主交易和其关联子交易
        groups[dateKey].items.push({
            transaction: tx,
            linkedChildren: linkedMap.get(tx.id) || [],
        });
    });

    // 4. 排序并返回
    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
}

// ============================================================================
// 展平账户树结构
// ============================================================================

function flattenAccounts(tree: any[]): any[] {
    const result: any[] = [];
    const traverse = (nodes: any[], parentName: string | null = null) => {
        nodes.forEach(node => {
            // 为每个节点记录父节点名称，方便后续构造显示名
            const nodeWithParent = { ...node, parentName };
            result.push(nodeWithParent);
            if (node.children && node.children.length > 0) {
                traverse(node.children, node.name);
            }
        });
    };
    traverse(tree);
    return result;
}

// ============================================================================
// 主页面组件
// ============================================================================

export default function TransactionsPage() {
    const [transactions, setTransactions] = React.useState<TransactionWithAccounts[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [page, setPage] = React.useState(0);
    const [hasMore, setHasMore] = React.useState(true);

    // 筛选状态
    const [showFilters, setShowFilters] = React.useState(false);
    const [filterType, setFilterType] = React.useState<string | undefined>(undefined);
    const [filterAccountId, setFilterAccountId] = React.useState<string | undefined>(undefined);
    const [filterStartDate, setFilterStartDate] = React.useState<string | undefined>(undefined);
    const [filterEndDate, setFilterEndDate] = React.useState<string | undefined>(undefined);
    const [datePreset, setDatePreset] = React.useState<DatePreset>("all");

    // 新增筛选状态
    const [filterStatuses, setFilterStatuses] = React.useState<string[]>([]);
    const [filterFromAccounts, setFilterFromAccounts] = React.useState<string[]>([]);
    const [filterToAccounts, setFilterToAccounts] = React.useState<string[]>([]);
    const [searchText, setSearchText] = React.useState("");
    const [debouncedSearchText, setDebouncedSearchText] = React.useState("");

    // 自定义日期范围
    const [customStartDate, setCustomStartDate] = React.useState("");
    const [customEndDate, setCustomEndDate] = React.useState("");

    // 账户列表（用于筛选器）
    const [accounts, setAccounts] = React.useState<any[]>([]);

    // 下拉菜单状态
    const [showIncomeDropdown, setShowIncomeDropdown] = React.useState(false);
    const [showExpenseDropdown, setShowExpenseDropdown] = React.useState(false);
    const [showRealAccountDropdown, setShowRealAccountDropdown] = React.useState(false);

    // 账户筛选状态
    const [filterIncomeAccounts, setFilterIncomeAccounts] = React.useState<string[]>([]);
    const [filterExpenseAccounts, setFilterExpenseAccounts] = React.useState<string[]>([]);
    const [filterRealAccounts, setFilterRealAccounts] = React.useState<string[]>([]);

    // 说明弹窗状态
    const [showInfoModal, setShowInfoModal] = React.useState(false);
    const [infoModalPage, setInfoModalPage] = React.useState(0);

    // 编辑状态
    const [editingTransaction, setEditingTransaction] = React.useState<TransactionWithAccounts | null>(null);

    // 全局配置
    const { colors } = useBookkeepingColors();
    const { settings: displaySettings } = useBookkeepingSettings();
    const cache = useBookkeepingCache();

    const { ref, inView } = useInView({
        rootMargin: '500px', // 提前 500px 触发加载，实现无缝滚动
    });

    // 加载账户列表（展平树结构）
    React.useEffect(() => {
        cache.getAccounts({ includeBalance: false }).then(tree => {
            const flat = flattenAccounts(tree);
            setAccounts(flat);
        }).catch(console.error);
    }, []);

    // 加载交易数据
    const loadTransactions = React.useCallback(async (isRefresh = false) => {
        if (isRefresh) {
            setLoading(true);
            setPage(0);
            setTransactions([]);
            setHasMore(true);
        }

        try {
            const currentPage = isRefresh ? 0 : page;
            const PAGE_SIZE = 100; // 增大每页数量，减少加载次数

            const result = await getTransactions({
                limit: PAGE_SIZE,
                offset: currentPage * PAGE_SIZE,
                accountId: filterAccountId,
                startDate: filterStartDate,
                endDate: filterEndDate,
                type: filterType,
            });

            if (!result || !result.transactions) {
                setHasMore(false);
                return;
            }

            if (result.transactions.length === 0) {
                setHasMore(false);
            } else {
                setTransactions(prev => {
                    if (isRefresh) {
                        return result.transactions;
                    }
                    // 去重：避免分页加载时出现重复交易
                    const existingIds = new Set(prev.map(t => t.id));
                    const newTxs = result.transactions.filter(t => !existingIds.has(t.id));
                    return [...prev, ...newTxs];
                });
                if (!isRefresh) {
                    setPage(prev => prev + 1);
                }
                // 如果返回的数量少于请求的数量，说明没有更多了
                if (result.transactions.length < PAGE_SIZE) {
                    setHasMore(false);
                }
            }
        } catch (error: any) {
            // 只在真正有错误时记录
            if (error && Object.keys(error).length > 0) {
                console.error('Failed to load transactions:', error);
            }
            setHasMore(false);
        } finally {
            setLoading(false);
        }
    }, [page, filterType, filterAccountId, filterStartDate, filterEndDate]);

    // 筛选条件变化时刷新
    React.useEffect(() => {
        loadTransactions(true);
    }, [filterType, filterAccountId, filterStartDate, filterEndDate]);

    // 搜索文本防抖
    React.useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchText(searchText);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchText]);

    // 无限滚动 - 提前触发加载
    React.useEffect(() => {
        if (inView && hasMore && !loading) {
            loadTransactions();
        }
    }, [inView, hasMore, loading]);

    // 账户显示名称处理
    const processAccountName = React.useCallback((acc: any) => {
        if (!acc.parentName) return acc.name;
        // 如果是币种户头（名称只有 3 个大写字母），且有父账户，则显示 "父账户 (币种)"
        const isCurrencyOnly = /^[A-Z]{3}$/.test(acc.name);
        if (isCurrencyOnly) {
            return `${acc.parentName} (${acc.name})`;
        }
        return acc.name;
    }, []);

    // 账户分类及显示优化
    const incomeAccounts = React.useMemo(() =>
        accounts
            .filter((a: any) => a.type === 'income' && !a.is_group)
            .map(a => ({ ...a, displayName: processAccountName(a) })),
        [accounts, processAccountName]
    );

    const expenseAccounts = React.useMemo(() =>
        accounts
            .filter((a: any) => a.type === 'expense' && !a.is_group)
            .map(a => ({ ...a, displayName: processAccountName(a) })),
        [accounts, processAccountName]
    );

    const realAccounts = React.useMemo(() => {
        const list = accounts
            .filter((a: any) => (a.type === 'asset' || a.type === 'liability') && !a.is_group)
            .map(a => ({ ...a, displayName: processAccountName(a) }));

        // 排序规则：资产在前，负债在后；同类按父账户分组
        return list.sort((a, b) => {
            // 类型优先级：Asset -> Liability
            if (a.type !== b.type) {
                return a.type === 'asset' ? -1 : 1;
            }
            // 同类型按父账户名称排序，确保同一银行账户相邻
            const pA = a.parentName || "";
            const pB = b.parentName || "";
            if (pA !== pB) return pA.localeCompare(pB);
            // 同父账户按名称排序
            return a.name.localeCompare(b.name);
        });
    }, [accounts, processAccountName]);

    // 点击外部关闭下拉菜单
    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // 检查是否点击在下拉菜单外部
            if (!target.closest('.filter-dropdown')) {
                setShowIncomeDropdown(false);
                setShowExpenseDropdown(false);
                setShowRealAccountDropdown(false);
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    // 文本归一化：处理中英文标点兼容
    const normalizeText = React.useCallback((text: string): string => {
        return text
            .replace(/（/g, '(')
            .replace(/）/g, ')')
            .replace(/【/g, '[')
            .replace(/】/g, ']')
            .replace(/，/g, ',')
            .replace(/。/g, '.')
            .replace(/！/g, '!')
            .replace(/？/g, '?')
            .toLowerCase();
    }, []);

    // 搜索分词函数
    const generateTokens = React.useCallback((text: string): string[] => {
        const normalized = normalizeText(text);
        if (!normalized.trim()) return [];

        const tokens = new Set<string>();
        // 保留原词（归一化后）
        tokens.add(normalized.trim());

        // 被动分词：2/3/4 字切分（仅针对不含 * 的部分）
        if (!normalized.includes('*')) {
            const cleanText = normalized.replace(/\s+/g, '');
            for (let len = 2; len <= 4; len++) {
                for (let i = 0; i <= cleanText.length - len; i++) {
                    tokens.add(cleanText.slice(i, i + len));
                }
            }
        }

        return Array.from(tokens);
    }, [normalizeText]);

    // 前端过滤后的交易
    const filteredTransactions = React.useMemo(() => {
        let result = transactions;

        // 状态筛选
        if (filterStatuses.length > 0) {
            result = result.filter(tx => {
                return filterStatuses.some(status => {
                    if (status === 'needs_review') return tx.needs_review;
                    if (status === 'is_starred') return tx.is_starred;
                    if (status === 'unexpected') return tx.nature === 'unexpected';
                    if (status === 'is_large_expense') return tx.is_large_expense;
                    return false;
                });
            });
        }

        // 收入标签筛选（from_account 是收入类虚账户）
        if (filterIncomeAccounts.length > 0) {
            result = result.filter(tx =>
                tx.from_account_id && filterIncomeAccounts.includes(tx.from_account_id)
            );
        }

        // 支出标签筛选（to_account 是支出类虚账户）
        if (filterExpenseAccounts.length > 0) {
            result = result.filter(tx =>
                tx.to_account_id && filterExpenseAccounts.includes(tx.to_account_id)
            );
        }

        // 关联账户筛选（实账户可能出现在 from 或 to）
        if (filterRealAccounts.length > 0) {
            result = result.filter(tx =>
                (tx.from_account_id && filterRealAccounts.includes(tx.from_account_id)) ||
                (tx.to_account_id && filterRealAccounts.includes(tx.to_account_id))
            );
        }

        // 搜索筛选
        if (debouncedSearchText.trim()) {
            const normalizedQuery = normalizeText(debouncedSearchText.trim());
            const hasWildcard = normalizedQuery.includes('*');

            // 检测 AND 模式（分号分词）
            const hasSemicolon = normalizedQuery.includes(';') || debouncedSearchText.includes('；');

            result = result.filter(tx => {
                const searchableText = normalizeText([
                    tx.description || '',
                    tx.location || '',
                    tx.project?.name || ''
                ].join(' '));

                if (hasWildcard) {
                    // 通配符模式
                    const pattern = normalizedQuery
                        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                        .replace(/\*/g, '.');
                    const regex = new RegExp(pattern);
                    return regex.test(searchableText);
                } else if (hasSemicolon) {
                    // AND 模式：所有词都必须匹配
                    const terms = normalizedQuery.split(/[;；]/).map(t => t.trim()).filter(Boolean);
                    return terms.every(term => {
                        const termTokens = generateTokens(term);
                        return termTokens.some(token => searchableText.includes(token));
                    });
                } else {
                    // OR 模式：任意一个匹配
                    const tokens = generateTokens(debouncedSearchText);
                    return tokens.some(token => searchableText.includes(token));
                }
            });
        }

        return result;
    }, [transactions, filterStatuses, filterIncomeAccounts, filterExpenseAccounts, filterRealAccounts, debouncedSearchText, generateTokens]);

    // 分组后的交易（使用过滤后的交易）
    const groupedTransactions = React.useMemo(
        () => groupTransactions(filteredTransactions),
        [filteredTransactions]
    );

    // 统计数据（使用过滤后的交易）
    const stats = React.useMemo(() => {
        let totalIncome = 0;
        let totalExpense = 0;

        filteredTransactions.forEach(tx => {
            const txType = inferTransactionType(
                tx.from_account?.type as any,
                tx.to_account?.type as any
            );
            if (txType === 'expense') {
                totalExpense += tx.amount;
            } else if (txType === 'income') {
                totalIncome += tx.amount;
            }
        });

        return {
            count: filteredTransactions.length,
            income: totalIncome,
            expense: totalExpense,
        };
    }, [filteredTransactions]);

    // 日期格式化
    const formatGroupDate = (dateStr: string) => {
        const date = parseISO(dateStr);
        return format(date, "M月d日 EEE", { locale: zhCN });
    };

    // 筛选器处理
    const handleTypeSelectorChange = (labels: string[], option?: string) => {
        if (labels.length === 0 || (option && isAllOption(option))) {
            setFilterType(undefined);
            return;
        }
        const latest = labels[labels.length - 1];
        const matchedOption = TYPE_OPTIONS.find(opt => opt.label === latest);
        if (!matchedOption || matchedOption.value === 'all') {
            setFilterType(undefined);
            return;
        }
        setFilterType(matchedOption.value);
    };



    const handleClearFilters = () => {
        setFilterType(undefined);
        setFilterAccountId(undefined);
        setFilterStartDate(undefined);
        setFilterEndDate(undefined);
        setDatePreset("all");
        setFilterStatuses([]);
        setFilterIncomeAccounts([]);
        setFilterExpenseAccounts([]);
        setFilterRealAccounts([]);
        setSearchText("");
        setCustomStartDate("");
        setCustomEndDate("");
    };

    // 编辑交易
    const handleEdit = (tx: TransactionWithAccounts) => {
        setEditingTransaction(tx);
    };

    // 状态变更 - 不刷新整个列表，只更新单个交易
    const handleStatusChange = async (id: string, field: string, value: any) => {
        // 获取旧值用于回滚
        const oldTransaction = transactions.find(tx => tx.id === id);
        const oldValue = oldTransaction ? (oldTransaction as any)[field] : null;

        // 乐观更新：立即在 UI 中反映变化
        setTransactions(prev =>
            prev.map(tx =>
                tx.id === id ? { ...tx, [field]: value } : tx
            )
        );

        try {
            await updateTransaction(id, { [field]: value });
        } catch (error) {
            // 回滚：如果更新失败，恢复原状态
            setTransactions(prev =>
                prev.map(tx =>
                    tx.id === id ? { ...tx, [field]: oldValue } : tx
                )
            );
            console.error('Failed to update transaction:', error);
        }
    };

    // 删除交易
    const handleDelete = async (id: string) => {
        // 乐观更新：立即在 UI 中移除
        const oldTransactions = [...transactions];
        setTransactions(prev => prev.filter(tx => tx.id !== id));

        try {
            await deleteTransaction(id);
        } catch (error) {
            // 回滚
            setTransactions(oldTransactions);
            console.error('Failed to delete transaction:', error);
        }
    };

    // 选中的筛选值
    const typeSelectedLabels = React.useMemo(() => {
        if (filterType) {
            const match = TYPE_OPTIONS.find(opt => opt.value === filterType);
            if (match) return [match.label];
        }
        return ["全部"];
    }, [filterType]);



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

                        {/* 统计 */}
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
                        {/* 说明图标 */}
                        <button
                            type="button"
                            onClick={() => { setShowInfoModal(true); setInfoModalPage(0); }}
                            className="flex items-center justify-center w-9 h-9 rounded-md border border-gray-200 bg-white shadow-sm text-gray-400 hover:text-blue-500 hover:border-blue-400 transition-colors"
                            title="页面说明"
                        >
                            <Info size={16} />
                        </button>
                        {/* 搜索框 */}
                        <div className="flex items-center gap-1.5 border border-gray-200 rounded-md px-3 h-9 shadow-sm bg-white">
                            <Search size={14} className="text-gray-400" />
                            <input
                                type="text"
                                placeholder="搜索..."
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                className="w-32 bg-transparent border-none outline-none text-sm placeholder:text-gray-400 h-full"
                            />
                            {searchText && (
                                <button
                                    type="button"
                                    onClick={() => setSearchText("")}
                                    className="text-gray-400 hover:text-gray-600 ml-1"
                                >
                                    <XCircle size={14} />
                                </button>
                            )}
                        </div>
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
                            className={cn(
                                "gap-2 text-xs transition-none",
                                showFilters && "border-blue-500 text-blue-600 bg-blue-50"
                            )}
                        >
                            <Filter size={16} />
                            筛选
                        </Button>
                    </div>
                </div>

                {showFilters && (
                    <div className="flex flex-col gap-3 animate-in slide-in-from-top-2 pt-4 border-t border-gray-100 mt-4">
                        {/* 第一行：类型 + 日期 + 状态 */}
                        <div className="flex gap-4 items-center">
                            <div className="flex-1">
                                <FilterSelector
                                    label="类型"
                                    options={TYPE_OPTIONS.map(opt => opt.label)}
                                    selectedValues={typeSelectedLabels}
                                    onChange={handleTypeSelectorChange}
                                />
                            </div>

                            {/* 日期范围选择器 */}
                            <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg border border-gray-200/50">
                                <CalendarIcon size={16} className="text-gray-400 ml-2" />
                                <input
                                    type="date"
                                    value={customStartDate}
                                    max={customEndDate || undefined}
                                    onChange={(e) => {
                                        setCustomStartDate(e.target.value);
                                        if (e.target.value) {
                                            setDatePreset("custom");
                                            setFilterStartDate(e.target.value);
                                        }
                                    }}
                                    className="bg-transparent text-sm text-gray-600 px-2 py-1 border-none outline-none"
                                />
                                <span className="text-gray-400">—</span>
                                <input
                                    type="date"
                                    value={customEndDate}
                                    min={customStartDate || undefined}
                                    onChange={(e) => {
                                        setCustomEndDate(e.target.value);
                                        if (e.target.value) {
                                            setDatePreset("custom");
                                            setFilterEndDate(e.target.value);
                                        }
                                    }}
                                    className="bg-transparent text-sm text-gray-600 px-2 py-1 border-none outline-none"
                                />
                            </div>

                            <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg border border-gray-200/50">
                                <div className="px-3 py-1 text-sm font-semibold text-gray-400 border-r border-gray-300/50 mr-1 whitespace-nowrap">
                                    状态
                                </div>
                                {STATUS_OPTIONS.map(status => (
                                    <button
                                        key={status.value}
                                        type="button"
                                        onClick={() => {
                                            setFilterStatuses(prev =>
                                                prev.includes(status.value)
                                                    ? prev.filter(v => v !== status.value)
                                                    : [...prev, status.value]
                                            );
                                        }}
                                        className={cn(
                                            "px-3 py-1 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                                            filterStatuses.includes(status.value)
                                                ? "text-white shadow-sm"
                                                : "text-gray-600 hover:bg-gray-200"
                                        )}
                                        style={
                                            filterStatuses.includes(status.value)
                                                ? { backgroundColor: '#2563eb' }
                                                : undefined
                                        }
                                    >
                                        {status.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 第二行：账户筛选（收入标签、支出标签、关联账户） */}
                        <div className="flex gap-3">
                            {/* 收入标签多选下拉 */}
                            <div className="relative flex-1 filter-dropdown">
                                <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg border border-gray-200/50">
                                    <div className="px-3 py-1 text-sm font-semibold text-gray-400 border-r border-gray-300/50 whitespace-nowrap">
                                        收入
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowIncomeDropdown(!showIncomeDropdown)}
                                        className="flex-1 flex items-center justify-between px-3 py-1 text-sm text-gray-600 hover:bg-gray-200 rounded-md"
                                    >
                                        <span className="truncate">
                                            {filterIncomeAccounts.length === 0
                                                ? "全部"
                                                : `已选 ${filterIncomeAccounts.length} 个`}
                                        </span>
                                        <ChevronDown size={16} className={cn("transition-transform", showIncomeDropdown && "rotate-180")} />
                                    </button>
                                </div>
                                {showIncomeDropdown && (
                                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                        {incomeAccounts.length === 0 ? (
                                            <div className="p-3 text-sm text-gray-400 text-center">暂无收入账户</div>
                                        ) : (
                                            incomeAccounts.map((acc: any) => (
                                                <label key={acc.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                                                    <input
                                                        type="checkbox"
                                                        checked={filterIncomeAccounts.includes(acc.id)}
                                                        onChange={() => {
                                                            setFilterIncomeAccounts(prev =>
                                                                prev.includes(acc.id)
                                                                    ? prev.filter(id => id !== acc.id)
                                                                    : [...prev, acc.id]
                                                            );
                                                        }}
                                                        className="rounded border-gray-300"
                                                    />
                                                    <span>{acc.displayName || acc.name}</span>
                                                </label>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 支出标签多选下拉 */}
                            <div className="relative flex-1 filter-dropdown">
                                <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg border border-gray-200/50">
                                    <div className="px-3 py-1 text-sm font-semibold text-gray-400 border-r border-gray-300/50 whitespace-nowrap">
                                        支出
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowExpenseDropdown(!showExpenseDropdown)}
                                        className="flex-1 flex items-center justify-between px-3 py-1 text-sm text-gray-600 hover:bg-gray-200 rounded-md"
                                    >
                                        <span className="truncate">
                                            {filterExpenseAccounts.length === 0
                                                ? "全部"
                                                : `已选 ${filterExpenseAccounts.length} 个`}
                                        </span>
                                        <ChevronDown size={16} className={cn("transition-transform", showExpenseDropdown && "rotate-180")} />
                                    </button>
                                </div>
                                {showExpenseDropdown && (
                                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                        {expenseAccounts.length === 0 ? (
                                            <div className="p-3 text-sm text-gray-400 text-center">暂无支出账户</div>
                                        ) : (
                                            expenseAccounts.map((acc: any) => (
                                                <label key={acc.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                                                    <input
                                                        type="checkbox"
                                                        checked={filterExpenseAccounts.includes(acc.id)}
                                                        onChange={() => {
                                                            setFilterExpenseAccounts(prev =>
                                                                prev.includes(acc.id)
                                                                    ? prev.filter(id => id !== acc.id)
                                                                    : [...prev, acc.id]
                                                            );
                                                        }}
                                                        className="rounded border-gray-300"
                                                    />
                                                    <span>{acc.displayName || acc.name}</span>
                                                </label>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 关联账户（实账户）多选下拉 */}
                            <div className="relative flex-1 filter-dropdown">
                                <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg border border-gray-200/50">
                                    <div className="px-3 py-1 text-sm font-semibold text-gray-400 border-r border-gray-300/50 whitespace-nowrap">
                                        账户
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowRealAccountDropdown(!showRealAccountDropdown)}
                                        className="flex-1 flex items-center justify-between px-3 py-1 text-sm text-gray-600 hover:bg-gray-200 rounded-md"
                                    >
                                        <span className="truncate">
                                            {filterRealAccounts.length === 0
                                                ? "全部"
                                                : `已选 ${filterRealAccounts.length} 个`}
                                        </span>
                                        <ChevronDown size={16} className={cn("transition-transform", showRealAccountDropdown && "rotate-180")} />
                                    </button>
                                </div>
                                {showRealAccountDropdown && (
                                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                        {realAccounts.length === 0 ? (
                                            <div className="p-3 text-sm text-gray-400 text-center">暂无关联账户</div>
                                        ) : (
                                            realAccounts.map((acc: any) => (
                                                <label key={acc.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                                                    <input
                                                        type="checkbox"
                                                        checked={filterRealAccounts.includes(acc.id)}
                                                        onChange={() => {
                                                            setFilterRealAccounts(prev =>
                                                                prev.includes(acc.id)
                                                                    ? prev.filter(id => id !== acc.id)
                                                                    : [...prev, acc.id]
                                                            );
                                                        }}
                                                        className="rounded border-gray-300"
                                                    />
                                                    <span>{acc.displayName || acc.name}</span>
                                                </label>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 表头 */}
                <div
                    className="mt-4 pt-2 border-t border-gray-100 text-xs font-medium text-gray-400 grid"
                    style={{ gridTemplateColumns: "110px 90px 1fr 1fr 1fr 100px 36px 36px 36px" }}
                >
                    <div className="pl-6">状态</div>
                    <div>时间</div>
                    <div className="text-center px-2">转出</div>
                    <div className="text-center px-2">金额</div>
                    <div className="text-center px-2">转入</div>
                    <div className="px-1">备注</div>
                    <div></div>
                    <div></div>
                    <div></div>
                </div>
            </div>

            {/* 列表 */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <div className="overflow-y-auto flex-1 pb-20">
                    {groupedTransactions.map((group) => (
                        <div key={group.date} className="mb-0">
                            <div className="flex items-center gap-4 px-6 py-2 bg-gray-50/80 border-b border-gray-100 sticky top-0">
                                <div className="text-sm font-bold text-gray-900">
                                    {formatGroupDate(group.date)}
                                </div>
                                <div className="flex gap-4 text-xs font-mono">
                                    {group.expense > 0 && (
                                        <span className="flex items-center gap-1 font-medium" style={{ color: colors.expense }}>
                                            <ArrowUpCircle size={12} />
                                            -¥{formatAmount(group.expense, displaySettings)}
                                        </span>
                                    )}
                                    {group.income > 0 && (
                                        <span className="flex items-center gap-1 font-medium" style={{ color: colors.income }}>
                                            <ArrowDownCircle size={12} />
                                            +¥{formatAmount(group.income, displaySettings)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* 交易项 */}
                            <div>
                                {group.items.map(({ transaction: tx, linkedChildren }) => (
                                    <React.Fragment key={tx.id}>
                                        <TransactionItem
                                            transaction={tx}
                                            colors={colors}
                                            displaySettings={displaySettings}
                                            onEdit={handleEdit}
                                            onStatusChange={handleStatusChange}
                                            onDelete={handleDelete}
                                        />
                                        {linkedChildren.map(child => (
                                            <LinkedTransactionItem
                                                key={child.id}
                                                transaction={child}
                                                colors={colors}
                                                displaySettings={displaySettings}
                                                onEdit={handleEdit}
                                                onStatusChange={handleStatusChange}
                                                onDelete={handleDelete}
                                            />
                                        ))}
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    ))}

                    {/* 加载指示器 */}
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

            {/* FAB - 新建交易 */}
            <div className="fixed bottom-8 right-8 z-50">
                <TransactionModal onSuccess={() => loadTransactions(true)} />
            </div>

            {/* 编辑弹窗 */}
            {editingTransaction && (
                <TransactionModal
                    editMode
                    initialData={editingTransaction}
                    onSuccess={() => {
                        setEditingTransaction(null);
                        loadTransactions(true);
                    }}
                    onClose={() => setEditingTransaction(null)}
                    trigger={<div />}
                />
            )}

            {/* 说明弹窗 */}
            {showInfoModal && (
                <div
                    className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center"
                    onClick={() => setShowInfoModal(false)}
                >
                    <div
                        className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* 关闭按钮 */}
                        <button
                            type="button"
                            onClick={() => setShowInfoModal(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                        >
                            <X size={20} />
                        </button>

                        {/* 页面标题 */}
                        <h3 className="text-lg font-bold mb-4">
                            {infoModalPage === 0 && "搜索规则"}
                            {infoModalPage === 1 && "账户显示逻辑"}
                            {infoModalPage === 2 && "流水行说明"}
                        </h3>

                        {/* 分页内容 */}
                        <div className="text-sm text-gray-600 space-y-3 min-h-[180px]">
                            {infoModalPage === 0 && (
                                <>
                                    <p><strong>• 空格分词 (OR)</strong>：任意一个词匹配即可。</p>
                                    <p className="text-gray-400 pl-4">例: "相亲 逻辑 我们" 可匹配 "相亲相爱一家人"</p>
                                    <p><strong>• 分号分词 (AND)</strong>：所有词都必须匹配。</p>
                                    <p className="text-gray-400 pl-4">例: "相亲；逻辑；我们" 不匹配 "相亲相爱一家人"</p>
                                    <p><strong>• 通配符 *</strong>：代表任意一个字符。</p>
                                    <p className="text-gray-400 pl-4">例: "AB*D" 匹配 "ABCD"；"A**D" 匹配 "AFGD"</p>
                                    <p><strong>• 标点兼容</strong>：自动忽略中英文括号、逗号等差异。</p>
                                </>
                            )}
                            {infoModalPage === 1 && (
                                <>
                                    <p><strong>• 实账户 (Real)</strong>：银行卡、现金、信用卡等有实际余额的账户，显示为深色字体。</p>
                                    <p><strong>• 虚账户 (Nominal)</strong>：收入来源（如"工资"）、支出分类（如"餐饮"），显示为浅灰色字体。</p>
                                    <p><strong>• 币种子账户</strong>：同一银行的不同币种户头会显示为「父账户 (币种)」格式，如「工行 (CNY)」。</p>
                                    <p><strong>• 排序</strong>：资产类账户在前，负债类在后；同一银行的账户相邻排列。</p>
                                </>
                            )}
                            {infoModalPage === 2 && (
                                <>
                                    <p><strong>每行包含</strong>：状态指示灯 | 时间 | 转出账户 | 金额 | 转入账户 | 备注 | 更多 | 编辑</p>
                                    <p className="font-semibold mt-2">四个状态指示灯：</p>
                                    <ul className="list-disc pl-5 space-y-1">
                                        <li><span className="text-red-500 font-medium">大额</span>：标记为大额支出的交易</li>
                                        <li><span className="text-yellow-500 font-medium">重要</span>：用户星标的重要交易</li>
                                        <li><span className="text-blue-500 font-medium">待核对</span>：需要核对的交易</li>
                                        <li><span className="text-purple-500 font-medium">意外</span>：意外/非预期的交易</li>
                                    </ul>
                                    <p className="mt-2"><strong>项目</strong>：流水所属的项目显示在「更多」图标的悬浮框中。</p>
                                </>
                            )}
                        </div>

                        {/* 分页导航 */}
                        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={() => setInfoModalPage(p => Math.max(0, p - 1))}
                                disabled={infoModalPage === 0}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft size={16} />
                                上一页
                            </button>
                            <div className="flex gap-1.5">
                                {[0, 1, 2].map(i => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => setInfoModalPage(i)}
                                        className={cn(
                                            "w-2 h-2 rounded-full transition-colors",
                                            infoModalPage === i ? "bg-blue-500" : "bg-gray-300"
                                        )}
                                    />
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => setInfoModalPage(p => Math.min(2, p + 1))}
                                disabled={infoModalPage === 2}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                下一页
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}