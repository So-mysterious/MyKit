/**
 * [性质]: [核心] 汇率管理模块
 * [Input]: Supabase (currency_rates), Constants
 * [Output]: getCurrencyRates, convertCurrency
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */

import { supabase } from '@/lib/supabase/client';
import { CURRENCY_RATES_DEFAULT } from '@/lib/constants';

/**
 * 获取实时汇率
 * @returns 汇率映射表
 */
export async function getCurrencyRates(): Promise<Record<string, Record<string, number>>> {
    const { data, error } = await supabase.from('currency_rates').select('*');

    const rates: Record<string, Record<string, number>> = {};

    // 填充默认值
    Object.entries(CURRENCY_RATES_DEFAULT).forEach(([from, targets]) => {
        rates[from] = { ...targets };
    });

    if (!error && (data as any[])) {
        (data as any[]).forEach(row => {
            if (!rates[row.from_currency]) rates[row.from_currency] = {};
            rates[row.from_currency][row.to_currency] = Number(row.rate);
        });
    }

    return rates;
}

/**
 * 转换金额
 * @param amount 原始金额
 * @param from 从什么币种
 * @param to 转换到什么币种
 * @param rates 汇率表（可选）
 */
export async function convertCurrency(
    amount: number,
    from: string,
    to: string,
    rates?: Record<string, Record<string, number>>
): Promise<number> {
    if (from === to) return amount;

    const currentRates = rates || await getCurrencyRates();
    const rate = currentRates[from]?.[to];

    if (!rate) {
        console.warn(`Missing rate for ${from} to ${to}`);
        return amount;
    }

    return amount * rate;
}

/**
 * 获取特定汇率
 */
export async function getCurrencyRate(from: string, to: string): Promise<number> {
    if (from === to) return 1;
    const rates = await getCurrencyRates();
    return rates[from]?.[to] || 1;
}

/**
 * 更新汇率
 */
export async function updateCurrencyRate(from: string, to: string, rate: number) {
    const { data, error } = await supabase
        .from('currency_rates')
        .upsert({
            from_currency: from,
            to_currency: to,
            rate: rate,
            updated_at: new Date().toISOString()
        }, { onConflict: 'from_currency,to_currency' })
        .select()
        .single();

    if (error) throw error;
    return data;
}

