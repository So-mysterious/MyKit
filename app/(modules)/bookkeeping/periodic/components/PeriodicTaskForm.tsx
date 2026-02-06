/**
 * [性质]: [组件] 周期任务新建/编辑表单
 * [Input]: Task Data / Options
 * [Output]: Form UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { CalendarIcon, Loader2, X, Check, MapPin, Star, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    PeriodicTaskFormState,
    AccountOption,
    ProjectOption,
    FREQUENCY_OPTIONS,
    DEFAULT_FORM_STATE,
    getCurrencySymbol,
    calculateNextRunDate,
    encodeFrequency,
    parseFrequency,
} from "./constants";
import { PeriodicTaskData } from "./PeriodicTaskItem";
import { cn } from "@/lib/utils";

// ============================================================================
// 类型定义
// ============================================================================

interface PeriodicTaskFormProps {
    /** 账户列表 */
    accounts: AccountOption[];
    /** 项目列表 */
    projects?: ProjectOption[];
    /** 编辑模式时的初始数据 */
    initialData?: PeriodicTaskData | null;
    /** 是否正在提交 */
    submitting?: boolean;
    /** 提交回调 */
    onSubmit: (data: PeriodicTaskFormData) => Promise<void>;
    /** 取消回调 */
    onCancel: () => void;
}

/** 表单提交数据 */
export interface PeriodicTaskFormData {
    from_account_id: string;
    to_account_id: string;
    amount: number;
    from_amount?: number;
    to_amount?: number;
    description?: string;
    frequency: string;
    next_run_date: string;
    location?: string;
    project_id?: string;
    is_starred?: boolean;
    needs_review?: boolean;
}

/** 交易类型 */
type TransactionType = "expense" | "income" | "transfer";

// ============================================================================
// 切换按钮组件
// ============================================================================

interface ToggleButtonProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
}

