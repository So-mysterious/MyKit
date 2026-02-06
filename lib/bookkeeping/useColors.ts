/**
 * [性质]: [Hooks] 统一颜色管理 Hook
 * [Input]: useBookkeepingCache
 * [Output]: useBookkeepingColors (颜色配置)
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { useBookkeepingCache } from "./cache/BookkeepingCacheProvider";

export interface BookkeepingColors {
  expense: string;
  income: string;
  transfer: string;
}

const DEFAULT_COLORS: BookkeepingColors = {
  expense: "#ef4444",
  income: "#22c55e",
  transfer: "#0ea5e9",
};

/**
 * 获取记账模块的全局颜色配置
 * 用于统一管理收入、支出、划转的颜色
 * ✅ 使用缓存
 */
export function useBookkeepingColors() {
  const cache = useBookkeepingCache(); // ✅ 使用缓存
  const [colors, setColors] = React.useState<BookkeepingColors>(DEFAULT_COLORS);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    cache.getBookkeepingSettings() // ✅ 从缓存获取
      .then((settings) => {
        setColors({
          expense: settings.expense_color,
          income: settings.income_color,
          transfer: settings.transfer_color,
        });
      })
      .catch((err) => {
        console.error("Failed to load bookkeeping colors:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [cache.getBookkeepingSettings]); // ✅ 稳定函数引用

  return { colors, loading };
}

/**
 * 根据交易类型获取对应颜色
 */
export function getColorByType(
  colors: BookkeepingColors,
  type: "expense" | "income" | "transfer"
): string {
  return colors[type] || DEFAULT_COLORS[type];
}

