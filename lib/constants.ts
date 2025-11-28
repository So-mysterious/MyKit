// This file should now ideally be deprecated or used for fallbacks only.
// The categories are dynamic now, but we might want to keep these if we need defaults for seeding or fallbacks.
// However, user asked to "fully remove hardcoded tags".
// We'll keep ACCOUNTS_TYPES and CURRENCIES as they are structural/enums, but clear categories.

export const ACCOUNTS_TYPES = {
  Checking: '储蓄/活期',
  Credit: '信用卡',
  Asset: '投资/理财',
  Wallet: '现金/钱包',
} as const;

export type AccountType = keyof typeof ACCOUNTS_TYPES;

export const CURRENCIES = ['CNY', 'HKD', 'USDT', 'USD'] as const;
export type Currency = typeof CURRENCIES[number];

// Fallback colors if DB is empty (optional, can remove if we trust DB always has defaults)
export const DEFAULT_COLORS = {
  expense: '#ef4444',
  income: '#22c55e',
  transfer: '#0ea5e9',
};
