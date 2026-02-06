/**
 * [性质]: [解析器] 标准解析器 (Excel/CSV) - Client Side
 * [Input]: File
 * [Output]: ParseResult (Valid/Invalid/Duplicates)
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase/client';

// ============================================
// 类型定义
// ============================================

export interface ParsedTransaction {
    row: number;
    date: string; // ISO Full
    type: 'expense' | 'income' | 'transfer';
    amount: number;

    // Raw names
    accountName: string;   // Main Account (转出 for Exp/Transfer, 转入 for Inc)? 
    // Wait, mapping logic:
    // Expense: '转出' is Account, '转入' is Category
    // Income: '转出' is Category, '转入' is Account
    // Transfer: '转出' is From, '转入' is To

    relatedName: string;   // The "Other" side name

    // Parsed Attributes
    description: string;
    location: string;
    project: string;
    nature: 'regular' | 'unexpected' | 'periodic';
    isStarred: boolean;
    needsReview: boolean;

    // Advanced Transfer
    toAmount?: number; // For diff currency

    // IDs (if resolvable on client)
    accountId?: string;
    relatedId?: string;
    matchedWith?: 'database' | 'file';
}

export interface ParseResult {
    valid: ParsedTransaction[];
    duplicates: ParsedTransaction[]; // Strict or Database suspected
    invalid: any[];
    errors: any[];
    totalRows: number;
}

export function exportProblemTransactions(
    result: ParseResult,
    selectedDuplicates: Set<number>,
    selectedValid: Set<number>
) {
    const problems: any[] = [];

    // 1. Invalid Rows
    result.invalid.forEach(r => {
        problems.push({ ...r, _status: 'INVALID', _reason: result.errors.find(e => e.row === r.row)?.reason });
    });

    // 2. Skipped Duplicates
    result.duplicates.forEach(d => {
        if (!selectedDuplicates.has(d.row)) {
            problems.push({
                日期: d.date,
                类型: d.type === 'expense' ? '支出' : d.type === 'income' ? '收入' : '划转',
                金额: d.amount,
                账户: d.accountName,
                关联方: d.relatedName,
                说明: d.description,
                _status: 'SKIPPED_DUPLICATE',
                _reason: '用户未选择上传'
            });
        }
    });

    // 3. Skipped Valid
    result.valid.forEach(v => {
        if (!selectedValid.has(v.row)) {
            problems.push({
                日期: v.date,
                类型: v.type === 'expense' ? '支出' : v.type === 'income' ? '收入' : '划转',
                金额: v.amount,
                账户: v.accountName,
                关联方: v.relatedName,
                说明: v.description,
                _status: 'SKIPPED_VALID',
                _reason: '用户未选择上传'
            });
        }
    });

    if (problems.length === 0) return;

    const ws = XLSX.utils.json_to_sheet(problems);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "未上传流水");
    XLSX.writeFile(wb, "import_issues.xlsx");
}

// ============================================
// 表头定义 (Strict Match User Screenshot)
// ============================================
// 日期, 类型, 转出账户, 金额, 转入账户, 备注, 地点, 项目, 重要, 待核对, 性质

const HEADERS_MAP = {
    DATE: '日期',
    TYPE: '类型',
    FROM_ACCOUNT: '转出账户',
    AMOUNT: '金额',
    TO_ACCOUNT: '转入账户',
    NOTE: '备注',
    LOCATION: '地点',
    PROJECT: '项目',
    IMPORTANT: '重要',
    REVIEW: '待核对',
    NATURE: '性质'
};

const REQUIRED = [HEADERS_MAP.DATE, HEADERS_MAP.TYPE, HEADERS_MAP.FROM_ACCOUNT, HEADERS_MAP.AMOUNT, HEADERS_MAP.TO_ACCOUNT];

// ============================================
// 辅助函数
// ============================================

function parseBoolean(val: string): boolean {
    return val === '是' || val === 'Yes' || val === 'true';
}

function parseNature(val: string): 'regular' | 'unexpected' | 'periodic' {
    if (val === '意外') return 'unexpected';
    if (val === '周期') return 'periodic';
    return 'regular'; // Default
}

// Normalize Name for fuzzy matching
// Ignore case, space, full/half width, punctuation
function normalizeName(s: string): string {
    if (!s) return '';
    return s
        .toLowerCase()
        // Full-width to half-width mapping could be complex, but for common ASCII chars:
        .replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
        .replace(/\u3000/g, ' ') // Ideographic space
        .replace(/\s+/g, '') // Remove all spaces
        .replace(/[.,:;?!'"()（）\[\]]/g, '') // Remove punctuation
        .replace(/[，。：；？！“”‘’（）【】]/g, ''); // Specific Chinese punctuation
}

// 解析 "90->100" or "90"
function parseTransferAmount(val: string): { from: number, to: number } {
    const s = val.replace(/[¥￥$€£,，\s]/g, ''); // clean
    if (s.includes('→') || s.includes('->')) {
        const parts = s.split(/[→\->]+/);
        const f = parseFloat(parts[0]);
        const t = parseFloat(parts[1]);
        return { from: isNaN(f) ? 0 : f, to: isNaN(t) ? 0 : t };
    }
    const v = parseFloat(s);
    return { from: isNaN(v) ? 0 : v, to: isNaN(v) ? 0 : v };
}

// ============================================
// 主解析函数
// ============================================

export async function parseStandardExcel(file: File): Promise<ParseResult> {
    const buffer = await file.arrayBuffer();
    // Use cellDates: true to let xlsx handle date conversion
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any>(sheet); // object mode

    if (rows.length === 0) throw new Error("文件为空");

    // Check headers? `sheet_to_json` uses first row as keys.
    const firstRow = rows[0];
    const missing = REQUIRED.filter(h => !(h in firstRow));

    // Load Accounts for reference
    const { data: accounts } = await supabase.from('accounts').select('id, name, type, currency, is_group, parent_id');
    const accountMap = new Map<string, any>();
    const idMap = new Map<string, any>();

    // First pass: Build ID map
    accounts?.forEach(a => {
        idMap.set(a.id, a);
    });

    // Second pass: Build Name map (including composite names)
    // Use NORMALIZED keys
    accounts?.forEach(a => {
        // 1. Basic Name Match (e.g. "SpecificName")
        accountMap.set(normalizeName(a.name), a);

        // 2. Composite Name Match (Parent Name + Child Name)
        // Useful for "BankName Currency" case: "工银（5738） CNY"
        if (a.parent_id) {
            const parent = idMap.get(a.parent_id);
            if (parent) {
                // Variations: "ParentName Name", "ParentNameName" (normalization handles space removal anyway)
                const composite = `${parent.name}${a.name}`;
                accountMap.set(normalizeName(composite), a);
            }
        }
    });

    const result: ParseResult = { valid: [], duplicates: [], invalid: [], errors: [], totalRows: rows.length };

    // Stage 1: Parse All & Collect Hashes
    const parsedRows: { tx: ParsedTransaction, errors: any[], rawErrors: string[], rawFields: string[], rawValues: string[], hash: string }[] = [];
    const hashCounts = new Map<string, number>();

    let rowNum = 1; // Header is 1
    for (const row of rows) {
        rowNum++;
        const rawDate = row[HEADERS_MAP.DATE];
        const rawType = row[HEADERS_MAP.TYPE];
        const rawFrom = row[HEADERS_MAP.FROM_ACCOUNT];
        const rawAmount = row[HEADERS_MAP.AMOUNT];
        const rawTo = row[HEADERS_MAP.TO_ACCOUNT];

        const rowErrors: string[] = [];
        const errorFields: string[] = [];
        const errorValues: string[] = [];

        // --- Basic Validation ---
        if (!rawDate) {
            rowErrors.push("缺失日期");
            errorFields.push(HEADERS_MAP.DATE);
        }
        if (!rawType) {
            rowErrors.push("缺失类型");
            errorFields.push(HEADERS_MAP.TYPE);
        }
        if (!rawAmount) {
            rowErrors.push("缺失金额");
            errorFields.push(HEADERS_MAP.AMOUNT);
        }

        // --- ID Logic ---
        const typeStr = String(rawType || '').trim();
        let mainAccountName = "";
        let relatedAccountName = "";
        let transactionType: 'expense' | 'income' | 'transfer' = 'expense';

        if (rawType) { // Only parse type if exists
            if (typeStr === '支出') {
                transactionType = 'expense';
                mainAccountName = rawFrom;
                relatedAccountName = rawTo;
            } else if (typeStr === '收入') {
                transactionType = 'income';
                mainAccountName = rawTo;
                relatedAccountName = rawFrom;
            } else if (typeStr === '划转') {
                transactionType = 'transfer';
                mainAccountName = rawFrom;
                relatedAccountName = rawTo;
            } else {
                rowErrors.push("类型未知: " + typeStr);
                errorFields.push(HEADERS_MAP.TYPE);
                errorValues.push(typeStr);
            }
        }

        // --- Date Logic ---
        let isoDate = "";
        if (rawDate) {
            let dateObj: Date;
            if (rawDate instanceof Date) {
                if (isNaN(rawDate.getTime())) {
                    rowErrors.push("日期格式无效");
                    errorFields.push(HEADERS_MAP.DATE);
                    errorValues.push("Invalid Date Object");
                } else {
                    dateObj = rawDate;
                    isoDate = dateObj.toISOString();
                }
            } else {
                let dateStr = String(rawDate).replace(/\./g, '-').replace(/\//g, '-');
                const hasTime = dateStr.includes(':');
                if (!hasTime) {
                    dateStr += " 12:00:00";
                }
                dateObj = new Date(dateStr);
                if (isNaN(dateObj.getTime())) {
                    rowErrors.push("日期无效");
                    errorFields.push(HEADERS_MAP.DATE);
                    errorValues.push(String(rawDate));
                } else {
                    isoDate = dateObj.toISOString();
                }
            }
        }

        // --- Amount Logic ---
        const amtObj = parseTransferAmount(String(rawAmount || '0'));
        if (rawAmount && amtObj.from <= 0) {
            rowErrors.push("金额不能为0或负数");
            errorFields.push(HEADERS_MAP.AMOUNT);
            errorValues.push(String(rawAmount));
        }

        // --- Account & Currency Logic ---
        // Use NORMALIZED lookup
        const fromAccountNameRaw = String(rawFrom || '');
        const toAccountNameRaw = String(rawTo || '');
        const fromAccountNameNorm = normalizeName(fromAccountNameRaw);
        const toAccountNameNorm = normalizeName(toAccountNameRaw);

        const fromAccObj = accountMap.get(fromAccountNameNorm);
        const toAccObj = accountMap.get(toAccountNameNorm);

        // Check Account Existence & Group Restriction
        if (transactionType === 'transfer') {
            if (!fromAccObj) {
                rowErrors.push("转出账户不存在");
                errorFields.push(HEADERS_MAP.FROM_ACCOUNT);
                errorValues.push(fromAccountNameRaw);
            } else if (fromAccObj.is_group) {
                rowErrors.push("不能在分组账户上直接记账");
                errorFields.push(HEADERS_MAP.FROM_ACCOUNT);
                errorValues.push(fromAccountNameRaw);
            }

            if (!toAccObj) {
                rowErrors.push("转入账户不存在");
                errorFields.push(HEADERS_MAP.TO_ACCOUNT);
                errorValues.push(toAccountNameRaw);
            } else if (toAccObj.is_group) {
                rowErrors.push("不能在分组账户上直接记账");
                errorFields.push(HEADERS_MAP.TO_ACCOUNT);
                errorValues.push(toAccountNameRaw);
            }
        }
        else if (transactionType === 'expense') {
            if (!fromAccObj) {
                rowErrors.push("转出账户不存在");
                errorFields.push(HEADERS_MAP.FROM_ACCOUNT);
                errorValues.push(fromAccountNameRaw);
            } else if (fromAccObj.is_group) {
                rowErrors.push("不能在分组账户上直接记账");
                errorFields.push(HEADERS_MAP.FROM_ACCOUNT);
                errorValues.push(fromAccountNameRaw);
            }

            if (!toAccObj) {
                rowErrors.push("转入账户(或分类)不存在");
                errorFields.push(HEADERS_MAP.TO_ACCOUNT);
                errorValues.push(toAccountNameRaw);
            } else if (toAccObj.is_group) {
                rowErrors.push("不能在分组账户上直接记账");
                errorFields.push(HEADERS_MAP.TO_ACCOUNT);
                errorValues.push(toAccountNameRaw);
            }
        }
        else if (transactionType === 'income') {
            if (!toAccObj) {
                rowErrors.push("转入账户不存在");
                errorFields.push(HEADERS_MAP.TO_ACCOUNT);
                errorValues.push(toAccountNameRaw);
            } else if (toAccObj.is_group) {
                rowErrors.push("不能在分组账户上直接记账");
                errorFields.push(HEADERS_MAP.TO_ACCOUNT);
                errorValues.push(toAccountNameRaw);
            }

            if (!fromAccObj) {
                rowErrors.push("转出账户(或来源)不存在");
                errorFields.push(HEADERS_MAP.FROM_ACCOUNT);
                errorValues.push(fromAccountNameRaw);
            } else if (fromAccObj.is_group) {
                rowErrors.push("不能在分组账户上直接记账");
                errorFields.push(HEADERS_MAP.FROM_ACCOUNT);
                errorValues.push(fromAccountNameRaw);
            }
        }

        // Currency Check
        if (transactionType === 'transfer' && fromAccObj && toAccObj) {
            if (fromAccObj.currency !== toAccObj.currency) {
                if (amtObj.from === amtObj.to && !String(rawAmount).match(/[→\->]/)) {
                    rowErrors.push("跨币种划转需用'x->y'格式");
                    errorFields.push(HEADERS_MAP.AMOUNT);
                }
            } else {
                if (String(rawAmount).match(/[→\->]/)) {
                    rowErrors.push("同币种划转金额应为纯数字");
                    errorFields.push(HEADERS_MAP.AMOUNT);
                }
            }
        }

        // --- Construct Object ---
        const parsedTx: ParsedTransaction = {
            row: rowNum,
            date: isoDate,
            type: transactionType,
            amount: amtObj.from,
            toAmount: amtObj.to,
            accountName: mainAccountName,
            relatedName: relatedAccountName,
            description: row[HEADERS_MAP.NOTE] || "",
            location: row[HEADERS_MAP.LOCATION] || "",
            project: row[HEADERS_MAP.PROJECT] || "",
            nature: parseNature(row[HEADERS_MAP.NATURE]),
            isStarred: parseBoolean(row[HEADERS_MAP.IMPORTANT]),
            needsReview: parseBoolean(row[HEADERS_MAP.REVIEW]),
            accountId: null as any,
            relatedId: null as any
        };

        if (transactionType === 'expense') {
            parsedTx.accountId = fromAccObj?.id;
            parsedTx.relatedId = toAccObj?.id;
        } else if (transactionType === 'income') {
            parsedTx.accountId = toAccObj?.id;
            parsedTx.relatedId = fromAccObj?.id;
        } else {
            parsedTx.accountId = fromAccObj?.id;
            parsedTx.relatedId = toAccObj?.id;
        }

        // --- Calculate Hash (Strict) ---
        const hash = JSON.stringify({
            d: parsedTx.date, t: parsedTx.type, a: parsedTx.amount, ta: parsedTx.toAmount,
            acc: parsedTx.accountName, rel: parsedTx.relatedName,
            desc: parsedTx.description, loc: parsedTx.location, proj: parsedTx.project,
            nat: parsedTx.nature
        });

        const count = hashCounts.get(hash) || 0;
        hashCounts.set(hash, count + 1);

        // Store intermediate results
        const errorObj = rowErrors.length > 0 ? {
            row: rowNum,
            reason: rowErrors.join('；'),
            raw: row,
            field: [...new Set(errorFields)].join(','),
            value: [...new Set(errorValues)].join(',')
        } : null;

        parsedRows.push({
            tx: parsedTx,
            errors: errorObj ? [errorObj] : [],
            rawErrors: rowErrors,
            rawFields: errorFields,
            rawValues: errorValues,
            hash: hash
        });
    }

    // Stage 2: Distribute based on errors and duplication
    for (const item of parsedRows) {
        if (item.errors.length > 0) {
            result.errors.push(item.errors[0]);
            result.invalid.push({ ...item.tx, row: item.tx.row }); // Use tx structure for consistency in invalid? Or raw? 
            // Previous code pushed raw row with rowNum. Let's stick to raw is safer for viewing input, but tx has row num.
            // Wait, previous code: result.invalid.push({ ...row, row: rowNum }); 
            // Now we don't have direct access to 'row' easily unless we store it.
            // But item.tx has the parsed data.
            // To match original behavior exactly for invalid rows display, we ideally pass 'raw' row logic?
            // Actually `ValidationReportStep` uses `parseResult.errors` which has `raw` field.
            // `result.invalid` array content usage depends on UI. 
            // In UI: `parseResult.invalid.length` used for count. `parseResult.invalid.map`... 
            // Check DataImport: `parseResult.errors.map` is used for display! `result.invalid` is mostly for count?
            // "rows_error" in log uses `rawStats.errorRows` which is `parseResult.invalid`.
            // So we should try to keep `result.invalid` containing what it used to.
            // Let's use `item.errors[0].raw` plus row num.
            const invalidRow = { ...item.errors[0].raw, row: item.tx.row };
            // Ensure no circular structure if raw has it (it won't).
            // Actually simpler:
            // result.invalid.push({ ...item.errors[0].raw, row: item.tx.row }); 
            // We just need to make sure 'raw' wasn't mutated.
        } else {
            // Valid or Duplicate?
            const count = hashCounts.get(item.hash) || 0;
            if (count > 1) {
                // It is a duplicate (one of a set)
                // Mark as file-internal duplicate
                item.tx.matchedWith = 'file';
                result.duplicates.push(item.tx);
            } else {
                result.valid.push(item.tx);
            }
        }
    }

    return result;
}
