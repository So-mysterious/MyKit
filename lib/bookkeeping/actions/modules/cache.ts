/**
 * [性质]: [工具] 统计缓存管理
 * [Input]: Supabase (statistics_cache table)
 * [Output]: invalidateCache, getCachedData, setCachedData
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */

import { supabase } from '@/lib/supabase/client';

/**
 * 使特定统计缓存失效
 * @param options 失效范围
 */
export async function invalidateCache(options: {
    accountId?: string;
    cacheType?: string;
    global?: boolean;
}) {
    const { accountId, cacheType, global = false } = options;

    let query = supabase.from('statistics_cache').update({ valid_until: new Date().toISOString() });

    if (global) {
        query = query.is('account_id', null);
    } else if (accountId) {
        query = query.eq('account_id', accountId);
    }

    if (cacheType) {
        query = query.eq('cache_type', cacheType);
    }

    await query;
}

/**
 * 获取缓存数据
 */
export async function getCachedData<T>(cacheKey: string): Promise<T | null> {
    const { data: cached } = await supabase
        .from('statistics_cache')
        .select('*')
        .eq('id', cacheKey)
        .single();

    const cacheRow = cached as any;
    if (cacheRow && cacheRow.valid_until && new Date(cacheRow.valid_until) > new Date()) {
        return (cacheRow.data as unknown) as T;
    }

    return null;
}

/**
 * 设置缓存数据
 */
export async function setCachedData(
    cacheKey: string,
    data: any,
    options?: {
        accountId?: string;
        cacheType?: string;
        ttlMs?: number;
    }
) {
    const { accountId, cacheType, ttlMs = 3600000 } = options || {};

    await supabase.from('statistics_cache').upsert({
        id: cacheKey,
        account_id: accountId || null,
        cache_type: cacheType || 'general',
        data: data as any,
        computed_at: new Date().toISOString(),
        valid_until: new Date(Date.now() + ttlMs).toISOString()
    });
}
