/**
 * [性质]: [功能] 每日打卡与全局刷新
 * [Input]: Periodic Tasks, Calibrations, Settings
 * [Output]: handleDailyCheckin (打卡入口), runGlobalRefresh (刷新入口), checkCalibrationReminders (校准提醒)
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */

import { supabase } from '@/lib/supabase/client';
import { executePeriodicTasks } from './periodic';
import { getBookkeepingSettings } from './settings';

/**
 * 获取今日打卡状态
 */
export async function getTodayCheckin() {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
        .from('daily_checkins')
        .select('*')
        .eq('check_date', today)
        .maybeSingle();

    if (error) throw error;
    const checkinData = data as any;
    return {
        checked: !!data,
        checkedAt: checkinData?.created_at || null,
        data: data
    };
}

/**
 * 记录今日打卡
 */
export async function recordCheckin() {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
        .from('daily_checkins')
        .upsert({ check_date: today }, { onConflict: 'check_date' })
        .select()
        .single();

    if (error) throw error;

    await executePeriodicTasks();

    return data;
}

/**
 * 检查需要强制校准的账户
 * 
 * 返回距离上次校准已超过设定天数的账户列表
 * 用于在打卡/全局刷新时弹出强制校准弹窗
 */
export async function checkCalibrationReminders(): Promise<{
    needsCalibration: Array<{
        accountId: string;
        accountName: string;
        currency: string | null;
        lastCalibrationDate: string | null;
        daysSinceCalibration: number;
    }>;
}> {
    const settings = (await getBookkeepingSettings()) as any;

    // 如果未启用强制校准提醒，返回空列表
    if (!settings?.calibration_reminder_enabled) {
        return { needsCalibration: [] };
    }

    const intervalDays = settings.calibration_interval_days || 30;
    const today = new Date();
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - intervalDays);
    const cutoffISO = cutoffDate.toISOString();

    // 获取所有活跃的实账户（叶子节点）
    const { data: accounts, error: accountsError } = await supabase
        .from('accounts')
        .select('id, name, currency')
        .eq('is_active', true)
        .eq('is_group', false)
        .eq('account_class', 'real');

    if (accountsError) throw accountsError;

    const needsCalibration: Array<{
        accountId: string;
        accountName: string;
        currency: string | null;
        lastCalibrationDate: string | null;
        daysSinceCalibration: number;
    }> = [];

    for (const account of accounts || []) {
        const { data: lastCalibration } = await supabase
            .from('calibrations')
            .select('date')
            .eq('account_id', account.id)
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle();

        let needsIt = false;
        let daysSince = 0;
        let lastDate: string | null = null;

        if (!lastCalibration) {
            // 从未校准过
            needsIt = true;
            daysSince = Infinity;
        } else {
            lastDate = lastCalibration.date;
            const lastCalibrationDate = new Date(lastCalibration.date);
            daysSince = Math.floor((today.getTime() - lastCalibrationDate.getTime()) / (1000 * 60 * 60 * 24));
            needsIt = daysSince >= intervalDays;
        }

        if (needsIt) {
            needsCalibration.push({
                accountId: account.id,
                accountName: account.name,
                currency: account.currency,
                lastCalibrationDate: lastDate,
                daysSinceCalibration: daysSince === Infinity ? -1 : daysSince, // -1 表示从未校准
            });
        }
    }

    // 按照 daysSinceCalibration 降序排序（最久未校准的排前面）
    needsCalibration.sort((a, b) => {
        if (a.daysSinceCalibration === -1) return -1;
        if (b.daysSinceCalibration === -1) return 1;
        return b.daysSinceCalibration - a.daysSinceCalibration;
    });

    return { needsCalibration };
}

/**
 * 全局刷新
 */
export async function runGlobalRefresh(): Promise<{
    periodicTasks: any;
    calibrationReminders: any;
}> {
    const periodicResult = await executePeriodicTasks();
    const calibrationResult = await checkCalibrationReminders();

    return {
        periodicTasks: periodicResult,
        calibrationReminders: calibrationResult,
    };
}

/**
 * 每日打卡入口
 */
export async function handleDailyCheckin(): Promise<{
    isFirstCheckin: boolean;
    refreshResult: any;
}> {
    const today = new Date().toISOString().split('T')[0];

    const { data: existing } = await supabase
        .from('daily_checkins')
        .select('id')
        .eq('check_date', today)
        .maybeSingle();

    const isFirstCheckin = !existing;

    await recordCheckin();

    const refreshResult = await runGlobalRefresh();

    return {
        isFirstCheckin,
        refreshResult,
    };
}
