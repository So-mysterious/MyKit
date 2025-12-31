import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

// ============================================
// 类型定义
// ============================================

export interface ParsedRow {
    row: number;
    date: string;
    type: '支出' | '收入' | '划转';
    amount: number;
    account: string;
    category: string;
    description: string;
    toAccount: string;
    toAmount: number | null;
    rawData: string[];
}

export interface ValidationError {
    row: number;
    field: string;
    value: string;
    reason: string;
}

export interface ValidTransaction {
    row: number;
    date: string;
    type: 'income' | 'expense' | 'transfer';
    amount: number;
    accountId: string;
    accountName: string;
    category: string;
    description: string;
    toAccountId?: string;
    toAccountName?: string;
    toAmount?: number;
}

export interface DuplicateTransaction extends ValidTransaction {
    matchedWith: 'database' | 'file';
    matchedTxId?: string;
}

export interface ParseResult {
    valid: ValidTransaction[];
    duplicates: DuplicateTransaction[];
    invalid: ParsedRow[];
    errors: ValidationError[];
    totalRows: number;
}

// ============================================
// 标准表头
// ============================================

const STANDARD_HEADERS = ['日期', '类型', '金额', '账户', '分类', '备注', '对方账户', '对方金额'];

// ============================================
// 解析Excel文件
// ============================================

