import { ParsedTransaction } from './types';

/**
 * 解析灵活的日期时间格式
 */
function parseFlexibleDate(input: string): string | null {
    if (!input) return null;

    let normalized = input.trim();

    // 处理中文日期格式 "2025年10月8日 9:00" 或 "2025年10月8日9：00"
    normalized = normalized
        .replace(/年/g, '-')
        .replace(/月/g, '-')
        .replace(/日/g, ' ')
        .replace(/：/g, ':') // 中文冒号转英文
        .replace(/\s+/g, ' '); // 多个空格合并为一个

    try {
        const date = new Date(normalized);
        if (isNaN(date.getTime())) {
            return null;
        }
        return date.toISOString();
    } catch {
        return null;
    }
}

/**
 * 映射类型文本到枚举
 */
function mapTypeToEnum(typeText: string): 'income' | 'expense' | 'transfer' {
    const text = typeText.trim().toLowerCase();

    if (text.includes('收入') || text === '收') {
        return 'income';
    }
    if (text.includes('划转') || text.includes('转账') || text === '转') {
        return 'transfer';
    }
    // 默认支出
    return 'expense';
}

/**
 * 解析自然语言格式的交易文本
 * 
 * 格式：日期 时间; 类型; 账户; 金额; 分类; 备注; [名义金额]; [名义币种]; [目标账户]; [目标金额]
 * 
 * 示例：
 * - 2025-10-08 09:00; 支出; 招商银行; 900; 交通; 买火车票
 * - 2025-10-09 14:30; 收入; 支付宝; 5000; 工资; 月薪
 * - 2025-10-10; 划转; 招商银行; 910; 划转; 兑换; ; ; 恒生银行; 1000
 */
export function parseNaturalLanguageText(text: string): ParsedTransaction[] {
    const lines = text.split('\n').filter(line => line.trim());
    const transactions: ParsedTransaction[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
            // 分割字段（使用分号分隔）
            const parts = line.split(';').map(p => p.trim());

            if (parts.length < 5) {
                // 字段不足，跳过
                continue;
            }

            // 解析日期时间（第一个字段）
            const date = parseFlexibleDate(parts[0]);
            if (!date) {
                continue; // 无效日期，跳过
            }

            // 解析类型（第二个字段）
            const type = mapTypeToEnum(parts[1]);

            // 账户名称（第三个字段）
            const accountName = parts[2];
            if (!accountName) {
                continue; // 账户名为空，跳过
            }

            // 金额（第四个字段）
            const amount = parseFloat(parts[3]);
            if (isNaN(amount) || amount <= 0) {
                continue; // 无效金额，跳过
            }

            // 分类（第五个字段）
            const category = parts[4] || '其他';

            // 备注（第六个字段，可选）
            const description = parts[5] || '';

            // 名义金额（第七个字段，可选）
            const nominalAmount = parts[6] ? parseFloat(parts[6]) : undefined;

            // 名义币种（第八个字段，可选）
            const nominalCurrency = parts[7] || undefined;

            // 目标账户（第九个字段，划转时使用）
            const toAccountName = parts[8] || undefined;

            // 目标金额（第十个字段，划转时使用）
            const toAmount = parts[9] ? parseFloat(parts[9]) : undefined;

            transactions.push({
                date,
                type,
                accountName,
                amount,
                category,
                description,
                nominalAmount: nominalAmount && !isNaN(nominalAmount) ? nominalAmount : undefined,
                nominalCurrency,
                toAccountName,
                toAmount: toAmount && !isNaN(toAmount) ? toAmount : undefined,
                lineNumber: i + 1,
                rawText: line,
            });

        } catch (error) {
            // 解析失败，跳过这一行
            console.warn(`跳过第 ${i + 1} 行: ${error}`);
            continue;
        }
    }

    return transactions;
}
