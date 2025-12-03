import { isSameDay } from 'date-fns';
import { ParsedTransaction, DuplicateMatch } from './types';
import { TransactionRow } from '@/types/database';

/**
 * 检测疑似重复的交易
 * 
 * 基于多字段匹配度检测：
 * - 日期（同一天）
 * - 账户
 * - 金额（精确匹配）
 * - 类型
 * - 分类（可选）
 * 
 * 匹配度 >= 75% 视为疑似重复
 */
export async function detectDuplicates(
    transactions: ParsedTransaction[],
    getExistingTransactions: (startDate: string, endDate: string) => Promise<TransactionRow[]>
): Promise<DuplicateMatch[]> {
    if (transactions.length === 0) {
        return [];
    }

    const duplicates: DuplicateMatch[] = [];

    // 获取导入数据的时间范围
    const dates = transactions.map(t => new Date(t.date).getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    // 获取该时间范围内的所有现有交易
    const existing = await getExistingTransactions(
        minDate.toISOString(),
        maxDate.toISOString()
    );

    // 对每条导入交易，检查是否有重复
    for (const [index, tx] of transactions.entries()) {
        for (const existingTx of existing) {
            let matchCount = 0;
            let totalFields = 0;
            const matchedFields: string[] = [];

            // 1. 日期匹配（同一天）
            totalFields++;
            const txDate = new Date(tx.date);
            const existingDate = new Date(existingTx.date);

            if (isSameDay(txDate, existingDate)) {
                matchCount++;
                matchedFields.push('日期');
            }

            // 2. 账户匹配
            totalFields++;
            if (tx.accountId === existingTx.account_id) {
                matchCount++;
                matchedFields.push('账户');
            }

            // 3. 金额匹配（精确到分）
            totalFields++;
            const txAmount = Math.abs(tx.amount);
            const existingAmount = Math.abs(existingTx.amount);

            if (Math.abs(txAmount - existingAmount) < 0.01) {
                matchCount++;
                matchedFields.push('金额');
            }

            // 4. 类型匹配
            totalFields++;
            if (tx.type === existingTx.type) {
                matchCount++;
                matchedFields.push('类型');
            }

            // 5. 分类匹配（可选字段）
            if (tx.category && existingTx.category) {
                totalFields++;
                if (tx.category === existingTx.category) {
                    matchCount++;
                    matchedFields.push('分类');
                }
            }

            // 计算匹配分数
            const matchScore = matchCount / totalFields;

            // 匹配度 >= 75% 视为疑似重复
            if (matchScore >= 0.75) {
                duplicates.push({
                    importedIndex: index,
                    importedTransaction: tx,
                    existingTransaction: existingTx,
                    matchScore,
                    matchedFields
                });
                break; // 找到一个重复就够了，不需要继续匹配
            }
        }
    }

    return duplicates;
}
