/**
 * [性质]: [配置] 全局记账设置
 * [Input]: Supabase (bookkeeping_settings table)
 * [Output]: getBookkeepingSettings, updateBookkeepingSettings
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */

import { supabase } from '@/lib/supabase/client';

/**
 * 获取系统设置
 */
export async function getBookkeepingSettings() {
    const { data, error } = await supabase.from('bookkeeping_settings').select('*').single();
    if (error && error.code !== 'PGRST116') throw error;

    // 返回默认值如果没有设置
    if (!data) {
        return {
            decimal_places: 2,
            thousand_separator: true,
            default_currency: 'CNY',
            expense_color: '#ef4444',
            income_color: '#22c55e',
            transfer_color: '#0ea5e9',
            // 校准设置
            calibration_reminder_enabled: true,
            calibration_interval_days: 30,
        };
    }

    return data;
}

/**
 * 更新系统设置
 */
export async function updateBookkeepingSettings(settings: any) {
    const { data, error } = await supabase
        .from('bookkeeping_settings')
        .upsert({ ...settings, id: true })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * 更新颜色设置
 */
export async function updateBookkeepingColors(data: {
    expense_color: string;
    income_color: string;
    transfer_color: string;
}) {
    const { data: updated, error } = await supabase
        .from('bookkeeping_settings')
        .update({
            expense_color: data.expense_color,
            income_color: data.income_color,
            transfer_color: data.transfer_color
        })
        .eq('id', true as any)
        .select()
        .single();

    if (error) throw error;
    return updated;
}

/**
 * 更新校准提醒设置
 */
export async function updateCalibrationSettings(data: {
    calibration_reminder_enabled: boolean;
    calibration_interval_days: number;
}) {
    const { data: updated, error } = await supabase
        .from('bookkeeping_settings')
        .update({
            calibration_reminder_enabled: data.calibration_reminder_enabled,
            calibration_interval_days: data.calibration_interval_days
        })
        .eq('id', true as any)
        .select()
        .single();

    if (error) throw error;
    return updated;
}
