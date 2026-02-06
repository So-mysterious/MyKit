/**
 * [性质]: [常量] 全局常量定义
 * [Input]: 无
 * [Output]: 账户类型/币种/ID常量对象
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
// ============================================================================
// MyKit 常量定义
// 版本: 2.0
// ============================================================================

// ----------------------------------------------------------------------------
// 账户类型
// ----------------------------------------------------------------------------

/** 账户分类 */
export const ACCOUNT_CLASSES = {
  real: '真实账户',
  nominal: '虚账户',
} as const;

export type AccountClass = keyof typeof ACCOUNT_CLASSES;

/** 账户大类 */
export const ACCOUNT_TYPES = {
  asset: '资产',
  liability: '负债',
  income: '收入',
  expense: '费用',
  equity: '权益',
} as const;

export type AccountType = keyof typeof ACCOUNT_TYPES;

/** 账户细分类型 */
export const ACCOUNT_SUBTYPES = {
  // 资产类
  cash: '现金',
  checking: '活期',
  savings: '储蓄',
  investment: '投资',
  receivable: '应收款',
  // 负债类
  credit_card: '信用卡',
  loan: '贷款',
  payable: '应付款',
} as const;

export type AccountSubtype = keyof typeof ACCOUNT_SUBTYPES;

// 兼容旧版代码（已废弃，请使用新的类型）
/** @deprecated 使用 ACCOUNT_SUBTYPES 代替 */
export const ACCOUNTS_TYPES = {
  Checking: '储蓄/活期',
  Credit: '信用卡',
  Asset: '投资/理财',
  Wallet: '现金/钱包',
} as const;

// ----------------------------------------------------------------------------
// 系统账户 ID
// ----------------------------------------------------------------------------

/** 期初余额系统账户 ID */
export const OPENING_BALANCE_ACCOUNT_ID = '00000000-0000-0000-0000-000000000006';

// ----------------------------------------------------------------------------
// 币种
// ----------------------------------------------------------------------------

export const CURRENCIES = ['CNY', 'HKD', 'USD', 'USDT', 'EUR', 'GBP', 'JPY'] as const;
export type Currency = typeof CURRENCIES[number];

export const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: '¥',
  HKD: 'HK$',
  USD: '$',
  USDT: '₮',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
};

export const CURRENCY_NAMES: Record<string, string> = {
  CNY: '人民币',
  HKD: '港币',
  USD: '美元',
  USDT: 'USDT',
  EUR: '欧元',
  GBP: '英镑',
  JPY: '日元',
};

// ----------------------------------------------------------------------------
// 交易相关
// ----------------------------------------------------------------------------

/** 交易性质 */
export const TRANSACTION_NATURES = {
  regular: '常规',
  unexpected: '意外',
  periodic: '周期',
} as const;

export type TransactionNature = keyof typeof TRANSACTION_NATURES;

/** 交易关联类型 */
export const TRANSACTION_LINK_TYPES = {
  reimbursement: '代付回款',
  refund: '退款',
  split: '分摊',
  correction: '调账',
} as const;

export type TransactionLinkType = keyof typeof TRANSACTION_LINK_TYPES;

// ----------------------------------------------------------------------------
// 周期频率
// ----------------------------------------------------------------------------

export const FREQUENCIES = {
  daily: '每日',
  weekly: '每周',
  biweekly: '每两周',
  monthly: '每月',
  quarterly: '每季度',
  yearly: '每年',
} as const;

export type Frequency = keyof typeof FREQUENCIES;

// ----------------------------------------------------------------------------
// 快照来源
// ----------------------------------------------------------------------------

export const SNAPSHOT_SOURCES = {
  manual: '手动',
  auto: '自动',
  import: '导入',
} as const;

export type SnapshotSource = keyof typeof SNAPSHOT_SOURCES;

// ----------------------------------------------------------------------------
// 对账状态
// ----------------------------------------------------------------------------

export const RECONCILIATION_STATUSES = {
  open: '待处理',
  resolved: '已解决',
  ignored: '已忽略',
} as const;

export type ReconciliationStatus = keyof typeof RECONCILIATION_STATUSES;

// ----------------------------------------------------------------------------
// 颜色（默认值，实际从数据库读取）
// ----------------------------------------------------------------------------

export const DEFAULT_COLORS = {
  expense: '#ef4444',
  income: '#22c55e',
  transfer: '#0ea5e9',
} as const;

// ----------------------------------------------------------------------------
// 系统账户 ID
// ----------------------------------------------------------------------------

export const SYSTEM_ACCOUNT_IDS = {
  ASSET_ROOT: '00000000-0000-0000-0000-000000000001',
  LIABILITY_ROOT: '00000000-0000-0000-0000-000000000002',
  INCOME_ROOT: '00000000-0000-0000-0000-000000000003',
  EXPENSE_ROOT: '00000000-0000-0000-0000-000000000004',
  EQUITY_ROOT: '00000000-0000-0000-0000-000000000005',
  OPENING_BALANCE: '00000000-0000-0000-0000-000000000006',
} as const;

// ----------------------------------------------------------------------------
// 交易类型推断辅助
// ----------------------------------------------------------------------------

/**
 * 根据 from/to 账户类型推断交易类型
 * @returns 'expense' | 'income' | 'transfer' | 'liability_payment' | 'opening'
 */
export function inferTransactionType(
  fromAccountType: AccountType,
  toAccountType: AccountType
): string {
  // 期初余额
  if (fromAccountType === 'equity') return 'opening';

  // 支出：到费用账户
  if (toAccountType === 'expense') {
    return 'expense';
  }

  // 收入：从收入账户
  if (fromAccountType === 'income') return 'income';

  // 还款：从资产 到 负债（减少负债）
  if (fromAccountType === 'asset' && toAccountType === 'liability') return 'liability_payment';

  // 其他情况视为转账
  return 'transfer';
}

// ----------------------------------------------------------------------------
// 默认汇率
// ----------------------------------------------------------------------------

export const CURRENCY_RATES_DEFAULT: Record<string, Record<string, number>> = {
  CNY: { HKD: 1.09, USD: 0.14, USDT: 0.14 },
  HKD: { CNY: 0.92, USD: 0.13, USDT: 0.13 },
  USD: { CNY: 7.25, HKD: 7.78, USDT: 1.0 },
  USDT: { CNY: 7.25, HKD: 7.78, USD: 1.0 },
};

/**
 * 获取交易类型的显示名称
 */
export function getTransactionTypeName(type: string): string {
  const names: Record<string, string> = {
    expense: '支出',
    income: '收入',
    transfer: '转账',
    liability_payment: '还款',
    opening: '期初余额',
  };
  return names[type] || type;
}
