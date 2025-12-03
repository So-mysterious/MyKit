import { ParsedTransaction, ValidationResult, ValidationError } from './types';
import { AccountRow } from '@/types/database';

/**
 * 验证所有解析的交易
 * 
 * 这是导入前的预检查，确保所有数据都有效
 * 如果有任何错误，将阻止整个导入过程
 */
export async function validateTransactions(
    transactions: ParsedTransaction[],
    accounts: AccountRow[]
): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const valid: ParsedTransaction[] = [];

    // 建立账户名称到账户对象的映射
    const accountMap = new Map(accounts.map(a => [a.name.trim(), a]));

    for (const [index, tx] of transactions.entries()) {
        const lineNum = tx.lineNumber || index + 2; // +2 因为有表头
        let hasError = false;

        // 1. 验证日期
        if (!tx.date) {
            errors.push({
                line: lineNum,
                field: '日期',
                value: tx.date,
                reason: '日期不能为空或格式无效',
                suggestion: '请使用标准日期格式，如: 2025-12-01 或 2025/12/01'
            });
            hasError = true;
        }

        // 2. 验证金额
        if (tx.amount === undefined || tx.amount === null || isNaN(tx.amount) || tx.amount <= 0) {
            errors.push({
                line: lineNum,
                field: '金额',
                value: tx.amount,
                reason: '金额必须是大于0的数字',
                suggestion: '请检查金额格式，确保是有效数字'
            });
            hasError = true;
        }

        // 3. 验证账户名称
        if (!tx.accountName || !tx.accountName.trim()) {
            errors.push({
                line: lineNum,
                field: '账户',
                value: tx.accountName,
                reason: '账户名称不能为空',
                suggestion: '请填写账户名称'
            });
            hasError = true;
        } else {
            // 精确匹配账户（不做模糊匹配）
            const account = accountMap.get(tx.accountName.trim());

            if (!account) {
                errors.push({
                    line: lineNum,
                    field: '账户',
                    value: tx.accountName,
                    reason: `账户 "${tx.accountName}" 不存在于系统中`,
                    suggestion: `请先在账户管理中创建此账户，或将账户名修改为: ${accounts.slice(0, 3).map(a => a.name).join('、')}${accounts.length > 3 ? ' 等' : ''}`
                });
                hasError = true;
            } else {
                // 填充账户信息
                tx.accountId = account.id;
                tx.currency = account.currency;
            }
        }

        // 4. 验证分类
        if (!tx.category || !tx.category.trim()) {
            // 分类为空时使用默认值
            tx.category = '其他';
        }

        // 5. 验证划转类型的特殊字段
        if (tx.type === 'transfer') {
            if (!tx.toAccountName || !tx.toAccountName.trim()) {
                errors.push({
                    line: lineNum,
                    field: '目标账户',
                    value: tx.toAccountName,
                    reason: '划转交易必须指定目标账户',
                    suggestion: '请在目标账户列填写账户名称'
                });
                hasError = true;
            } else {
                const toAccount = accountMap.get(tx.toAccountName.trim());

                if (!toAccount) {
                    errors.push({
                        line: lineNum,
                        field: '目标账户',
                        value: tx.toAccountName,
                        reason: `目标账户 "${tx.toAccountName}" 不存在于系统中`,
                        suggestion: '请先创建此账户'
                    });
                    hasError = true;
                } else {
                    tx.toAccountId = toAccount.id;

                    // 检查不能自转
                    if (tx.accountId === tx.toAccountId) {
                        errors.push({
                            line: lineNum,
                            field: '目标账户',
                            value: tx.toAccountName,
                            reason: '不能从账户转账到自己',
                            suggestion: '请选择不同的目标账户'
                        });
                        hasError = true;
                    }

                    // 如果没有指定目标金额，使用源金额
                    if (!tx.toAmount) {
                        tx.toAmount = tx.amount;
                    }
                }
            }
        }

        // 6. 验证跨币种字段
        if (tx.nominalAmount !== undefined) {
            if (isNaN(tx.nominalAmount) || tx.nominalAmount <= 0) {
                errors.push({
                    line: lineNum,
                    field: '名义金额',
                    value: tx.nominalAmount,
                    reason: '名义金额必须是大于0的数字',
                });
                hasError = true;
            }

            if (!tx.nominalCurrency) {
                errors.push({
                    line: lineNum,
                    field: '名义币种',
                    value: tx.nominalCurrency,
                    reason: '指定了名义金额时，必须指定名义币种',
                });
                hasError = true;
            }
        }

        // 只有没有错误的交易才加入 valid 列表
        if (!hasError) {
            valid.push(tx);
        }
    }

    return { valid, errors };
}
