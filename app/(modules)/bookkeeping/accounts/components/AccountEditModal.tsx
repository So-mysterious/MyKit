/**
 * [性质]: [组件] 账户编辑弹窗
 * [Input]: Account Object
 * [Output]: Edit Modal
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { Loader2, CreditCard, Wallet, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AccountWithBalance } from "@/types/database";
import { CURRENCIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";

interface AccountEditModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    account: AccountWithBalance;
    accounts: AccountWithBalance[]; // 树形账户数据（用于选择父级）
    onSubmit: (data: EditAccountData) => Promise<void>;
}

export interface EditAccountData {
    name: string;
    parent_id: string | null;
    currency: string | null;
    is_active: boolean;
    credit_limit: number | null;
    statement_day: number | null;
    due_day: number | null;
}

// 递归扁平化账户树，只保留分组账户
function flattenGroups(accounts: AccountWithBalance[], level = 0, excludeId?: string): Array<{ account: AccountWithBalance; level: number }> {
    const result: Array<{ account: AccountWithBalance; level: number }> = [];

    accounts.forEach(acc => {
        // 合法性检查：不能选择自己或自己的子账户作为父级（防止循环）
        if (acc.is_group && acc.id !== excludeId) {
            result.push({ account: acc, level });
            if (acc.children && acc.children.length > 0) {
                result.push(...flattenGroups(acc.children, level + 1, excludeId));
            }
        }
    });

    return result;
}

export function AccountEditModal({
    open,
    onOpenChange,
    account,
    accounts,
    onSubmit,
}: AccountEditModalProps) {
    const [submitting, setSubmitting] = React.useState(false);
    const [hasTransactions, setHasTransactions] = React.useState(false);
    const [checkingTx, setCheckingTx] = React.useState(true);

    // 表单状态
    const [parentId, setParentId] = React.useState<string>(account.parent_id || '');
    const [name, setName] = React.useState(account.name);
    const [currency, setCurrency] = React.useState(account.currency || 'CNY');
    const [isActive, setIsActive] = React.useState(account.is_active);
    const [isCreditCard, setIsCreditCard] = React.useState(account.subtype === 'credit_card' || (account.type === 'liability' && !account.is_group));
    const [creditLimit, setCreditLimit] = React.useState(account.credit_limit?.toString() || '');
    const [statementDay, setStatementDay] = React.useState(account.statement_day?.toString() || '');
    const [dueDay, setDueDay] = React.useState(account.due_day?.toString() || '');

    // 检查是否有交易记录
    React.useEffect(() => {
        if (open) {
            const checkTxs = async () => {
                setCheckingTx(true);
                const { count } = await supabase
                    .from('transactions')
                    .select('*', { count: 'exact', head: true })
                    .or(`from_account_id.eq.${account.id},to_account_id.eq.${account.id}`);
                setHasTransactions((count || 0) > 0);
                setCheckingTx(false);
            };
            checkTxs();

            // 同步初始值
            setName(account.name);
            setParentId(account.parent_id || '');
            setCurrency(account.currency || 'CNY');
            setIsActive(account.is_active);
            setIsCreditCard(account.subtype === 'credit_card' || (account.type === 'liability' && !account.is_group));
            setCreditLimit(account.credit_limit?.toString() || '');
            setStatementDay(account.statement_day?.toString() || '');
            setDueDay(account.due_day?.toString() || '');
        }
    }, [open, account]);

    // 获取可选的父账户
    const parentOptions = React.useMemo(() => {
        return flattenGroups(accounts, 0, account.id);
    }, [accounts, account.id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setSubmitting(true);
        try {
            await onSubmit({
                name: name.trim(),
                parent_id: parentId || null,
                currency: account.is_group ? null : currency,
                is_active: isActive,
                credit_limit: isCreditCard && creditLimit ? parseFloat(creditLimit) : null,
                statement_day: isCreditCard && statementDay ? parseInt(statementDay) : null,
                due_day: isCreditCard && dueDay ? parseInt(dueDay) : null,
            });
            onOpenChange(false);
        } catch (error) {
            console.error(error);
            alert('修改失败');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[420px]">
                <DialogHeader>
                    <DialogTitle>编辑账户 - {account.name}</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* 名称 */}
                    <div className="space-y-2">
                        <Label htmlFor="name">账户名称</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>

                    {/* 上级分组 */}
                    {!account.is_system && (
                        <div className="space-y-2">
                            <Label htmlFor="parent">上级分组</Label>
                            <select
                                id="parent"
                                value={parentId}
                                onChange={(e) => setParentId(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-950"
                            >
                                <option value="">(根目录)</option>
                                {parentOptions.map(({ account: acc, level }) => (
                                    <option key={acc.id} value={acc.id}>
                                        {'　'.repeat(level)}{acc.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* 币种（非分组账户） */}
                    {!account.is_group && (
                        <div className="space-y-2">
                            <Label htmlFor="currency" className="flex items-center justify-between">
                                <span>币种</span>
                                {hasTransactions && (
                                    <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                        已有交易，禁止修改
                                    </span>
                                )}
                            </Label>
                            <select
                                id="currency"
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value)}
                                disabled={hasTransactions || checkingTx}
                                className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                            >
                                {CURRENCIES.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* 状态 */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                            <Power className={cn("w-5 h-5", isActive ? "text-emerald-500" : "text-gray-400")} />
                            <div>
                                <p className="text-sm font-medium">账户状态</p>
                                <p className="text-xs text-gray-500">{isActive ? '账户已启用，可正常记账' : '账户已停用'}</p>
                            </div>
                        </div>
                        <Switch
                            checked={isActive}
                            onCheckedChange={setIsActive}
                        />
                    </div>

                    {/* 信用卡专属字段 */}
                    {isCreditCard && !account.is_group && (
                        <div className="space-y-4 p-4 border border-blue-50 bg-blue-50/30 rounded-lg">
                            <div className="space-y-2">
                                <Label htmlFor="creditLimit">信用额度</Label>
                                <Input
                                    id="creditLimit"
                                    type="number"
                                    value={creditLimit}
                                    onChange={(e) => setCreditLimit(e.target.value)}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="statementDay">账单日</Label>
                                    <select
                                        id="statementDay"
                                        value={statementDay}
                                        onChange={(e) => setStatementDay(e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                                    >
                                        <option value="">不设置</option>
                                        {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                                            <option key={day} value={day}>{day} 日</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="dueDay">还款日</Label>
                                    <select
                                        id="dueDay"
                                        value={dueDay}
                                        onChange={(e) => setDueDay(e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                                    >
                                        <option value="">不设置</option>
                                        {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                                            <option key={day} value={day}>{day} 日</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            取消
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            保存修改
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
