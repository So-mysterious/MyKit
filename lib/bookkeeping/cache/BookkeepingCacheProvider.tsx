/**
 * [性质]: [Context] 记账模块全局缓存 Provider
 * [Input]: Server Actions (bookkeeping/actions)
 * [Output]: BookkeepingCacheContext (全局状态与数据获取)
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import {
    getAccounts,
    getAvailableTags,
    getTransactions,
    getBudgetPlans,
    getPeriodicTasks,
    getReconciliationIssues,
    getBookkeepingSettings, // ✅ 新增
    listTags,               // ✅ 新增：所有标签
    getCurrencyRates,       // ✅ 新增
    getDashboardTransactions,  // ✅ Dashboard专用流水
    getDashboardBudgetData,    // ✅ Dashboard预算数据
} from "@/lib/bookkeeping/actions";

// ===== Types =====

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

interface CacheData {
    accounts: CacheEntry<any[]> | null;
    tags: CacheEntry<any[]> | null;                      // active tags only
    allTags: CacheEntry<any[]> | null;                   // all tags (包括停用)
    transactions: CacheEntry<{ transactions: any[]; total: number }> | null;
    budgetPlans: CacheEntry<any[]> | null;
    periodicTasks: CacheEntry<any[]> | null;
    reconciliationIssues: CacheEntry<any[]> | null;
    bookkeepingSettings: CacheEntry<any> | null;
    currencyRates: CacheEntry<Record<string, Record<string, number>>> | null;
    dashboardTransactions: CacheEntry<any[]> | null;      // ✅ Dashboard专用：1年内流水
    dashboardBudgetData: CacheEntry<any> | null;         // ✅ Dashboard预算数据
    heatmapAggregation: CacheEntry<{                     // ✅ Heatmap聚合数据
        dataMap: Map<string, number>;
        stats: { mean: number; stdDev: number };
    }> | null;
}

type CacheKey = keyof CacheData;

interface BookkeepingCacheContextValue {
    // Data getters with automatic caching
    getAccounts: (options?: { includeBalance?: boolean }) => Promise<any[]>;
    getTags: () => Promise<any[]>;                                          // active tags only
    getAllTags: () => Promise<any[]>;                                       // all tags
    getTransactions: (options?: any) => Promise<{ transactions: any[]; total: number }>;
    getBudgetPlans: (options?: any) => Promise<any[]>;
    getPeriodicTasks: () => Promise<any[]>;
    getReconciliationIssues: (status?: 'open' | 'resolved') => Promise<any[]>;
    getBookkeepingSettings: () => Promise<any>;
    getCurrencyRates: () => Promise<Record<string, Record<string, number>>>;
    getDashboardTransactions: () => Promise<any[]>;                         // Dashboard专用流水
    getDashboardBudgetData: () => Promise<any>;                             // Dashboard预算数据
    getHeatmapAggregation: (filterAccountId?: string) => Promise<{                                  // Heatmap聚合
        dataMap: Map<string, number>;
        stats: { mean: number; stdDev: number };
    }>;
    getBalanceHistory: (accountId: string, days?: number) => Promise<{ history: Array<{ date: string; balance: number }>; currency: string }>;

    // Cache invalidation
    invalidate: (keys: CacheKey[]) => void;
    invalidateAndRefresh: (keys: CacheKey[] | 'all') => Promise<void>;

    // Loading states
    loading: { [K in CacheKey]?: boolean };
}


// ===== Cache Configuration =====

const CACHE_TTL: Record<CacheKey, number> = {
    accounts: 60 * 60 * 1000,              // 1小时 (原5分钟)
    tags: 120 * 60 * 1000,                 // 2小时 (原30分钟) - active tags
    allTags: 120 * 60 * 1000,              // 2小时 (原10分钟) - all tags
    transactions: 2 * 60 * 1000,           // 2分钟 (未使用)
    budgetPlans: 60 * 60 * 1000,           // 1小时 (原10分钟)
    periodicTasks: 60 * 60 * 1000,         // 1小时 (原10分钟)
    reconciliationIssues: 60 * 60 * 1000,  // 1小时 (原5分钟)
    bookkeepingSettings: 240 * 60 * 1000,  // 4小时 (原30分钟)
    currencyRates: 240 * 60 * 1000,        // 4小时 (原30分钟)
    dashboardTransactions: 30 * 60 * 1000, // 30分钟 (原2分钟) - Dashboard专用流水
    dashboardBudgetData: 30 * 60 * 1000,   // 30分钟 (原5分钟) - Dashboard预算数据
    heatmapAggregation: 30 * 60 * 1000,    // 30分钟 (原5分钟) - Heatmap聚合数据
};

const CACHE_VERSION = 'v1'; // 用于localStorage版本控制
const STORAGE_KEY = 'bookkeeping_cache';

// ===== Context =====

const BookkeepingCacheContext = React.createContext<BookkeepingCacheContextValue | null>(null);

// ===== Provider =====

export function BookkeepingCacheProvider({ children }: { children: React.ReactNode }) {
    const [cache, setCache] = React.useState<CacheData>(() => {
        // 尝试从localStorage恢复缓存
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed.version === CACHE_VERSION) {
                        const cacheData = parsed.data || {
                            accounts: null,
                            tags: null,
                            allTags: null,
                            transactions: null,
                            budgetPlans: null,
                            periodicTasks: null,
                            reconciliationIssues: null,
                            bookkeepingSettings: null,
                            currencyRates: null,
                            dashboardTransactions: null,
                            dashboardBudgetData: null,
                            heatmapAggregation: null,
                        };

                        // ✅ 反序列化Map：将数组转换回Map对象
                        if (cacheData.heatmapAggregation?.data?.dataMap && Array.isArray(cacheData.heatmapAggregation.data.dataMap)) {
                            cacheData.heatmapAggregation.data.dataMap = new Map(cacheData.heatmapAggregation.data.dataMap);
                        }

                        return cacheData;
                    }
                }
            } catch (e) {
                console.warn('Failed to restore cache from localStorage:', e);
            }
        }

        return {
            accounts: null,
            tags: null,
            allTags: null,
            transactions: null,
            budgetPlans: null,
            periodicTasks: null,
            reconciliationIssues: null,
            bookkeepingSettings: null,
            currencyRates: null,
            dashboardTransactions: null,
            dashboardBudgetData: null,
            heatmapAggregation: null,
        };
    });

    const [loading, setLoading] = React.useState<{ [K in CacheKey]?: boolean }>({});

    // 🔥 使用Ref保存最新的cache，避免函数依赖导致的无限循环
    const cacheRef = React.useRef(cache);
    React.useEffect(() => {
        cacheRef.current = cache;
    }, [cache]);

    // 检查缓存是否过期 (稳定函数引用)
    const isExpired = React.useCallback((key: CacheKey): boolean => {
        const entry = cacheRef.current[key];
        if (!entry) return true;
        return Date.now() - entry.timestamp > CACHE_TTL[key];
    }, []); // ✅ 不依赖cache，使用ref

    // Update cache (稳定函数引用) - 处理Map序列化
    const updateCache = React.useCallback((key: CacheKey, data: any) => {
        setCache(prev => {
            const next = {
                ...prev,
                [key]: {
                    data,
                    timestamp: Date.now(),
                },
            };

            // Persist to localStorage with Map serialization
            try {
                // ✅ 序列化所有cache entries中的Map对象
                const serializedCache: any = {};

                Object.keys(next).forEach((k) => {
                    const entry = next[k as CacheKey];
                    if (!entry) {
                        serializedCache[k] = null;
                        return;
                    }

                    // 特殊处理heatmapAggregation的Map
                    if (k === 'heatmapAggregation' && entry.data?.dataMap instanceof Map) {
                        serializedCache[k] = {
                            data: {
                                dataMap: Array.from(entry.data.dataMap.entries()) as [string, number][],
                                stats: entry.data.stats,
                            },
                            timestamp: entry.timestamp,
                        };
                    } else {
                        // 其他entries直接复制
                        serializedCache[k] = entry;
                    }
                });

                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    version: CACHE_VERSION,
                    data: serializedCache,
                }));
            } catch (e) {
                // localStorage might be full or disabled
                console.warn('Failed to persist cache to localStorage', e);
            }

            return next;
        });
    }, []);

    // 获取accounts (带缓存，稳定引用)
    const getCachedAccounts = React.useCallback(async (options?: { includeBalance?: boolean; forceRefresh?: boolean }) => {
        const cacheKey: CacheKey = 'accounts';

        // ✅ 如果forceRefresh为true，跳过缓存检查
        if (!options?.forceRefresh && !isExpired(cacheKey)) {
            return cacheRef.current[cacheKey]!.data;
        }

        // 缓存过期或强制刷新，重新加载
        setLoading(prev => ({ ...prev, [cacheKey]: true }));
        try {
            const data = await getAccounts(options);
            updateCache(cacheKey, data);
            return data;
        } finally {
            setLoading(prev => ({ ...prev, [cacheKey]: false }));
        }
    }, [isExpired, updateCache]); // ✅ 只依赖稳定的函数

    // 获取tags (带缓存，稳定引用)
    const getCachedTags = React.useCallback(async (options?: { forceRefresh?: boolean }) => {
        const cacheKey: CacheKey = 'tags';

        // ✅ 如果forceRefresh为true，跳过缓存检查
        if (!options?.forceRefresh && !isExpired(cacheKey)) {
            return cacheRef.current[cacheKey]!.data;
        }

        setLoading(prev => ({ ...prev, [cacheKey]: true }));
        try {
            const data = await getAvailableTags();
            updateCache(cacheKey, data);
            return data;
        } finally {
            setLoading(prev => ({ ...prev, [cacheKey]: false }));
        }
    }, [isExpired, updateCache]); // ✅ 只依赖稳定的函数

    // 获取transactions (带缓存，稳定引用)
    const getCachedTransactions = React.useCallback(async (options?: any) => {
        const cacheKey: CacheKey = 'transactions';

        // 注意: 简单实现，不考虑不同筛选参数的缓存
        // 如果需要更复杂的缓存策略，可以基于options生成不同的cacheKey
        if (!isExpired(cacheKey)) {
            return cacheRef.current[cacheKey]!.data;
        }

        setLoading(prev => ({ ...prev, [cacheKey]: true }));
        try {
            const data = await getTransactions(options);
            updateCache(cacheKey, data);
            return data;
        } finally {
            setLoading(prev => ({ ...prev, [cacheKey]: false }));
        }
    }, [isExpired, updateCache]); // ✅ 只依赖稳定的函数

    // 获取budgetPlans (带缓存，稳定引用)
    const getCachedBudgetPlans = React.useCallback(async (options?: any) => {
        const cacheKey: CacheKey = 'budgetPlans';

        if (!isExpired(cacheKey)) {
            return cacheRef.current[cacheKey]!.data;
        }

        setLoading(prev => ({ ...prev, [cacheKey]: true }));
        try {
            const data = await getBudgetPlans(options);
            updateCache(cacheKey, data);
            return data;
        } finally {
            setLoading(prev => ({ ...prev, [cacheKey]: false }));
        }
    }, [isExpired, updateCache]); // ✅ 只依赖稳定的函数

    // 获取periodicTasks (带缓存，稳定引用)
    const getCachedPeriodicTasks = React.useCallback(async () => {
        const cacheKey: CacheKey = 'periodicTasks';

        if (!isExpired(cacheKey)) {
            return cacheRef.current[cacheKey]!.data;
        }

        setLoading(prev => ({ ...prev, [cacheKey]: true }));
        try {
            const data = await getPeriodicTasks();
            updateCache(cacheKey, data);
            return data;
        } finally {
            setLoading(prev => ({ ...prev, [cacheKey]: false }));
        }
    }, [isExpired, updateCache]); // ✅ 只依赖稳定的函数

    // 获取reconciliationIssues (带缓存，稳定引用)
    const getCachedReconciliationIssues = React.useCallback(async (status: 'open' | 'resolved' = 'open') => {
        const cacheKey: CacheKey = 'reconciliationIssues';

        // 注意: 简单实现，不考虑不同status参数的缓存
        // 目前默认缓存'open'状态的数据
        if (!isExpired(cacheKey) && status === 'open') {
            return cacheRef.current[cacheKey]!.data;
        }

        setLoading(prev => ({ ...prev, [cacheKey]: true }));
        try {
            const data = await getReconciliationIssues(status);
            if (status === 'open') {
                updateCache(cacheKey, data);
            }
            return data;
        } finally {
            setLoading(prev => ({ ...prev, [cacheKey]: false }));
        }
    }, [isExpired, updateCache]); // ✅ 只依赖稳定的函数

    // 获取bookkeepingSettings (带缓存，稳定引用)
    const getCachedBookkeepingSettings = React.useCallback(async () => {
        const cacheKey: CacheKey = 'bookkeepingSettings';

        if (!isExpired(cacheKey)) {
            return cacheRef.current[cacheKey]!.data;
        }

        setLoading(prev => ({ ...prev, [cacheKey]: true }));
        try {
            const data = await getBookkeepingSettings();
            updateCache(cacheKey, data);
            return data;
        } finally {
            setLoading(prev => ({ ...prev, [cacheKey]: false }));
        }
    }, [isExpired, updateCache]); // ✅ 只依赖稳定的函数

    // 获取allTags (带缓存，稳定引用)
    const getCachedAllTags = React.useCallback(async (options?: { forceRefresh?: boolean }) => {
        const cacheKey: CacheKey = 'allTags';

        // ✅ 如果forceRefresh为true，跳过缓存检查
        if (!options?.forceRefresh && !isExpired(cacheKey)) {
            return cacheRef.current[cacheKey]!.data;
        }

        setLoading(prev => ({ ...prev, [cacheKey]: true }));
        try {
            const data = await listTags(); // 所有标签（包括停用）
            updateCache(cacheKey, data);
            return data;
        } finally {
            setLoading(prev => ({ ...prev, [cacheKey]: false }));
        }
    }, [isExpired, updateCache]); // ✅ 只依赖稳定的函数

    // 获取currencyRates (带缓存，稳定引用)
    const getCachedCurrencyRates = React.useCallback(async () => {
        const cacheKey: CacheKey = 'currencyRates';

        if (!isExpired(cacheKey)) {
            return cacheRef.current[cacheKey]!.data;
        }

        setLoading(prev => ({ ...prev, [cacheKey]: true }));
        try {
            const data = await getCurrencyRates();
            updateCache(cacheKey, data);
            return data;
        } finally {
            setLoading(prev => ({ ...prev, [cacheKey]: false }));
        }
    }, [isExpired, updateCache]); // ✅ 只依赖稳定的函数

    // 获取dashboardTransactions (带缓存，稳定引用)
    const getCachedDashboardTransactions = React.useCallback(async () => {
        const cacheKey: CacheKey = 'dashboardTransactions';

        if (!isExpired(cacheKey)) {
            return cacheRef.current[cacheKey]!.data;
        }

        setLoading(prev => ({ ...prev, [cacheKey]: true }));
        try {
            const data = await getDashboardTransactions(); // 获取1年内流水
            updateCache(cacheKey, data);
            return data;
        } finally {
            setLoading(prev => ({ ...prev, [cacheKey]: false }));
        }
    }, [isExpired, updateCache]); // ✅ 只依赖稳定的函数

    // 获取dashboardBudgetData (带缓存，稳定引用)
    const getCachedDashboardBudgetData = React.useCallback(async () => {
        const cacheKey: CacheKey = 'dashboardBudgetData';

        if (!isExpired(cacheKey)) {
            return cacheRef.current[cacheKey]!.data;
        }

        setLoading(prev => ({ ...prev, [cacheKey]: true }));
        try {
            const data = await getDashboardBudgetData(); // 活跃预算计划+周期记录
            updateCache(cacheKey, data);
            return data;
        } finally {
            setLoading(prev => ({ ...prev, [cacheKey]: false }));
        }
    }, [isExpired, updateCache]); // ✅ 只依赖稳定的函数

    // 获取Heatmap聚合数据 (稳定引用)
    const getCachedHeatmapAggregation = React.useCallback(async (filterAccountId?: string) => {
        const cacheKey = filterAccountId ? `heatmapAggregation_${filterAccountId}` as CacheKey : 'heatmapAggregation' as CacheKey;

        if (!isExpired(cacheKey)) {
            const cachedData = cacheRef.current[cacheKey]!.data;
            // ✅ 防御性检查：确保dataMap是Map对象
            if (cachedData?.dataMap && !(cachedData.dataMap instanceof Map)) {
                // 如果不是Map，尝试从数组重建
                if (Array.isArray(cachedData.dataMap)) {
                    cachedData.dataMap = new Map(cachedData.dataMap);
                } else if (typeof cachedData.dataMap === 'object') {
                    // 可能是普通对象，尝试从entries重建
                    try {
                        cachedData.dataMap = new Map(Object.entries(cachedData.dataMap));
                    } catch {
                        // 重建失败，清空缓存让其重新计算
                        cacheRef.current[cacheKey] = null;
                    }
                } else {
                    // 数据损坏，重新计算（静默处理）
                    cacheRef.current[cacheKey] = null;
                }
            }
            if (cachedData?.dataMap instanceof Map) {
                return cachedData;
            }
            // 如果还不是Map，继续往下重新计算
        }

        setLoading(prev => ({ ...prev, [cacheKey]: true }));
        try {
            // 从dashboardTransactions缓存获取数据
            let transactions = await getCachedDashboardTransactions();

            // 如果有账户过滤
            if (filterAccountId) {
                transactions = transactions.filter(tx =>
                    tx.from_account_id === filterAccountId ||
                    tx.to_account_id === filterAccountId
                );
            }

            const map = new Map<string, number>();
            const values: number[] = [];

            // 按日期聚合净流水
            transactions.forEach((tx: any) => {
                const date = new Date(tx.date);
                const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                // Net amount: income/opening is positive, expense is negative
                let amount = 0;
                if (tx.type === 'expense') amount = -Math.abs(tx.amount);
                else if (tx.type === 'income') amount = Math.abs(tx.amount);
                else if (tx.type === 'opening') amount = Number(tx.amount); // 期初余额直接使用原始金额
                else amount = 0; // 转账不计入净值变化

                const current = map.get(dateStr) || 0;
                const next = current + amount;
                map.set(dateStr, next);
            });

            // 收集非零值用于统计
            map.forEach(val => {
                if (val !== 0) values.push(val);
            });

            // 辅助函数：计算中位数
            const getMedian = (arr: number[]) => {
                const sorted = [...arr].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
            };

            // 计算强健统计量 (MAD - Median Absolute Deviation)
            // 解决大额极端值（如几百万收入）拉高标准差导致日常交易变 level 0 的问题
            let mean = 0;
            let stdDev = 0; // 这里的 stdDev 将被指代为强健标准差 (1.4826 * MAD)

            if (values.length > 0) {
                const median = getMedian(values);
                const absoluteDeviations = values.map(v => Math.abs(v - median));
                const mad = getMedian(absoluteDeviations);

                // 1.4826 是正态分布下 MAD 到标准差的转换因子
                // 即使分布不正态，这也是一个非常好的强健尺度估计
                const robustStdDev = mad === 0 ? 1 : mad * 1.4826;

                mean = median; // 使用中位数作为中心趋势更强健
                stdDev = robustStdDev;
            }

            const data = { dataMap: map, stats: { mean, stdDev } };
            updateCache(cacheKey, data);
            console.log('✅ Computed and cached heatmapAggregation, dataMap is Map:', data.dataMap instanceof Map);
            return data;
        } finally {
            setLoading(prev => ({ ...prev, [cacheKey]: false }));
        }
    }, [isExpired, updateCache, getCachedDashboardTransactions]); // ✅ 依赖稳定函数

    // 失效缓存 (稳定引用)
    const invalidate = React.useCallback((keys: CacheKey[]) => {
        setCache(prev => {
            const next = { ...prev };
            keys.forEach(key => {
                next[key] = null;
            });
            return next;
        });
    }, []); // ✅ 不依赖任何状态

    // 失效并立即刷新 (稳定引用)
    const invalidateAndRefresh = React.useCallback(async (keys: CacheKey[] | 'all') => {
        const keysToRefresh: CacheKey[] = keys === 'all'
            ? ['accounts', 'tags', 'allTags', 'transactions', 'budgetPlans', 'periodicTasks',
                'reconciliationIssues', 'bookkeepingSettings', 'currencyRates'] // ✅ 包含所有
            : keys;

        // 1. 清除缓存
        invalidate(keysToRefresh);

        // 2. 立即重新加载（forceRefresh跳过缓存检查）
        const promises = keysToRefresh.map(async (key) => {
            switch (key) {
                case 'accounts':
                    return getCachedAccounts({ forceRefresh: true });
                case 'tags':
                    return getCachedTags({ forceRefresh: true }); // ✅ 强制刷新修复
                case 'transactions':
                    return getCachedTransactions();
                case 'budgetPlans':
                    return getCachedBudgetPlans();
                case 'periodicTasks':
                    return getCachedPeriodicTasks();
                case 'reconciliationIssues':
                    return getCachedReconciliationIssues();
                case 'bookkeepingSettings':
                    return getCachedBookkeepingSettings();
                case 'allTags':
                    return getCachedAllTags({ forceRefresh: true }); // ✅ 强制刷新修复
                case 'currencyRates':
                    return getCachedCurrencyRates();
                default:
                    return Promise.resolve();
            }
        });

        await Promise.all(promises);
    }, [invalidate, getCachedAccounts, getCachedTags, getCachedTransactions, getCachedBudgetPlans,
        getCachedPeriodicTasks, getCachedReconciliationIssues, getCachedBookkeepingSettings,
        getCachedAllTags, getCachedCurrencyRates]); // ✅ 依赖稳定的函数

    // 页面激活时检查过期缓存
    React.useEffect(() => {
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                // 页面从后台切回来，检查过期缓存
                const expiredKeys: CacheKey[] = [];

                (Object.keys(cacheRef.current) as CacheKey[]).forEach(key => {
                    if (isExpired(key)) {
                        expiredKeys.push(key);
                    }
                });

                if (expiredKeys.length > 0) {
                    invalidateAndRefresh(expiredKeys);
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [isExpired, invalidateAndRefresh]); // ✅ 依赖稳定的函数

    const value = React.useMemo(() => ({
        getAccounts: getCachedAccounts,
        getTags: getCachedTags,
        getAllTags: getCachedAllTags,
        getTransactions: getCachedTransactions,
        getBudgetPlans: getCachedBudgetPlans,
        getPeriodicTasks: getCachedPeriodicTasks,
        getReconciliationIssues: getCachedReconciliationIssues,
        getBookkeepingSettings: getCachedBookkeepingSettings,
        getCurrencyRates: getCachedCurrencyRates,
        getDashboardTransactions: getCachedDashboardTransactions,
        getDashboardBudgetData: getCachedDashboardBudgetData,
        getHeatmapAggregation: getCachedHeatmapAggregation,
        getBalanceHistory: async (accountId: string, days: number = 30) => {
            const { getBalanceHistory: getHist } = await import("@/lib/bookkeeping/actions");
            return getHist(accountId, days);
        },
        invalidate,
        invalidateAndRefresh,
        loading,
    }), [
        getCachedAccounts, getCachedTags, getCachedAllTags, getCachedTransactions,
        getCachedBudgetPlans, getCachedPeriodicTasks, getCachedReconciliationIssues,
        getCachedBookkeepingSettings, getCachedCurrencyRates, getCachedDashboardTransactions,
        getCachedDashboardBudgetData, getCachedHeatmapAggregation, invalidate,
        invalidateAndRefresh, loading
    ]);

    return (
        <BookkeepingCacheContext.Provider value={value}>
            {children}
        </BookkeepingCacheContext.Provider>
    );
}

// ===== Hook =====

export function useBookkeepingCache() {
    const context = React.useContext(BookkeepingCacheContext);

    if (!context) {
        throw new Error('useBookkeepingCache must be used within BookkeepingCacheProvider');
    }

    return context;
}