function ToggleButton({ checked, onChange, label }: ToggleButtonProps) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={cn(
                "flex items-center justify-center py-2.5 px-5 rounded-lg border text-sm font-medium transition-all whitespace-nowrap",
                checked
                    ? "border-blue-500 bg-blue-500 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            )}
        >
            {label}
        </button>
    );
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 获取账户的显示名称
 * - 实账户（资产/负债）：显示名称 + 币种
 * - 虚账户（收入/费用）：只显示名称，不显示币种和类型前缀
 */
function getAccountDisplayName(account: AccountOption, showCurrency: boolean = true): string {
    const currencySet = new Set(['CNY', 'USD', 'HKD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'SGD', 'TWD', 'KRW', 'THB', 'MYR', 'PHP', 'INR', 'RUB', 'BRL', 'MXN', 'ZAR', 'USDT']);
    const isReal = account.type === 'asset' || account.type === 'liability';

    // 如果账户名本身就是币种代码，使用 full_path 获取父账户名
    if (currencySet.has(account.name)) {
        const fullPath = (account as any).full_path;
        if (fullPath) {
            const parts = fullPath.split(':');
            if (parts.length >= 2) {
                const parentName = parts[parts.length - 2];
                return `${parentName} ${account.name}`;
            }
        }
        return account.name;
    }

    // 实账户：显示名称 + 币种（如果有且非空）
    if (isReal && showCurrency && account.currency) {
        return `${account.name} (${account.currency})`;
    }

    // 虚账户（收入/费用）：只显示名称
    return account.name;
}

/**
 * 分类账户
 */
function categorizeAccounts(accounts: AccountOption[], selectedIds: (string | undefined)[] = []) {
    const flatten = (accs: AccountOption[]): AccountOption[] => {
        const result: AccountOption[] = [];
        for (const acc of accs) {
            const any = acc as any;
            if (any.children && any.children.length > 0) {
                result.push(...flatten(any.children));
            } else if (!any.is_group) {
                // 仅包含活跃账户，或者是当前已选中的账户（用于显示已禁用的标签）
                if (any.is_active !== false || selectedIds.includes(acc.id)) {
                    result.push(acc);
                }
            }
        }
        return result;
    };

    const flat = flatten(accounts);

    return {
        realAccounts: flat.filter(a => a.type === 'asset' || a.type === 'liability'),
        expenseAccounts: flat.filter(a => a.type === 'expense'),
        incomeAccounts: flat.filter(a => a.type === 'income'),
    };
}

// ============================================================================
// 组件
// ============================================================================

export function PeriodicTaskForm({
    accounts,
    projects = [],
    initialData,
    submitting = false,
    onSubmit,
    onCancel,
}: PeriodicTaskFormProps) {
    // 交易类型
    const [txType, setTxType] = React.useState<TransactionType>("expense");

    // 初始化表单展示（根据 initialData 包含已禁用的标签）
    const { realAccounts, expenseAccounts, incomeAccounts } = React.useMemo(
        () => categorizeAccounts(accounts, [initialData?.from_account_id, initialData?.to_account_id]),
        [accounts, initialData?.id]
    );

    // 根据初始数据推断交易类型
    React.useEffect(() => {
        if (initialData) {
            const fromType = initialData.from_account?.type;
            const toType = initialData.to_account?.type;
            const isFromReal = fromType === 'asset' || fromType === 'liability';
            const isToReal = toType === 'asset' || toType === 'liability';

            if (isFromReal && !isToReal && toType === 'expense') {
                setTxType('expense');
            } else if (!isFromReal && isToReal && fromType === 'income') {
                setTxType('income');
            } else if (isFromReal && isToReal) {
                setTxType('transfer');
            }
        }
    }, [initialData?.id]);

    // 初始化表单状态
    const getInitialState = (): PeriodicTaskFormState => {
        if (!initialData) {
            return {
                ...DEFAULT_FORM_STATE,
                fromAccountId: realAccounts[0]?.id || "",
                toAccountId: expenseAccounts[0]?.id || "",
            };
        }

        const { frequency, customDays } = parseFrequency(initialData.frequency);

        return {
            fromAccountId: initialData.from_account_id,
            toAccountId: initialData.to_account_id,
            amount: Math.abs(initialData.amount).toString(),
            fromAmount: initialData.from_amount?.toString() || "",
            toAmount: initialData.to_amount?.toString() || "",
            description: initialData.description || "",
            frequency,
            customDays,
            firstRunDate: initialData.next_run_date.split("T")[0],
            location: initialData.location || "",
            projectId: initialData.project_id || "",
            isStarred: initialData.is_starred || false,
            needsReview: initialData.needs_review || false,
        };
    };

    const [form, setForm] = React.useState<PeriodicTaskFormState>(getInitialState);

    // 当 initialData 变化时重置表单
    React.useEffect(() => {
        setForm(getInitialState());
    }, [initialData?.id]);

    // 当交易类型变化时，更新账户选择
    React.useEffect(() => {
        if (initialData) return; // 编辑模式不自动切换

        if (txType === 'expense') {
            if (realAccounts.length > 0 && !realAccounts.find(a => a.id === form.fromAccountId)) {
                setForm(prev => ({ ...prev, fromAccountId: realAccounts[0].id }));
            }
            if (expenseAccounts.length > 0) {
                setForm(prev => ({ ...prev, toAccountId: expenseAccounts[0].id }));
            }
        } else if (txType === 'income') {
            if (incomeAccounts.length > 0) {
                setForm(prev => ({ ...prev, fromAccountId: incomeAccounts[0].id }));
            }
            if (realAccounts.length > 0) {
                setForm(prev => ({ ...prev, toAccountId: realAccounts[0].id }));
            }
        } else {
            // 划转
            if (realAccounts.length > 0 && !realAccounts.find(a => a.id === form.fromAccountId)) {
                setForm(prev => ({ ...prev, fromAccountId: realAccounts[0].id }));
            }
            if (realAccounts.length > 1) {
                const toAcc = realAccounts.find(a => a.id !== form.fromAccountId);
                if (toAcc) {
                    setForm(prev => ({ ...prev, toAccountId: toAcc.id }));
                }
            }
        }
    }, [txType, realAccounts, expenseAccounts, incomeAccounts, initialData]);

    // 确保转入账户不等于转出账户（划转模式）
    React.useEffect(() => {
        if (txType === 'transfer' && form.fromAccountId === form.toAccountId) {
            const fallback = realAccounts.find(a => a.id !== form.fromAccountId);
            if (fallback) {
                setForm(prev => ({ ...prev, toAccountId: fallback.id }));
            }
        }
    }, [form.fromAccountId, form.toAccountId, txType, realAccounts]);

    const handleChange = (key: keyof PeriodicTaskFormState, value: string | boolean) => {
        setForm(prev => ({ ...prev, [key]: value }));
    };

    // 根据交易类型获取账户选项
    const fromOptions = txType === 'expense' ? realAccounts :
        txType === 'income' ? incomeAccounts : realAccounts;
    const toOptions = txType === 'expense' ? expenseAccounts :
        txType === 'income' ? realAccounts : realAccounts.filter(a => a.id !== form.fromAccountId);

    // 获取账户币种
    const getAccountCurrency = (id: string) => {
        const all = [...realAccounts, ...expenseAccounts, ...incomeAccounts];
        return all.find(a => a.id === id)?.currency || null;
    };

    // 检测是否跨币种
    const fromCurrency = getAccountCurrency(form.fromAccountId);
    const toCurrency = getAccountCurrency(form.toAccountId);
    const isCrossCurrency = fromCurrency && toCurrency && fromCurrency !== toCurrency;

    const handleSubmit = async () => {
        if (!form.fromAccountId || !form.toAccountId || !form.amount) {
            alert("请填写完整信息");
            return;
        }

        if (form.fromAccountId === form.toAccountId) {
            alert("转出账户和转入账户不能相同");
            return;
        }

        const amount = Math.abs(parseFloat(form.amount));
        const customDays = form.frequency === "custom" ? parseInt(form.customDays) || 30 : undefined;
        const nextRunDate = calculateNextRunDate(form.firstRunDate, form.frequency, customDays);

        const data: PeriodicTaskFormData = {
            from_account_id: form.fromAccountId,
            to_account_id: form.toAccountId,
            amount,
            frequency: encodeFrequency(form.frequency, form.customDays),
            next_run_date: nextRunDate.toISOString().split("T")[0],
            description: form.description || undefined,
            location: form.location || undefined,
            project_id: form.projectId || undefined,
            is_starred: form.isStarred,
            needs_review: form.needsReview,
        };

        // 跨币种时添加金额
        if (isCrossCurrency) {
            data.from_amount = form.fromAmount ? parseFloat(form.fromAmount) : amount;
            data.to_amount = form.toAmount ? parseFloat(form.toAmount) : amount;
        }

        await onSubmit(data);
    };

    const isEditMode = !!initialData;

    return (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${isEditMode ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                <h2 className="font-semibold text-gray-900">
                    {isEditMode ? "编辑周期任务" : "新建周期任务"}
                </h2>
            </div>

            {/* 交易类型切换 */}
            <div className="flex rounded-lg bg-gray-100 p-1">
                {(['expense', 'income', 'transfer'] as const).map((type) => (
                    <button
                        key={type}
                        type="button"
                        onClick={() => setTxType(type)}
                        className={cn(
                            "flex-1 py-2 text-sm font-medium rounded-md transition-all",
                            txType === type
                                ? "bg-white shadow text-gray-900"
                                : "text-gray-500 hover:text-gray-700"
                        )}
                    >
                        {type === 'expense' ? '支出' : type === 'income' ? '收入' : '划转'}
                    </button>
                ))}
            </div>

            {/* 第一行：金额 + 转出账户 + 转入账户 + 周期 */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {/* 金额 */}
                <div className="space-y-2">
                    <Label htmlFor="amount">金额{fromCurrency ? ` (${fromCurrency})` : ''}</Label>
                    <div className="relative">
                        <Input
                            id="amount"
                            type="number"
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            value={form.amount}
                            onChange={(e) => handleChange("amount", e.target.value)}
                            className="pl-8"
                            required
                        />
                        <span className="absolute left-3 top-2.5 text-gray-500 text-sm">
                            {getCurrencySymbol(fromCurrency)}
                        </span>
                    </div>
                </div>

                {/* 转出账户 */}
                <div className="space-y-2">
                    <Label htmlFor="fromAccount">
                        {txType === 'expense' ? '付款账户' : txType === 'income' ? '收入来源' : '转出账户'}
                    </Label>
                    <select
                        id="fromAccount"
                        className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-950"
                        value={form.fromAccountId}
                        onChange={(e) => handleChange("fromAccountId", e.target.value)}
                        required
                    >
                        {fromOptions.length === 0 && <option value="">无账户</option>}
                        {fromOptions.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                                {getAccountDisplayName(acc, txType !== 'income')}
                            </option>
                        ))}
                    </select>
                </div>

                {/* 转入账户 */}
                <div className="space-y-2">
                    <Label htmlFor="toAccount">
                        {txType === 'expense' ? '支出分类' : txType === 'income' ? '收款账户' : '转入账户'}
                    </Label>
                    <select
                        id="toAccount"
                        className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-950"
                        value={form.toAccountId}
                        onChange={(e) => handleChange("toAccountId", e.target.value)}
                        required
                    >
                        {toOptions.length === 0 && <option value="">无账户</option>}
                        {toOptions.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                                {getAccountDisplayName(acc, txType !== 'expense')}
                            </option>
                        ))}
                    </select>
                </div>

                {/* 周期 */}
                <div className="space-y-2">
                    <Label htmlFor="frequency">周期</Label>
                    <select
                        id="frequency"
                        className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-950"
                        value={form.frequency}
                        onChange={(e) => handleChange("frequency", e.target.value)}
                    >
                        {FREQUENCY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* 跨币种：转入金额 */}
            {isCrossCurrency && (
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="fromAmount">转出金额 ({fromCurrency})</Label>
                        <div className="relative">
                            <Input
                                id="fromAmount"
                                type="number"
                                placeholder={form.amount || "0.00"}
                                step="0.01"
                                value={form.fromAmount}
                                onChange={(e) => handleChange("fromAmount", e.target.value)}
                                className="pl-8"
                            />
                            <span className="absolute left-3 top-2.5 text-gray-500 text-sm">
                                {getCurrencySymbol(fromCurrency)}
                            </span>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="toAmount">转入金额 ({toCurrency})</Label>
                        <div className="relative">
                            <Input
                                id="toAmount"
                                type="number"
                                placeholder={form.amount || "0.00"}
                                step="0.01"
                                value={form.toAmount}
                                onChange={(e) => handleChange("toAmount", e.target.value)}
                                className="pl-8"
                            />
                            <span className="absolute left-3 top-2.5 text-gray-500 text-sm">
                                {getCurrencySymbol(toCurrency)}
                            </span>
                        </div>
                        <p className="text-[10px] text-gray-500">留空则默认等于转出金额</p>
                    </div>
                </div>
            )}

            {/* 自定义天数 */}
            {form.frequency === "custom" && (
                <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                    <Label className="text-sm text-amber-800 whitespace-nowrap">每隔</Label>
                    <Input
                        type="number"
                        min="1"
                        max="365"
                        value={form.customDays}
                        onChange={(e) => handleChange("customDays", e.target.value)}
                        className="w-20 text-center"
                    />
                    <span className="text-sm text-amber-800">天执行一次</span>
                </div>
            )}

            {/* 第二行：首次执行日期 + 备注 */}
            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="firstRunDate">首次执行日期</Label>
                    <div className="relative">
                        <Input
                            id="firstRunDate"
                            type="date"
                            value={form.firstRunDate}
                            onChange={(e) => handleChange("firstRunDate", e.target.value)}
                            className="pl-9"
                            required
                        />
                        <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                    </div>
                    <p className="text-[10px] text-gray-500">
                        系统将根据周期自动计算下一次执行时间
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="description">备注</Label>
                    <Input
                        id="description"
                        placeholder="记录一下..."
                        value={form.description}
                        onChange={(e) => handleChange("description", e.target.value)}
                    />
                </div>
            </div>

            {/* 第三行：发生地 + 项目 */}
            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="location">发生地 (选填)</Label>
                    <div className="relative">
                        <Input
                            id="location"
                            placeholder="例如：北京"
                            value={form.location}
                            onChange={(e) => handleChange("location", e.target.value)}
                            className="pl-8"
                        />
                        <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="projectId">所属项目 (选填)</Label>
                    <select
                        id="projectId"
                        className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-950"
                        value={form.projectId}
                        onChange={(e) => handleChange("projectId", e.target.value)}
                    >
                        <option value="">无</option>
                        {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* 操作按钮和标记 - 一行：左侧标记按钮，右侧取消/保存 */}
            <div className="flex items-center justify-between gap-4 pt-2">
                {/* 左侧：标记按钮 */}
                <div className="flex gap-2">
                    <ToggleButton
                        checked={form.isStarred}
                        onChange={(checked) => handleChange("isStarred", checked)}
                        label="重要"
                    />
                    <ToggleButton
                        checked={form.needsReview}
                        onChange={(checked) => handleChange("needsReview", checked)}
                        label="待核对"
                    />
                </div>

                {/* 右侧：取消/保存按钮 */}
                <div className="flex gap-2">
                    <Button variant="outline" onClick={onCancel} disabled={submitting}>
                        <X size={16} className="mr-1" />
                        取消
                    </Button>
                    <Button onClick={handleSubmit} disabled={submitting}>
                        {submitting ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                            <Check size={16} className="mr-1" />
                        )}
                        {isEditMode ? "保存" : "创建"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
