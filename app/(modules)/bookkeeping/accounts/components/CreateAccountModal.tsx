/**
 * [性质]: [组件] 账户创建弹窗 (支持账户/分组模式)
 * [Input]: Parent Options
 * [Output]: Create Modal
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { Loader2, CreditCard, Wallet } from "lucide-react";
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

interface CreateAccountModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    accounts: AccountWithBalance[]; // 树形账户数据
    onSubmit: (data: CreateAccountData) => Promise<void>;
    mode?: 'account' | 'group';
    defaultParentId?: string | null; // 默认父级（上下文填充）
}

export interface CreateAccountData {
    name: string;
    parent_id: string;
    is_group: boolean;
    is_credit_card?: boolean; // 简化为布尔值
    currency?: string;
    credit_limit?: number;
    statement_day?: number;
    due_day?: number;
    // 期初信息（仅叶子账户）
    opening_date?: string;    // 期初时间（ISO 格式）
    opening_balance?: number; // 期初余额
}

// 递归扁平化账户树，只保留分组账户
function flattenGroups(accounts: AccountWithBalance[], level = 0): Array<{ account: AccountWithBalance; level: number }> {
    const result: Array<{ account: AccountWithBalance; level: number }> = [];

    accounts.forEach(acc => {
        if (acc.is_group) {
            result.push({ account: acc, level });
            if (acc.children && acc.children.length > 0) {
                result.push(...flattenGroups(acc.children, level + 1));
            }
        }
    });

    return result;
}

// 递归在树中查找账户
function findAccountInTree(accounts: AccountWithBalance[], id: string): AccountWithBalance | null {
    for (const acc of accounts) {
        if (acc.id === id) return acc;
        if (acc.children) {
            const found = findAccountInTree(acc.children, id);
            if (found) return found;
        }
    }
    return null;
}

export function CreateAccountModal({
    open,
    onOpenChange,
    accounts,
    onSubmit,
    mode = 'account',
    defaultParentId,
}: CreateAccountModalProps) {
    const [submitting, setSubmitting] = React.useState(false);

    // 表单状态
    const [parentId, setParentId] = React.useState<string>('');
    const [name, setName] = React.useState('');
    const [currency, setCurrency] = React.useState('CNY');
    const [isCreditCard, setIsCreditCard] = React.useState(false);
    const [creditLimit, setCreditLimit] = React.useState('');
    const [statementDay, setStatementDay] = React.useState('');
    const [dueDay, setDueDay] = React.useState('');
    // 期初信息
    const [openingDate, setOpeningDate] = React.useState(
        new Date().toISOString().split('T')[0] // 默认今天
    );
    const [openingBalance, setOpeningBalance] = React.useState('0');

    // 获取可选的父账户（显示所有分组）
    const parentOptions = React.useMemo(() => {
        return flattenGroups(accounts);
    }, [accounts]);

    // 初始化表单（打开时重置）
    React.useEffect(() => {
        if (open) {
            setName('');
            setCurrency('CNY');
            setCreditLimit('');
            setStatementDay('');
            setDueDay('');
            setOpeningBalance('0');
        }
    }, [open]);

    // 设置默认父级并根据父级类型自动设置信用卡模式
    React.useEffect(() => {
        if (!open || parentOptions.length === 0) return;

        let targetParentId = parentId;

        // 首次打开或 defaultParentId 改变时设置
        if (defaultParentId && !parentId) {
            const isValidDefault = parentOptions.some(p => p.account.id === defaultParentId);
            if (isValidDefault) {
                targetParentId = defaultParentId;
            }
        }

        // 如果没有有效的 parentId，选第一个
        if (!targetParentId || !parentOptions.find(p => p.account.id === targetParentId)) {
            targetParentId = parentOptions[0].account.id;
        }

        if (targetParentId !== parentId) {
            setParentId(targetParentId);
        }

        // 自动设置信用卡开关（如果父级是负债类）
        const parent = parentOptions.find(p => p.account.id === targetParentId);
        if (parent && parent.account.type === 'liability') {
            setIsCreditCard(true);
        } else {
            setIsCreditCard(false);
        }
    }, [open, defaultParentId, parentOptions, parentId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim() || !parentId) {
            return;
        }

        setSubmitting(true);
        try {
            await onSubmit({
                name: name.trim(),
                parent_id: parentId,
                is_group: mode === 'group',
                is_credit_card: mode === 'account' ? isCreditCard : undefined,
                currency: mode === 'account' ? currency : undefined,
                credit_limit: isCreditCard && creditLimit ? parseFloat(creditLimit) : undefined,
                statement_day: isCreditCard && statementDay ? parseInt(statementDay) : undefined,
                due_day: isCreditCard && dueDay ? parseInt(dueDay) : undefined,
                // 期初信息（仅叶子账户）
                opening_date: mode === 'account' ? openingDate : undefined,
                opening_balance: mode === 'account' && openingBalance ? parseFloat(openingBalance) : 0,
            });
            onOpenChange(false);
        } catch (error) {
            console.error(error);
            alert(mode === 'group' ? '创建分组失败' : '创建账户失败');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[720px]">
                <DialogHeader>
                    <DialogTitle>{mode === 'group' ? '新建分组' : '新建账户'}</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* 左侧：基本信息 */}
                        <div className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="parent">上级分组</Label>
                                <select
                                    id="parent"
                                    value={parentId}
                                    onChange={(e) => setParentId(e.target.value)}
                                    className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white focus:outline-none focus:ring-2 focus:ring-gray-950 focus:ring-offset-2"
                                    required
                                >
                                    {parentOptions.map(({ account, level }) => (
                                        <option key={account.id} value={account.id}>
                                            {'　'.repeat(level)}{account.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="name">{mode === 'group' ? '分组名称' : '账户名称'}</Label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder={mode === 'group' ? '例如：银行账户' : '例如：招商银行储蓄卡'}
                                    autoFocus
                                    required
                                />
                            </div>

                            {mode === 'account' && (
                                <>
                                    <div className="space-y-2">
                                        <Label htmlFor="currency">币种</Label>
                                        <select
                                            id="currency"
                                            value={currency}
                                            onChange={(e) => setCurrency(e.target.value)}
                                            className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white focus:outline-none focus:ring-2 focus:ring-gray-950 focus:ring-offset-2"
                                        >
                                            {CURRENCIES.map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            {isCreditCard ? (
                                                <CreditCard className="w-5 h-5 text-rose-500" />
                                            ) : (
                                                <Wallet className="w-5 h-5 text-emerald-500" />
                                            )}
                                            <div>
                                                <p className="text-sm font-medium">信用卡账户</p>
                                                <p className="text-[10px] text-gray-500">开启后可设置额度、账单日等</p>
                                            </div>
                                        </div>
                                        <Switch
                                            checked={isCreditCard}
                                            onCheckedChange={setIsCreditCard}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        {/* 右侧：高级设置 & 期初 */}
                        {mode === 'account' && (
                            <div className="space-y-5">
                                {/* 信用卡属性 */}
                                {isCreditCard && (
                                    <div className="space-y-4 p-4 border border-rose-100 bg-rose-50/50 rounded-lg">
                                        <div className="space-y-2">
                                            <Label htmlFor="creditLimit">信用额度</Label>
                                            <Input
                                                id="creditLimit"
                                                type="number"
                                                value={creditLimit}
                                                onChange={(e) => setCreditLimit(e.target.value)}
                                                placeholder="例如：50000"
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

                                {/* 期初信息 */}
                                <div className="space-y-4 p-4 border border-blue-100 bg-blue-50/50 rounded-lg">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-sm font-medium text-blue-700">期初信息</span>
                                        <span className="text-[10px] text-blue-500">（账户创建时的余额）</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="openingDate">期初时间</Label>
                                            <Input
                                                id="openingDate"
                                                type="date"
                                                value={openingDate}
                                                onChange={(e) => setOpeningDate(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="openingBalance">
                                                期初余额 {isCreditCard && <span className="text-[10px] text-gray-400">（欠款为负）</span>}
                                            </Label>
                                            <Input
                                                id="openingBalance"
                                                type="number"
                                                step="0.01"
                                                value={openingBalance}
                                                onChange={(e) => setOpeningBalance(e.target.value)}
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {mode === 'group' && (
                            <div className="flex items-center justify-center bg-gray-50 rounded-lg p-10 text-gray-400 text-sm">
                                分组用于对账户进行分类汇总
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            取消
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {mode === 'group' ? '创建分组' : '创建账户'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