export async function parseStandardExcel(file: File): Promise<ParseResult> {
    // 读取文件
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
        throw new Error('Excel文件为空');
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        raw: false
    });

    if (rows.length < 2) {
        throw new Error('Excel文件至少需要表头和一行数据');
    }

    // 验证表头
    const headerRow = rows[0].map(h => String(h).trim());
    const missingHeaders = STANDARD_HEADERS.filter((h, i) => headerRow[i] !== h);
    if (missingHeaders.length > 0) {
        throw new Error(`表头不匹配，期望: ${STANDARD_HEADERS.join(', ')}`);
    }

    // 获取数据库中的账户和标签
    const [accountsResult, tagsResult] = await Promise.all([
        supabase.from('accounts').select('id, name'),
        supabase.from('bookkeeping_tags').select('name, kind'),
    ]);

    if (accountsResult.error) throw accountsResult.error;
    if (tagsResult.error) throw tagsResult.error;

    const accounts = accountsResult.data || [];
    const tags = tagsResult.data || [];

    const accountMap = new Map(accounts.map(a => [a.name, a.id]));
    const accountIdToName = new Map(accounts.map(a => [a.id, a.name]));
    const tagSet = new Set(tags.map(t => t.name));

    // 获取现有流水用于重复检测（包含category）
    const { data: existingTransactions } = await supabase
        .from('transactions')
        .select('id, date, amount, account_id, category');

    // ✅ 存储现有交易的5个字段用于模糊匹配
    interface ExistingTxFields {
        date: string;      // YYYY-MM-DD
        time: string;      // HH:MM or empty
        amount: number;
        accountId: string;
        category: string;
    }

    const existingTxList: ExistingTxFields[] = (existingTransactions || []).map(tx => {
        const dateObj = new Date(tx.date);
        const dateStr = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
        const hours = dateObj.getUTCHours();
        const minutes = dateObj.getUTCMinutes();
        const timeStr = (hours !== 0 || minutes !== 0) ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` : '';

        return {
            date: dateStr,
            time: timeStr,
            amount: Math.abs(Number(tx.amount)),
            accountId: tx.account_id,
            category: tx.category || '',
        };
    });

    // ✅ 4/5字段匹配检测函数
    function isSuspectedDuplicate(
        newTx: { date: string; time: string; amount: number; accountId: string; category: string },
        existingTx: ExistingTxFields
    ): boolean {
        let matchCount = 0;

        if (newTx.date === existingTx.date) matchCount++;
        if (newTx.time === existingTx.time) matchCount++;
        if (Math.abs(newTx.amount - existingTx.amount) < 0.01) matchCount++;
        if (newTx.accountId === existingTx.accountId) matchCount++;
        if (newTx.category === existingTx.category) matchCount++;

        return matchCount >= 4;
    }

    // 解析数据行
    const result: ParseResult = {
        valid: [],
        duplicates: [],
        invalid: [],
        errors: [],
        totalRows: rows.length - 1,
    };

    // ✅ 文件内重复检测列表（存储已解析的交易用于比对）
    interface FileRowEntry {
        fields: { date: string; time: string; amount: number; accountId: string; category: string };
        tx: ValidTransaction;
        markedAsDuplicate: boolean;
    }
    const fileRowList: FileRowEntry[] = [];

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 1; // Excel行号从1开始，表头是第1行

        // 跳过空行
        if (row.every(cell => !cell || String(cell).trim() === '')) {
            continue;
        }

        // ✅ 使用带错误追踪的解析
        const parseResult = tryParseRow(row, rowNum);

        if (parseResult.error) {
            // 解析失败，记录错误，创建一个基础的ParsedRow用于显示
            result.errors.push({
                row: rowNum,
                field: parseResult.error.field,
                value: parseResult.error.value,
                reason: parseResult.error.reason,
            });
            result.invalid.push({
                row: rowNum,
                date: '',
                type: '支出',
                amount: 0,
                account: String(row[3] || '').trim(),
                category: String(row[4] || '').trim(),
                description: String(row[5] || '').trim(),
                toAccount: String(row[6] || '').trim(),
                toAmount: null,
                rawData: row.map(c => String(c)),
            });
            continue;
        }

        const parsed = parseResult.data!;

        // 验证
        const errors = validateRow(parsed, accountMap, tagSet);

        if (errors.length > 0) {
            result.invalid.push(parsed);
            result.errors.push(...errors);
            continue;
        }

        // 转换为ValidTransaction
        const accountId = accountMap.get(parsed.account)!;
        const typeMap: Record<string, 'income' | 'expense' | 'transfer'> = {
            '收入': 'income',
            '支出': 'expense',
            '划转': 'transfer',
        };

        const validTx: ValidTransaction = {
            row: parsed.row,
            date: parsed.date,
            type: typeMap[parsed.type],
            amount: parsed.amount,
            accountId,
            accountName: parsed.account,
            category: parsed.category,
            description: parsed.description,
        };

        if (parsed.type === '划转' && parsed.toAccount) {
            validTx.toAccountId = accountMap.get(parsed.toAccount);
            validTx.toAccountName = parsed.toAccount;
            validTx.toAmount = parsed.toAmount || parsed.amount;
        }

        // ✅ 提取新交易的5个字段用于匹配
        const parsedDatePart = parsed.date.split('T')[0];
        let parsedTime = '';
        if (parsed.date.includes('T')) {
            const timePart = parsed.date.split('T')[1];
            if (timePart) {
                const [hours, minutes] = timePart.split(':');
                if (hours && minutes && (hours !== '00' || minutes !== '00')) {
                    parsedTime = `${hours}:${minutes}`;
                }
            }
        }

        const newTxFields = {
            date: parsedDatePart,
            time: parsedTime,
            amount: parsed.amount,
            accountId: accountId,
            category: parsed.category,
        };

        // ✅ 检测与数据库中的记录是否疑似重复
        const dbDuplicate = existingTxList.find(existingTx => isSuspectedDuplicate(newTxFields, existingTx));

        if (dbDuplicate) {
            result.duplicates.push({
                ...validTx,
                matchedWith: 'database',
            });
            continue;
        }

        // ✅ 检测文件内部重复（两条都标记）
        let isFileDuplicate = false;
        for (const prevTx of fileRowList) {
            if (isSuspectedDuplicate(newTxFields, prevTx.fields)) {
                // 如果前一条不在duplicates里，把它也加进去
                if (!prevTx.markedAsDuplicate) {
                    prevTx.markedAsDuplicate = true;
                    // 从valid中移除并加入duplicates
                    const idx = result.valid.findIndex((v: ValidTransaction) => v.row === prevTx.tx.row);
                    if (idx !== -1) {
                        result.valid.splice(idx, 1);
                        result.duplicates.push({
                            ...prevTx.tx,
                            matchedWith: 'file',
                        });
                    }
                }
                isFileDuplicate = true;
                break;
            }
        }

        // 将当前交易加入文件列表用于后续比对
        fileRowList.push({
            fields: newTxFields,
            tx: validTx,
            markedAsDuplicate: isFileDuplicate,
        });

        if (isFileDuplicate) {
            result.duplicates.push({
                ...validTx,
                matchedWith: 'file',
            });
        } else {
            result.valid.push(validTx);
        }
    }

    return result;
}

// ============================================
// 解析单行（带错误追踪）
// ============================================

interface ParseRowResult {
    data?: ParsedRow;
    error?: {
        field: string;
        value: string;
        reason: string;
    };
}

function tryParseRow(row: string[], rowNum: number): ParseRowResult {
    const [dateStr, typeStr, amountStr, account, category, description, toAccount, toAmountStr] = row;

    // 解析日期（保留时间部分）
    let date = '';
    if (dateStr) {
        const d = String(dateStr).trim().replace(/\//g, '-');
        // 验证日期格式 (支持 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS)
        if (/^\d{4}-\d{1,2}-\d{1,2}/.test(d)) {
            // 分离日期和时间部分
            const [datePart, timePart] = d.split(' ');
            const parts = datePart.split('-');
            if (parts.length >= 3) {
                // 补齐月和日的0
                const formattedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;

                // ✅ 如果有时间部分，保留它
                if (timePart && /^\d{1,2}:\d{2}(:\d{2})?$/.test(timePart)) {
                    // 格式化时间部分 (补齐秒)
                    const timeParts = timePart.split(':');
                    const hours = timeParts[0].padStart(2, '0');
                    const minutes = timeParts[1].padStart(2, '0');
                    const seconds = timeParts[2]?.padStart(2, '0') || '00';
                    date = `${formattedDate}T${hours}:${minutes}:${seconds}`;
                } else {
                    // 没有时间部分，只保存日期（不添加默认时间）
                    date = formattedDate;
                }
            }
        }
    }

    if (!date) {
        return {
            error: {
                field: '日期',
                value: String(dateStr || '').substring(0, 50),
                reason: '日期格式无法解析，应为 YYYY-MM-DD 或 YYYY/MM/DD',
            },
        };
    }

    // 解析类型
    const typeStrTrimmed = String(typeStr || '').trim();
    if (!['支出', '收入', '划转'].includes(typeStrTrimmed)) {
        return {
            error: {
                field: '类型',
                value: typeStrTrimmed || '(空)',
                reason: '类型必须为：支出、收入 或 划转',
            },
        };
    }

    // ✅ 解析金额 - 移除货币符号、逗号等
    const cleanedAmount = String(amountStr || '')
        .replace(/[¥￥$€£,，\s]/g, '') // 移除各种货币符号、逗号、空格
        .trim();
    const amount = parseFloat(cleanedAmount);

    if (isNaN(amount) || amount <= 0) {
        return {
            error: {
                field: '金额',
                value: String(amountStr || '').substring(0, 30),
                reason: `金额无法解析为正数 (解析结果: ${isNaN(amount) ? 'NaN' : amount})`,
            },
        };
    }

    // 解析对方金额
    let toAmount: number | null = null;
    if (toAmountStr && String(toAmountStr).trim()) {
        const cleanedToAmount = String(toAmountStr)
            .replace(/[¥￥$€£,，\s]/g, '')
            .trim();
        toAmount = parseFloat(cleanedToAmount);
        if (isNaN(toAmount)) toAmount = null;
    }

    return {
        data: {
            row: rowNum,
            date,
            type: typeStrTrimmed as '支出' | '收入' | '划转',
            amount,
            account: String(account || '').trim(),
            category: String(category || '').trim(),
            description: String(description || '').trim(),
            toAccount: String(toAccount || '').trim(),
            toAmount,
            rawData: row.map(c => String(c)),
        },
    };
}

// 保留parseRow作为简化版本（用于其他可能的用途）
function parseRow(row: string[], rowNum: number): ParsedRow | null {
    const result = tryParseRow(row, rowNum);
    return result.data || null;
}

// ============================================
// 验证单行
// ============================================

function validateRow(
    row: ParsedRow,
    accountMap: Map<string, string>,
    tagSet: Set<string>
): ValidationError[] {
    const errors: ValidationError[] = [];

    // 验证账户
    if (!row.account) {
        errors.push({ row: row.row, field: '账户', value: '', reason: '账户不能为空' });
    } else if (!accountMap.has(row.account)) {
        errors.push({ row: row.row, field: '账户', value: row.account, reason: '账户不存在于数据库' });
    }

    // 验证分类（非划转类型必填）
    if (row.type !== '划转') {
        if (!row.category) {
            errors.push({ row: row.row, field: '分类', value: '', reason: '支出/收入类型必须填写分类' });
        } else if (!tagSet.has(row.category)) {
            errors.push({ row: row.row, field: '分类', value: row.category, reason: '分类不存在于数据库' });
        }
    }

    // 划转类型验证
    if (row.type === '划转') {
        if (!row.toAccount) {
            errors.push({ row: row.row, field: '对方账户', value: '', reason: '划转类型必须填写对方账户' });
        } else if (!accountMap.has(row.toAccount)) {
            errors.push({ row: row.row, field: '对方账户', value: row.toAccount, reason: '对方账户不存在于数据库' });
        } else if (row.toAccount === row.account) {
            errors.push({ row: row.row, field: '对方账户', value: row.toAccount, reason: '对方账户不能与账户相同' });
        }
    }

    return errors;
}

// ============================================
// 批量上传流水
// ============================================

export async function batchImportTransactions(
    transactions: ValidTransaction[],
    filename: string,
    stats: { totalRows: number; validCount: number; duplicateCount: number; invalidCount: number }
): Promise<{
    success: boolean;
    batchId: string;
    uploadedCount: number;
    error?: string;
}> {
    const startTime = Date.now();

    try {
        const transactionIds: string[] = [];

        for (const tx of transactions) {
            if (tx.type === 'transfer') {
                // 划转：生成2条记录
                const transferGroupId = crypto.randomUUID();

                // 转出
                const { data: outTx, error: outError } = await supabase
                    .from('transactions')
                    .insert({
                        account_id: tx.accountId,
                        type: 'transfer',
                        amount: -tx.amount,
                        category: '',
                        description: tx.description,
                        date: tx.date,
                        transfer_group_id: transferGroupId,
                    })
                    .select('id')
                    .single();

                if (outError) throw outError;
                transactionIds.push(outTx.id);

                // 转入 (toAccountId is guaranteed to exist for transfers after validation)
                const { data: inTx, error: inError } = await supabase
                    .from('transactions')
                    .insert({
                        account_id: tx.toAccountId!,
                        type: 'transfer' as const,
                        amount: tx.toAmount || tx.amount,
                        category: '',
                        description: tx.description || '',
                        date: tx.date,
                        transfer_group_id: transferGroupId,
                    })
                    .select('id')
                    .single();

                if (inError) throw inError;
                transactionIds.push(inTx.id);
            } else {
                // 收入/支出
                const amount = tx.type === 'expense' ? -Math.abs(tx.amount) : Math.abs(tx.amount);

                const { data: newTx, error } = await supabase
                    .from('transactions')
                    .insert({
                        account_id: tx.accountId,
                        type: tx.type,
                        amount,
                        category: tx.category,
                        description: tx.description,
                        date: tx.date,
                    })
                    .select('id')
                    .single();

                if (error) throw error;
                transactionIds.push(newTx.id);
            }
        }

        // 创建批次记录
        const uploadDuration = Date.now() - startTime;

        const { data: batch, error: batchError } = await supabase
            .from('import_batches')
            .insert({
                filename,
                total_rows: stats.totalRows,
                valid_count: stats.validCount,
                duplicate_count: stats.duplicateCount,
                invalid_count: stats.invalidCount,
                uploaded_count: transactionIds.length,
                status: 'completed',
                transaction_ids: transactionIds,
                upload_duration_ms: uploadDuration,
            })
            .select('id')
            .single();

        if (batchError) throw batchError;

        return {
            success: true,
            batchId: batch.id,
            uploadedCount: transactionIds.length,
        };
    } catch (error: any) {
        console.error('批量上传失败:', error);
        return {
            success: false,
            batchId: '',
            uploadedCount: 0,
            error: error.message,
        };
    }
}

// ============================================
// 导出问题流水
// ============================================

export function exportProblemTransactions(
    invalid: ParsedRow[],
    unselectedDuplicates: ValidTransaction[],
    errors: ValidationError[]
): Blob {
    // 创建问题流水数据
    const problemRows: Record<string, string>[] = [];

    // 错误映射
    const errorMap = new Map<number, string[]>();
    for (const err of errors) {
        const existing = errorMap.get(err.row) || [];
        existing.push(`${err.field}: ${err.reason}`);
        errorMap.set(err.row, existing);
    }

    // 添加不合规流水
    for (const row of invalid) {
        problemRows.push({
            '行号': String(row.row),
            '日期': row.date,
            '类型': row.type,
            '金额': String(row.amount),
            '账户': row.account,
            '分类': row.category,
            '备注': row.description,
            '对方账户': row.toAccount,
            '对方金额': row.toAmount ? String(row.toAmount) : '',
            '问题类型': '不合规',
            '问题详情': errorMap.get(row.row)?.join('; ') || '',
        });
    }

    // 添加未选择的疑似重复
    for (const tx of unselectedDuplicates) {
        problemRows.push({
            '行号': String(tx.row),
            '日期': tx.date,
            '类型': tx.type === 'expense' ? '支出' : tx.type === 'income' ? '收入' : '划转',
            '金额': String(tx.amount),
            '账户': tx.accountName,
            '分类': tx.category,
            '备注': tx.description,
            '对方账户': tx.toAccountName || '',
            '对方金额': tx.toAmount ? String(tx.toAmount) : '',
            '问题类型': '疑似重复',
            '问题详情': '与数据库或文件中的记录重复',
        });
    }

    // 创建Excel
    const ws = XLSX.utils.json_to_sheet(problemRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '问题流水');

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
