import { ParsedTransaction, ImportReport, DuplicateMatch } from './types';

/**
 * 生成导入报告
 * 
 * 统计信息包括：
 * - 总交易数
 * - 时间范围
 * - 按账户统计（交易笔数、总金额）
 * - 按分类统计（交易笔数）
 * - 新创建的标签
 * - 疑似重复交易列表
 */
export function generateImportReport(
    transactions: ParsedTransaction[],
    duplicates: DuplicateMatch[],
    newTagsCreated: string[]
): ImportReport {
    // 统计账户维度
    const accountStats = new Map<string, { count: number; total: number }>();

    transactions.forEach(tx => {
        const key = tx.accountName;
        const current = accountStats.get(key) || { count: 0, total: 0 };
        accountStats.set(key, {
            count: current.count + 1,
            total: current.total + tx.amount
        });
    });

    // 统计分类维度
    const categoryStats = new Map<string, number>();

    transactions.forEach(tx => {
        const count = categoryStats.get(tx.category) || 0;
        categoryStats.set(tx.category, count + 1);
    });

    // 计算时间范围
    const dates = transactions.map(t => new Date(t.date).getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    const dateRange = {
        start: minDate.toISOString().split('T')[0],
        end: maxDate.toISOString().split('T')[0]
    };

    // 构建报告
    return {
        summary: {
            totalImported: transactions.length,
            dateRange,
            accounts: Array.from(accountStats.entries())
                .map(([name, stats]) => ({
                    name,
                    count: stats.count,
                    totalAmount: stats.total
                }))
                .sort((a, b) => b.count - a.count), // 按交易笔数降序
            categories: Array.from(categoryStats.entries())
                .map(([name, count]) => ({
                    name,
                    count
                }))
                .sort((a, b) => b.count - a.count), // 按交易笔数降序
            newTagsCreated: newTagsCreated.sort()
        },
        duplicateWarnings: duplicates
    };
}
