// 导入相关的类型定义

export interface ParsedTransaction {
    // 基本信息
    date: string;           // ISO格式日期时间
    type: 'income' | 'expense' | 'transfer';
    amount: number;         // 金额（正数）
    category: string;       // 分类/标签
    description?: string;   // 备注

    // 账户信息
    accountName: string;    // 账户名称（用于匹配）
    accountId?: string;     // 验证后填充的账户ID
    currency?: string;      // 币种（从账户获取）

    // 跨币种消费
    nominalAmount?: number;
    nominalCurrency?: string;

    // 划转相关
    toAccountName?: string; // 目标账户名称
    toAccountId?: string;   // 目标账户ID
    toAmount?: number;      // 目标金额

    // 元信息（用于错误提示）
    lineNumber?: number;    // 源文件行号
    rawText?: string;       // 原始文本
    rawData?: any;          // 原始数据
}

export interface ValidationError {
    line: number;
    field: string;
    value: any;
    reason: string;
    suggestion?: string;
}

export interface ValidationResult {
    valid: ParsedTransaction[];
    errors: ValidationError[];
}

export interface DuplicateMatch {
    importedIndex: number;      // 本次导入的第几条
    importedTransaction: ParsedTransaction;
    existingTransaction: any;   // 已存在的交易
    matchScore: number;         // 匹配分数 0-1
    matchedFields: string[];    // 匹配的字段
}

export interface ImportReport {
    summary: {
        totalImported: number;
        dateRange: { start: string; end: string };
        accounts: { name: string; count: number; totalAmount: number }[];
        categories: { name: string; count: number }[];
        newTagsCreated: string[];
    };
    duplicateWarnings: DuplicateMatch[];
}

export interface ImportResult {
    success: boolean;
    imported?: number;
    report?: ImportReport;
    errors?: ValidationError[];
}
