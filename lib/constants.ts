export const TRANSACTION_CATEGORIES = [
  '餐饮',
  '交通',
  '购物',
  '娱乐',
  '居住',
  '医疗',
  '工资',
  '理财',
  '其他'
] as const;

export type TransactionCategory = typeof TRANSACTION_CATEGORIES[number];

export const ACCOUNTS_TYPES = {
  Checking: '储蓄/活期',
  Credit: '信用卡',
  Asset: '投资/理财',
  Wallet: '现金/钱包',
} as const;

export type AccountType = keyof typeof ACCOUNTS_TYPES;

export const CURRENCIES = ['CNY', 'HKD', 'USDT', 'USD'] as const;
export type Currency = typeof CURRENCIES[number];

