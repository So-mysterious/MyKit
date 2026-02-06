/**
 * [性质]: [工具] 周期任务常量与辅助函数
 * [Input]: None
 * [Output]: Utils / Constants
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */

import { addDays, addWeeks, addMonths, addYears } from "date-fns";

// ============================================================================
// 类型定义
// ============================================================================

/** 周期任务表单状态（复式记账模式） */
export interface PeriodicTaskFormState {
    fromAccountId: string;      // 转出账户（必填）
    toAccountId: string;        // 转入账户（必填）
    amount: string;             // 金额（正数）
    fromAmount: string;         // 跨币种：转出金额
    toAmount: string;           // 跨币种：转入金额
    description: string;        // 备注
    frequency: string;          // 周期
    customDays: string;         // 自定义天数
    firstRunDate: string;       // 首次执行日期
    // 新增字段
    location: string;           // 发生地
    projectId: string;          // 项目 ID
    isStarred: boolean;         // 重要标记
    needsReview: boolean;       // 待核对标记
}

/** 账户信息（简化版，用于选择器） */
export interface AccountOption {
    id: string;
    name: string;
    currency: string;
    type?: string;
    parent_id?: string | null;
}

/** 项目选项 */
export interface ProjectOption {
    id: string;
    name: string;
}

// ============================================================================
// 常量
// ============================================================================

/** 周期选项 */
export const FREQUENCY_OPTIONS = [
    { value: "daily", label: "每天" },
    { value: "weekly", label: "每周" },
    { value: "biweekly", label: "每两周" },
    { value: "monthly", label: "每月" },
    { value: "quarterly", label: "每季度" },
    { value: "yearly", label: "每年" },
    { value: "custom", label: "自定义天数" },
] as const;

/** 周期显示名称映射 */
export const FREQUENCY_LABELS: Record<string, string> = {
    daily: "每天",
    weekly: "每周",
    biweekly: "每两周",
    monthly: "每月",
    quarterly: "每季度",
    yearly: "每年",
    custom: "自定义",
};

/** 默认表单状态 */
export const DEFAULT_FORM_STATE: PeriodicTaskFormState = {
    fromAccountId: "",
    toAccountId: "",
    amount: "",
    fromAmount: "",
    toAmount: "",
    description: "",
    frequency: "monthly",
    customDays: "30",
    firstRunDate: new Date().toISOString().split("T")[0],
    location: "",
    projectId: "",
    isStarred: false,
    needsReview: false,
};

/** 币种符号映射 */
export const CURRENCY_SYMBOLS: Record<string, string> = {
    CNY: "¥",
    HKD: "$",
    USD: "$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
};

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 获取币种符号
 */
export function getCurrencySymbol(currency: string | null | undefined): string {
    if (!currency) return "¥";
    return CURRENCY_SYMBOLS[currency] || currency;
}

/**
 * 计算下一次执行日期
 * @param firstRunDate 首次执行日期
 * @param frequency 周期类型
 * @param customDays 自定义天数（当 frequency 为 custom 时）
 */
export function calculateNextRunDate(
    firstRunDate: string,
    frequency: string,
    customDays?: number
): Date {
    const first = new Date(firstRunDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 如果首次执行日期在今天或之后，直接返回首次执行日期
    if (first >= today) {
        return first;
    }

    // 根据周期计算下一次执行日期
    let next = new Date(first);

    const getNextDate = (current: Date): Date => {
        switch (frequency) {
            case "daily":
                return addDays(current, 1);
            case "weekly":
                return addWeeks(current, 1);
            case "biweekly":
                return addWeeks(current, 2);
            case "monthly":
                return addMonths(current, 1);
            case "quarterly":
                return addMonths(current, 3);
            case "yearly":
                return addYears(current, 1);
            case "custom":
                return addDays(current, customDays || 30);
            default:
                return addMonths(current, 1);
        }
    };

    // 循环计算直到找到下一个未来日期
    while (next < today) {
        next = getNextDate(next);
    }

    return next;
}

/**
 * 格式化周期显示
 */
export function formatFrequency(frequency: string, customDays?: number): string {
    if (frequency.startsWith("custom_")) {
        const days = frequency.replace("custom_", "");
        return `每 ${days} 天`;
    }
    if (frequency === "custom" && customDays) {
        return `每 ${customDays} 天`;
    }
    return FREQUENCY_LABELS[frequency] || frequency;
}

/**
 * 解析 frequency 字符串
 * @returns { frequency, customDays }
 */
export function parseFrequency(rawFrequency: string): { frequency: string; customDays: string } {
    if (rawFrequency.startsWith("custom_")) {
        return {
            frequency: "custom",
            customDays: rawFrequency.replace("custom_", ""),
        };
    }
    return {
        frequency: rawFrequency,
        customDays: "30",
    };
}

/**
 * 编码 frequency（用于保存）
 */
export function encodeFrequency(frequency: string, customDays: string): string {
    if (frequency === "custom") {
        return `custom_${customDays}`;
    }
    return frequency;
}

/**
 * 推断交易类型（基于账户类型）
 */
export function inferTransactionType(
    fromAccountType: string | undefined,
    toAccountType: string | undefined
): "expense" | "income" | "transfer" {
    const isFromReal = fromAccountType === "asset" || fromAccountType === "liability";
    const isToReal = toAccountType === "asset" || toAccountType === "liability";

    if (isFromReal && !isToReal && toAccountType === "expense") {
        return "expense";
    }
    if (!isFromReal && isToReal && fromAccountType === "income") {
        return "income";
    }
    if (isFromReal && isToReal) {
        return "transfer";
    }
    // 默认为支出
    return "expense";
}
