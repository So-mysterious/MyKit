import * as XLSX from 'xlsx';
import { ParsedTransaction } from './types';

// 字段映射配置
const FIELD_MAPPINGS = {
    date: ['交易时间', '日期', '交易创建时间', '记账时间', '时间'],
    type: ['交易类型', '收/支', '类型', '收支类型'],
    amount: ['金额(元)', '金额', '交易金额', '金额（元）'],
    description: ['商品', '商品说明', '备注', '交易对方', '说明'],
    paymentMethod: ['支付方式', '收/付款方式', '账户', '付款方式'],
    status: ['当前状态', '交易状态', '状态'],
};

// 需要忽略的字段
const IGNORE_FIELDS = [
    '交易单号', '商户单号', '交易号', '订单号',
    '商户订单号', '交易流水号', '支付流水号'
];

/**
 * 检测表头行位置
 */
function detectHeaderRow(rows: any[][]): number {
    const headerKeywords = ['交易时间', '日期', '时间', '金额', '收/支', '类型'];

    for (let i = 0; i < Math.min(20, rows.length); i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        // 检查这一行是否包含关键表头字段
        const matchCount = headerKeywords.filter(keyword =>
            row.some(cell => String(cell || '').includes(keyword))
        ).length;

        // 如果匹配到 2 个以上关键字段，则认为是表头行
        if (matchCount >= 2) {
            return i;
        }
    }

    return -1; // 未找到表头
}

/**
 * 建立字段映射（表头列名 -> 字段名）
 */
function buildFieldMapping(headerRow: any[]): Map<string, number> {
    const mapping = new Map<string, number>();

    headerRow.forEach((cell, index) => {
        const cellStr = String(cell || '').trim();

        // 检查每个字段类型
        for (const [fieldName, possibleNames] of Object.entries(FIELD_MAPPINGS)) {
            if (possibleNames.some(name => cellStr.includes(name))) {
                mapping.set(fieldName, index);
                break;
            }
        }
    });

    return mapping;
}

/**
 * 推断交易类型
 */
function inferTransactionType(
    typeField: string | undefined,
    amountField: string | undefined
): 'income' | 'expense' | 'transfer' {
    const typeStr = String(typeField || '').toLowerCase();
    const amountStr = String(amountField || '');

    // 检查收/支字段
    if (amountStr.includes('收入') || amountStr.includes('收') || amountStr === '收款') {
        return 'income';
    }
    if (amountStr.includes('支出') || amountStr.includes('支')) {
        return 'expense';
    }

    // 检查交易类型字段
    if (typeStr.includes('收款') || typeStr.includes('转入') || typeStr.includes('退款')) {
        return 'income';
    }
    if (typeStr.includes('划转') || typeStr.includes('转账')) {
        return 'transfer';
    }

    // 默认支出
    return 'expense';
}

/**
 * 解析金额字符串
 */
function parseAmount(value: any): number | null {
    if (typeof value === 'number') {
        return Math.abs(value);
    }

    const str = String(value || '').trim();
    if (!str) return null;

    // 移除货币符号和千分位分隔符
    const cleaned = str.replace(/[¥$￥,，]/g, '');
    const num = parseFloat(cleaned);

    return isNaN(num) ? null : Math.abs(num);
}

/**
 * 解析日期字符串（支持多种格式）
 */
function parseFlexibleDate(value: any): string | null {
    if (!value) return null;

    let dateStr = String(value).trim();

    // 处理中文日期格式 "2025年10月8日 9:00"
    dateStr = dateStr
        .replace(/年/g, '-')
        .replace(/月/g, '-')
        .replace(/日/g, ' ')
        .replace(/：/g, ':'); // 中文冒号转英文

    try {
        // 尝试解析
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            return null;
        }

        return date.toISOString();
    } catch {
        return null;
    }
}

/**
 * 检查是否是尾部统计行或空行
 */
function shouldSkipRow(row: any[], firstCellValue: any): boolean {
    // 空行
    if (!row || row.every(cell => !cell)) {
        return true;
    }

    // 统计行
    const firstStr = String(firstCellValue || '');
    if (firstStr.includes('总计') ||
        firstStr.includes('合计') ||
        firstStr.includes('收入:') ||
        firstStr.includes('支出:')) {
        return true;
    }

    return false;
}

/**
 * 解析单行数据
 */
function parseRow(
    row: any[],
    fieldMap: Map<string, number>,
    lineNumber: number
): ParsedTransaction | null {
    const get = (field: string) => {
        const index = fieldMap.get(field);
        return index !== undefined ? row[index] : undefined;
    };

    // 检查是否应该跳过
    if (shouldSkipRow(row, row[0])) {
        return null;
    }

    // 提取字段
    const dateValue = get('date');
    const amountValue = get('amount');
    const typeValue = get('type');
    const descValue = get('description');
    const paymentValue = get('paymentMethod');
    const statusValue = get('status');

    // 解析日期
    const date = parseFlexibleDate(dateValue);
    if (!date) {
        return null; // 没有有效日期，跳过
    }

    // 解析金额
    const amount = parseAmount(amountValue);
    if (amount === null || amount === 0) {
        return null; // 没有有效金额，跳过
    }

    // 检查状态（跳过已退款等）
    const status = String(statusValue || '');
    if (status.includes('已退款') || status.includes('已关闭') || status === '已删除') {
        return null;
    }

    // 推断交易类型
    const type = inferTransactionType(typeValue, amountValue);

    // 提取账户名称（从支付方式）
    const accountName = String(paymentValue || '').trim() || '未知账户';

    // 提取描述
    const description = String(descValue || '').trim();

    // 推断分类（先设置为描述，后续会通过关键词推断或用户手动设置）
    let category = '其他';

    return {
        date,
        type,
        amount,
        category,
        description,
        accountName,
        lineNumber,
        rawData: row,
    };
}

/**
 * 解析XLS文件
 */
export async function parseXLSFile(file: File): Promise<ParsedTransaction[]> {
    try {
        // 读取文件
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });

        // 获取第一个工作表
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
            throw new Error('Excel 文件为空');
        }

        const sheet = workbook.Sheets[firstSheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: '',
            raw: false  // 将所有值转换为字符串，便于处理
        });

        if (rows.length === 0) {
            throw new Error('工作表为空');
        }

        // 检测表头行
        const headerRowIndex = detectHeaderRow(rows);
        if (headerRowIndex < 0) {
            throw new Error('无法识别表头，请确保文件包含"交易时间"、"金额"等字段');
        }

        // 建立字段映射
        const fieldMap = buildFieldMapping(rows[headerRowIndex]);

        // 检查必需字段
        if (!fieldMap.has('date') && !fieldMap.has('amount')) {
            throw new Error('缺少必需字段，请确保文件包含日期和金额列');
        }

        // 解析数据行
        const transactions: ParsedTransaction[] = [];

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            const parsed = parseRow(row, fieldMap, i + 1);

            if (parsed) {
                transactions.push(parsed);
            }
        }

        if (transactions.length === 0) {
            throw new Error('没有找到有效的交易记录');
        }

        return transactions;

    } catch (error: any) {
        throw new Error(`解析 Excel 文件失败: ${error.message}`);
    }
}
