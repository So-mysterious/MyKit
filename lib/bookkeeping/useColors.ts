"use client";

import * as React from "react";
import { getBookkeepingSettings } from "./actions";

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
 */
export function useBookkeepingColors() {
  const [colors, setColors] = React.useState<BookkeepingColors>(DEFAULT_COLORS);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    getBookkeepingSettings()
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
  }, []);

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

