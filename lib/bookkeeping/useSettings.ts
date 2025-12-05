"use client";

import * as React from "react";
import { useBookkeepingCache } from "./cache/BookkeepingCacheProvider";

export interface BookkeepingSettings {
  decimalPlaces: number;
  thousandSeparator: boolean;
  defaultCurrency: string;
  autoSnapshotEnabled: boolean;
  snapshotIntervalDays: number;
  snapshotTolerance: number;
}

const DEFAULT_SETTINGS: BookkeepingSettings = {
  decimalPlaces: 2,
  thousandSeparator: true,
  defaultCurrency: "CNY",
  autoSnapshotEnabled: true,
  snapshotIntervalDays: 30,
  snapshotTolerance: 0.01,
};

/**
 * 获取记账模块的全局设置
 * ✅ 使用缓存
 */
export function useBookkeepingSettings() {
  const cache = useBookkeepingCache(); // ✅ 使用缓存
  const [settings, setSettings] = React.useState<BookkeepingSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    cache.getBookkeepingSettings() // ✅ 从缓存获取
      .then((data) => {
        setSettings({
          decimalPlaces: data.decimal_places,
          thousandSeparator: data.thousand_separator,
          defaultCurrency: data.default_currency,
          autoSnapshotEnabled: data.auto_snapshot_enabled,
          snapshotIntervalDays: data.snapshot_interval_days,
          snapshotTolerance: data.snapshot_tolerance,
        });
      })
      .catch((err) => {
        console.error("Failed to load bookkeeping settings:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [cache.getBookkeepingSettings]); // ✅ 稳定函数引用

  return { settings, loading };
}

/**
 * 格式化金额数字
 * @param amount 金额
 * @param settings 设置（可选，不传则使用默认值）
 * @param options 额外选项
 */
export function formatAmount(
  amount: number,
  settings?: Partial<BookkeepingSettings>,
  options?: {
    showSign?: boolean;
    currency?: string;
    showCurrency?: boolean;
  }
): string {
  const decimalPlaces = settings?.decimalPlaces ?? DEFAULT_SETTINGS.decimalPlaces;
  const thousandSeparator = settings?.thousandSeparator ?? DEFAULT_SETTINGS.thousandSeparator;
  const showSign = options?.showSign ?? false;
  const currency = options?.currency ?? settings?.defaultCurrency ?? DEFAULT_SETTINGS.defaultCurrency;
  const showCurrency = options?.showCurrency ?? false;

  // 处理小数位数
  const fixed = Math.abs(amount).toFixed(decimalPlaces);

  // 处理千分位
  let formatted: string;
  if (thousandSeparator) {
    const parts = fixed.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    formatted = parts.join(".");
  } else {
    formatted = fixed;
  }

  // 处理符号
  let result = formatted;
  if (showSign) {
    if (amount > 0) {
      result = "+" + formatted;
    } else if (amount < 0) {
      result = "-" + formatted;
    }
  }

  // 处理货币符号
  if (showCurrency) {
    const currencySymbol = getCurrencySymbol(currency);
    result = currencySymbol + result;
  }

  return result;
}

/**
 * 获取货币符号
 */
export function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    CNY: "¥",
    USD: "$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
    HKD: "HK$",
    TWD: "NT$",
  };
  return symbols[currency] || currency + " ";
}

/**
 * React Hook: 提供格式化金额的函数
 */
export function useAmountFormatter() {
  const { settings, loading } = useBookkeepingSettings();

  const format = React.useCallback(
    (
      amount: number,
      options?: {
        showSign?: boolean;
        currency?: string;
        showCurrency?: boolean;
      }
    ) => {
      return formatAmount(amount, settings, options);
    },
    [settings]
  );

  return { format, settings, loading };
}

