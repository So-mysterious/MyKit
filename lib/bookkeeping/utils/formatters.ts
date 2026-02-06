/**
 * [性质]: [工具] 数据导出逻辑
 * [Input]: XLSX 工具库
 * [Output]: formatTransactionsForExport, exportToFile (导出功能)
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
import * as XLSX from 'xlsx';

/**
 * 导出参数
 */
export interface ExportParams {
    dataType: 'transactions' | 'snapshots';
    accountIds?: string[];
    startDate?: string;
    endDate?: string;
    format: 'csv' | 'xlsx';
}

/**
 * 币种符号映射
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
    'CNY': '¥',
    'USD': '$',
    'EUR': '€',
    'GBP': '£',
    'JPY': '¥',
    'HKD': 'HK$',
    'TWD': 'NT$',
};

/**
 * 格式化金额带币种符号
 */
function formatAmountWithCurrency(amount: number, currency: string): string {
    const symbol = CURRENCY_SYMBOLS[currency] || currency + ' ';
    return `${symbol}${Math.abs(amount).toFixed(2)}`;
}

/**
 * 生成 CSV 文件
 */
function generateCSV(data: any[]): Blob {
    if (data.length === 0) {
        return new Blob([''], { type: 'text/csv' });
    }

    // 获取表头
    const headers = Object.keys(data[0]);

    // 生成 CSV 内容
    const csvRows = [
        headers.join(','), // 表头
        ...data.map(row =>
            headers.map(header => {
                const value = row[header];
                // 处理包含逗号、引号、换行的值
                if (value && (String(value).includes(',') || String(value).includes('"') || String(value).includes('\n'))) {
                    return `"${String(value).replace(/"/g, '""')}"`;
                }
                return value;
            }).join(',')
        )
    ];

    const csvContent = csvRows.join('\n');

    // 添加 BOM 以支持中文
    const BOM = '\uFEFF';
    return new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
}

/**
 * 生成 XLSX 文件
 */
function generateXLSX(data: any[]): Blob {
    // 创建工作簿
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

    // 生成 XLSX 文件
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

    return new Blob([wbout], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
}

/**
 * 格式化流水数据为导出格式
 * 支持划转记录合并：将同一transfer_group_id的两条记录合并为一条
 */
export function formatTransactionsForExport(transactions: any[]): any[] {
    // 用于跟踪已处理的划转组
    const processedTransferGroups = new Set<string>();
    const result: any[] = [];

    // 按transfer_group_id分组
    const transferGroups = new Map<string, any[]>();
    const nonTransfers: any[] = [];

    transactions.forEach(tx => {
        if (tx.type === 'transfer' && tx.transfer_group_id) {
            if (!transferGroups.has(tx.transfer_group_id)) {
                transferGroups.set(tx.transfer_group_id, []);
            }
            transferGroups.get(tx.transfer_group_id)!.push(tx);
        } else {
            nonTransfers.push(tx);
        }
    });

    // 处理非划转交易
    nonTransfers.forEach(tx => {
        const accountName = tx.accounts?.name || tx.account_name || '';
        const currency = tx.accounts?.currency || 'CNY';

        result.push({
            '日期': tx.date ? new Date(tx.date).toISOString().split('T')[0] : '',
            '时间': tx.date ? new Date(tx.date).toTimeString().slice(0, 5) : '',
            '类型': tx.type === 'income' ? '收入' : '支出',
            '账户': accountName,
            '金额': formatAmountWithCurrency(tx.amount || 0, currency),
            '分类': tx.category || '',
            '备注': tx.description || '',
            '名义金额': tx.nominal_amount ? formatAmountWithCurrency(tx.nominal_amount, tx.nominal_currency || 'CNY') : '',
            '名义币种': tx.nominal_currency || '',
        });
    });

    // 处理划转交易（合并）
    transferGroups.forEach((group, groupId) => {
        if (group.length < 2) {
            // 如果组内只有一条记录，按普通交易处理
            const tx = group[0];
            const accountName = tx.accounts?.name || tx.account_name || '';
            const currency = tx.accounts?.currency || 'CNY';

            result.push({
                '日期': tx.date ? new Date(tx.date).toISOString().split('T')[0] : '',
                '时间': tx.date ? new Date(tx.date).toTimeString().slice(0, 5) : '',
                '类型': '划转',
                '账户': accountName,
                '金额': formatAmountWithCurrency(tx.amount || 0, currency),
                '分类': tx.category || '',
                '备注': tx.description || '',
                '名义金额': tx.nominal_amount ? formatAmountWithCurrency(tx.nominal_amount, tx.nominal_currency || 'CNY') : '',
                '名义币种': tx.nominal_currency || '',
            });
        } else {
            // 找到转出和转入的记录
            const outTx = group.find(t => t.amount < 0);
            const inTx = group.find(t => t.amount > 0);

            if (outTx && inTx) {
                const fromAccountName = outTx.accounts?.name || outTx.account_name || '';
                const toAccountName = inTx.accounts?.name || inTx.account_name || '';
                const fromCurrency = outTx.accounts?.currency || 'CNY';
                const toCurrency = inTx.accounts?.currency || 'CNY';

                result.push({
                    '日期': outTx.date ? new Date(outTx.date).toISOString().split('T')[0] : '',
                    '时间': outTx.date ? new Date(outTx.date).toTimeString().slice(0, 5) : '',
                    '类型': '划转',
                    '账户': fromAccountName,
                    '金额': formatAmountWithCurrency(outTx.amount || 0, fromCurrency),
                    '分类': outTx.category || '',
                    '备注': outTx.description || '',
                    '名义金额': outTx.nominal_amount ? formatAmountWithCurrency(outTx.nominal_amount, outTx.nominal_currency || 'CNY') : '',
                    '名义币种': outTx.nominal_currency || '',
                    '目标账户': toAccountName,
                    '目标金额': formatAmountWithCurrency(inTx.amount || 0, toCurrency),
                });
            }
        }
    });

    // 按日期排序
    result.sort((a, b) => {
        const dateA = new Date(a['日期'] + ' ' + a['时间']);
        const dateB = new Date(b['日期'] + ' ' + b['时间']);
        return dateB.getTime() - dateA.getTime();
    });

    return result;
}

/**
 * 格式化快照数据为导出格式
 */
export function formatSnapshotsForExport(snapshots: any[]): any[] {
    return snapshots.map(snap => ({
        '日期': snap.date ? new Date(snap.date).toISOString().split('T')[0] : '',
        '账户': snap.account_name || '',
        '余额': snap.balance || 0,
        '币种': snap.currency || '',
        '快照类型': snap.type === 'Auto' ? '自动' : '手动'
    }));
}

/**
 * 导出数据为文件
 */
export function exportToFile(
    data: any[],
    format: 'csv' | 'xlsx',
    filename: string
): Blob {
    if (format === 'csv') {
        return generateCSV(data);
    } else {
        return generateXLSX(data);
    }
}

/**
 * 触发文件下载
 */
export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
