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
    transactions: CacheEntry<any[]> | null;
    budgetPlans: CacheEntry<any[]> | null;
    periodicTasks: CacheEntry<any[]> | null;
    reconciliationIssues: CacheEntry<any[]> | null;
    bookkeepingSettings: CacheEntry<any> | null;
    currencyRates: CacheEntry<any[]> | null;
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
    getTransactions: (options?: any) => Promise<any[]>;
    getBudgetPlans: (options?: any) => Promise<any[]>;
    getPeriodicTasks: () => Promise<any[]>;
    getReconciliationIssues: (status?: 'open' | 'resolved') => Promise<any[]>;
    getBookkeepingSettings: () => Promise<any>;
    getCurrencyRates: () => Promise<any[]>;
    getDashboardTransactions: () => Promise<any[]>;                         // Dashboard专用流水
    getDashboardBudgetData: () => Promise<any>;                             // Dashboard预算数据
    getHeatmapAggregation: () => Promise<{                                  // Heatmap聚合
        dataMap: Map<string, number>;
        stats: { mean: number; stdDev: number };
    }>;

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
    const getCachedAccounts = React.useCallback(async (options?: { includeBalance?: boolean }) => {
        const cacheKey: CacheKey = 'accounts';

        // 检查缓存
        if (!isExpired(cacheKey)) {
            return cacheRef.current[cacheKey]!.data;
        }

        // 缓存过期，重新加载
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
    const getCachedTags = React.useCallback(async () => {
        const cacheKey: CacheKey = 'tags';

        if (!isExpired(cacheKey)) {
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
    const getCachedAllTags = React.useCallback(async () => {
        const cacheKey: CacheKey = 'allTags';

        if (!isExpired(cacheKey)) {
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

    // 获取heatmapAggregation (带缓存，稳定引用) - 复杂聚合计算
    const getCachedHeatmapAggregation = React.useCallback(async () => {
        const cacheKey: CacheKey = 'heatmapAggregation';

        if (!isExpired(cacheKey)) {
            const cachedData = cacheRef.current[cacheKey]!.data;
            // ✅ 防御性检查：确保dataMap是Map对象
            if (cachedData?.dataMap && !(cachedData.dataMap instanceof Map)) {
                console.warn('⚠️ heatmapAggregation cache has non-Map dataMap, reconstructing...', typeof cachedData.dataMap);
                // 如果不是Map，尝试从数组重建
                if (Array.isArray(cachedData.dataMap)) {
                    cachedData.dataMap = new Map(cachedData.dataMap);
                } else {
                    // 数据损坏，重新计算
                    console.error('❌ Invalid dataMap type, forcing recalculation');
                    cacheRef.current[cacheKey] = null; // 清空缓存
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
            const transactions = await getCachedDashboardTransactions();

            const map = new Map<string, number>();
            const values: number[] = [];

            // 按日期聚合净流水
            transactions.forEach((tx: any) => {
                const date = new Date(tx.date);
                const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                // Net amount: income is positive, expense is negative
                const amount = tx.type === 'expense' ? -Math.abs(tx.amount) : (tx.type === 'income' ? tx.amount : 0);

                const current = map.get(dateStr) || 0;
                const next = current + amount;
                map.set(dateStr, next);
            });

            // 收集非零值用于统计
            map.forEach(val => {
                if (val !== 0) values.push(val);
            });

            // 计算均值和标准差
            let mean = 0;
            let stdDev = 0;

            if (values.length > 0) {
                const sum = values.reduce((a, b) => a + b, 0);
                mean = sum / values.length;

                const squareDiffs = values.map(v => Math.pow(v - mean, 2));
                const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
                stdDev = Math.sqrt(avgSquareDiff);
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

        // 2. 立即重新加载
        const promises = keysToRefresh.map(async (key) => {
            switch (key) {
                case 'accounts':
                    return getCachedAccounts();
                case 'tags':
                    return getCachedTags();
                case 'transactions':
                    return getCachedTransactions();
                case 'budgetPlans':
                    return getCachedBudgetPlans();
                case 'periodicTasks': // ✅ 新增
                    return getCachedPeriodicTasks();
                case 'reconciliationIssues': // ✅ 新增
                    return getCachedReconciliationIssues();
                case 'bookkeepingSettings': // ✅ 新增
                    return getCachedBookkeepingSettings();
                case 'allTags': // ✅ 新增
                    return getCachedAllTags();
                case 'currencyRates': // ✅ 新增
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

    const value: BookkeepingCacheContextValue = {
        getAccounts: getCachedAccounts,
        getTags: getCachedTags,
        getAllTags: getCachedAllTags,
        getTransactions: getCachedTransactions,
        getBudgetPlans: getCachedBudgetPlans,
        getPeriodicTasks: getCachedPeriodicTasks,
        getReconciliationIssues: getCachedReconciliationIssues,
        getBookkeepingSettings: getCachedBookkeepingSettings,
        getCurrencyRates: getCachedCurrencyRates,
        getDashboardTransactions: getCachedDashboardTransactions,  // ✅ Dashboard专用流水
        getDashboardBudgetData: getCachedDashboardBudgetData,      // ✅ Dashboard预算数据
        getHeatmapAggregation: getCachedHeatmapAggregation,        // ✅ Heatmap聚合数据
        invalidate,
        invalidateAndRefresh,
        loading,
    };

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
