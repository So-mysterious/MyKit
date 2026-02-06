/**
 * [性质]: [组件] 交易编辑/创建模态框
 * [Input]: Transaction (optional for editing)
 * [Output]: Modal Dialog
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { CalendarIcon, Loader2, Plus, MapPin, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createTransaction, updateTransaction } from "@/lib/bookkeeping/actions";
import { useBookkeepingCache } from "@/lib/bookkeeping/cache/BookkeepingCacheProvider";
import { inferTransactionType, CURRENCY_SYMBOLS } from "@/lib/constants";
import { AccountWithBalance, TransactionWithAccounts } from "@/types/database";
import { cn } from "@/lib/utils";

// ============================================================================
// 类型定义
// ============================================================================

export interface TransactionModalSuccessPayload {
  transactionId: string;
  type: string;
}

interface TransactionModalProps {
  trigger?: React.ReactNode;
  editMode?: boolean;
  initialData?: TransactionWithAccounts;
  onSuccess?: (payload: TransactionModalSuccessPayload) => void;
  onClose?: () => void;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 获取账户的显示名称（包含父路径）
 * 币种子户显示为 "父账户名 币种"，如 "工行(5738) CNY"
 */
function getAccountDisplayName(account: AccountWithBalance): string {
  const currencySet = new Set(['CNY', 'USD', 'HKD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'SGD', 'TWD', 'KRW', 'THB', 'MYR', 'PHP', 'INR', 'RUB', 'BRL', 'MXN', 'ZAR']);

  // 如果账户名本身就是币种代码（如 CNY、USD、HKD）
  if (currencySet.has(account.name)) {
    // 使用 full_path 获取父账户名
    // full_path 格式如: "资产:内地银行卡:工行（5738）:CNY"
    if (account.full_path) {
      const parts = account.full_path.split(':');
      if (parts.length >= 2) {
        // 倒数第二个是父账户
        const parentName = parts[parts.length - 2];
        return `${parentName} ${account.name}`;
      }
    }
    return account.name;
  }

  // 普通账户，显示名称和币种
  return `${account.name}${account.currency ? ` (${account.currency})` : ''}`;
}

function flattenAccounts(
  accounts: AccountWithBalance[],
  selectedIds: string[] = []
): Array<{ account: AccountWithBalance }> {
  const result: Array<{ account: AccountWithBalance }> = [];

  accounts.forEach(acc => {
    if (!acc.is_group) {
      // 仅包含活跃账户，或者是当前交易已选中的账户
      if ((acc as any).is_active !== false || selectedIds.includes(acc.id)) {
        result.push({ account: acc });
      }
    }
    if (acc.children && acc.children.length > 0) {
      result.push(...flattenAccounts(acc.children, selectedIds));
    }
  });

  return result;
}

function getCurrencySymbol(currency: string | null | undefined): string {
  if (!currency) return "¥";
  return CURRENCY_SYMBOLS[currency] || currency;
}

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
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px 12px',
        borderRadius: '8px',
        border: checked ? '1px solid #3b82f6' : '1px solid #e5e7eb',
        backgroundColor: checked ? '#3b82f6' : '#ffffff',
        color: checked ? '#ffffff' : '#4b5563',
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      {label}
    </button>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export function TransactionModal({
  trigger,
  editMode = false,
  initialData,
  onSuccess,
  onClose,
}: TransactionModalProps) {
  const cache = useBookkeepingCache();
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // 账户数据
  const [realAccounts, setRealAccounts] = React.useState<Array<{ account: AccountWithBalance }>>([]);
  const [expenseAccounts, setExpenseAccounts] = React.useState<Array<{ account: AccountWithBalance }>>([]);
  const [incomeAccounts, setIncomeAccounts] = React.useState<Array<{ account: AccountWithBalance }>>([]);

  // 交易类型
  const [txType, setTxType] = React.useState<"expense" | "income" | "transfer">("expense");

  // 表单状态
  const [amount, setAmount] = React.useState("");
  const [fromAccountId, setFromAccountId] = React.useState("");
  const [toAccountId, setToAccountId] = React.useState("");
  const [toAmount, setToAmount] = React.useState("");
  const [date, setDate] = React.useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [isStarred, setIsStarred] = React.useState(false);
  const [needsReview, setNeedsReview] = React.useState(false);
  const [nature, setNature] = React.useState<'regular' | 'unexpected' | 'periodic'>('regular');

  // 期初余额特殊处理
  const OPENING_BALANCE_ACCOUNT_ID = '00000000-0000-0000-0000-000000000006';
  const isOpeningBalanceTx = editMode && initialData?.is_opening === true;

  // 编辑模式自动打开
  React.useEffect(() => {
    if (editMode && initialData) {
      setOpen(true);
    }
  }, [editMode, initialData]);

  // 加载账户数据和初始化
  React.useEffect(() => {
    if (!open) return;

    cache.getAccounts({ includeBalance: false }).then((data) => {
      const selectedIds = [initialData?.from_account_id, initialData?.to_account_id].filter(Boolean) as string[];
      const real = flattenAccounts(data.filter(a => a.type === 'asset' || a.type === 'liability'), selectedIds);
      const expense = flattenAccounts(data.filter(a => a.type === 'expense'), selectedIds);
      const income = flattenAccounts(data.filter(a => a.type === 'income'), selectedIds);

      setRealAccounts(real);
      setExpenseAccounts(expense);
      setIncomeAccounts(income);

      // 设置默认选择
      if (!editMode) {
        if (real.length > 0) setFromAccountId(real[0].account.id);
        if (expense.length > 0) setToAccountId(expense[0].account.id);
      }
    }).catch(console.error);

    // 初始化编辑数据
    if (editMode && initialData) {
      setAmount(initialData.amount.toString());
      setFromAccountId(initialData.from_account_id);
      setToAccountId(initialData.to_account_id);
      setToAmount(initialData.to_amount?.toString() || "");
      setDate(initialData.date.split('T')[0]);
      setDescription(initialData.description || "");
      setLocation(initialData.location || "");
      setIsStarred(initialData.is_starred);
      setNeedsReview(initialData.needs_review);
      setNature(initialData.nature || 'regular');

      const fromType = initialData.from_account?.type;
      const toType = initialData.to_account?.type;
      const inferred = inferTransactionType(fromType as any, toType as any);
      if (inferred === 'expense') setTxType('expense');
      else if (inferred === 'income') setTxType('income');
      else setTxType('transfer');
    } else {
      setAmount("");
      setDescription("");
      setLocation("");
      setIsStarred(false);
      setNeedsReview(false);
      setNature('regular');
      setDate(new Date().toISOString().split('T')[0]);
      setToAmount("");
    }
  }, [open, editMode, initialData, cache]);

  // 交易类型切换时更新账户选择
  React.useEffect(() => {
    if (!open || editMode) return;

    if (txType === 'expense') {
      if (realAccounts.length > 0 && !realAccounts.find(r => r.account.id === fromAccountId)) {
        setFromAccountId(realAccounts[0].account.id);
      }
      if (expenseAccounts.length > 0) {
        setToAccountId(expenseAccounts[0].account.id);
      }
    } else if (txType === 'income') {
      if (incomeAccounts.length > 0) {
        setFromAccountId(incomeAccounts[0].account.id);
      }
      if (realAccounts.length > 0) {
        setToAccountId(realAccounts[0].account.id);
      }
    } else {
      if (realAccounts.length > 0) {
        setFromAccountId(realAccounts[0].account.id);
        if (realAccounts.length > 1) {
          setToAccountId(realAccounts[1].account.id);
        }
      }
    }
  }, [txType, realAccounts, expenseAccounts, incomeAccounts, open, editMode]);

  // 获取所有账户的扁平列表（用于查找币种）
  const allAccounts = React.useMemo(() =>
    [...realAccounts, ...incomeAccounts, ...expenseAccounts],
    [realAccounts, incomeAccounts, expenseAccounts]
  );

  // 根据账户ID获取币种
  const getCurrencyForAccount = React.useCallback((accountId: string) => {
    const acc = allAccounts.find(a => a.account.id === accountId);
    return acc?.account.currency || 'CNY';
  }, [allAccounts]);

  // 实时计算跨币种状态
  const fromCurrency = getCurrencyForAccount(fromAccountId);
  const toCurrency = getCurrencyForAccount(toAccountId);
  const isCrossCurrency = fromCurrency !== toCurrency;

  // 账户选择变更处理 - 确保不重复
  const handleFromAccountChange = (newFromId: string) => {
    if (newFromId === toAccountId) {
      // 找一个不同的账户给 toAccountId
      const options = txType === 'expense' ? expenseAccounts :
        txType === 'income' ? realAccounts : realAccounts;
      const alternative = options.find(o => o.account.id !== newFromId);
      if (alternative) {
        setToAccountId(alternative.account.id);
      }
    }
    setFromAccountId(newFromId);
  };

  const handleToAccountChange = (newToId: string) => {
    if (newToId === fromAccountId) {
      // 找一个不同的账户给 fromAccountId
      const options = txType === 'expense' ? realAccounts :
        txType === 'income' ? incomeAccounts : realAccounts;
      const alternative = options.find(o => o.account.id !== newToId);
      if (alternative) {
        setFromAccountId(alternative.account.id);
      }
    }
    setToAccountId(newToId);
  };

  // 提交处理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fromAccountId || !toAccountId) {
      alert("请选择账户！");
      return;
    }

    if (fromAccountId === toAccountId) {
      alert("转出和转入账户不能相同！");
      return;
    }

    setSubmitting(true);

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      let finalDateStr: string;

      if (date === todayStr) {
        finalDateStr = new Date().toISOString();
      } else {
        finalDateStr = new Date(date + 'T12:00:00.000Z').toISOString();
      }

      const txAmount = isOpeningBalanceTx ? parseFloat(amount) : Math.abs(parseFloat(amount));

      const txData = {
        from_account_id: isOpeningBalanceTx ? OPENING_BALANCE_ACCOUNT_ID : fromAccountId,
        to_account_id: toAccountId,
        amount: txAmount,
        // 如果是跨币种，记录绝对值金额；否则置为 null，由后端 create/update 处理
        from_amount: isCrossCurrency ? Math.abs(parseFloat(amount)) : null,
        to_amount: (isCrossCurrency && toAmount) ? Math.abs(parseFloat(toAmount)) : null,
        date: finalDateStr,
        description: description || null,
        location: location || null,
        is_starred: isStarred,
        needs_review: needsReview,
        nature: nature,
      };

      let result: any;
      if (editMode && initialData) {
        result = await updateTransaction(initialData.id, txData);
      } else {
        result = await createTransaction(txData);
      }

      setOpen(false);
      onSuccess?.({
        transactionId: result?.id || initialData?.id || '',
        type: txType,
      });
      onClose?.();
    } catch (error: any) {
      console.error('Failed to save transaction:', error);
      console.error('Error details:', error?.message || error?.code || JSON.stringify(error));
      alert(`保存失败: ${error?.message || '请重试'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      onClose?.();
    }
  };

  // 账户选项
  const fromOptions = txType === 'expense' ? realAccounts :
    txType === 'income' ? incomeAccounts : realAccounts;
  const toOptions = txType === 'expense' ? expenseAccounts :
    txType === 'income' ? realAccounts : realAccounts;

  // 触发器
  const triggerElement = trigger || (
    <Button className="rounded-full w-14 h-14 bg-black hover:bg-gray-800 shadow-lg">
      <Plus className="w-6 h-6 text-white" />
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!editMode && <DialogTrigger asChild>{triggerElement}</DialogTrigger>}
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editMode ? "编辑交易" : "记一笔"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          {/* 金额和日期 - 一行两列 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="amount" className="text-xs">转出金额 ({fromCurrency})</Label>
              <Input
                id="amount"
                type="number"
                placeholder="0.00"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-9"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="date" className="text-xs">日期</Label>
              <div className="relative">
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="pl-9 h-9"
                  required
                />
                <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              </div>
            </div>
          </div>

          {/* From 账户 */}
          <div className="space-y-1">
            <Label htmlFor="fromAccount" className="text-xs">
              {txType === 'expense' ? '付款账户' : txType === 'income' ? '收入来源' : '转出账户'}
            </Label>
            {isOpeningBalanceTx ? (
              /* 期初余额交易：锁定转出账户为“期初余额” */
              <div className="flex h-9 w-full items-center rounded-md border border-gray-200 bg-gray-100 px-3 py-1 text-sm text-gray-500 cursor-not-allowed">
                期初余额
              </div>
            ) : (
              <select
                id="fromAccount"
                className="flex h-9 w-full items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-1 text-sm ring-offset-white focus:outline-none focus:ring-2 focus:ring-gray-950 focus:ring-offset-2"
                value={fromAccountId}
                onChange={(e) => handleFromAccountChange(e.target.value)}
                required
              >
                {fromOptions.length === 0 && <option value="">无可用账户</option>}
                {fromOptions.map(({ account }) => (
                  <option key={account.id} value={account.id}>
                    {getAccountDisplayName(account)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* To 账户 */}
          <div className="space-y-1">
            <Label htmlFor="toAccount" className="text-xs">
              {txType === 'expense' ? '支出分类' : txType === 'income' ? '收款账户' : '转入账户'}
            </Label>
            <select
              id="toAccount"
              className="flex h-9 w-full items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-1 text-sm ring-offset-white focus:outline-none focus:ring-2 focus:ring-gray-950 focus:ring-offset-2"
              value={toAccountId}
              onChange={(e) => handleToAccountChange(e.target.value)}
              required
            >
              {toOptions.length === 0 && <option value="">无可用账户</option>}
              {toOptions.map(({ account }) => (
                <option key={account.id} value={account.id}>
                  {getAccountDisplayName(account)}
                </option>
              ))}
            </select>
          </div>

          {/* 跨币种金额 + 发生地 - 一行两列 */}
          <div className="grid grid-cols-2 gap-3">
            {isCrossCurrency ? (
              <div className="space-y-1">
                <Label htmlFor="toAmount" className="text-xs">转入金额 ({toCurrency})</Label>
                <Input
                  id="toAmount"
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  value={toAmount}
                  onChange={(e) => setToAmount(e.target.value)}
                  className="h-9"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="location" className="text-xs">发生地</Label>
                <div className="relative">
                  <Input
                    id="location"
                    placeholder="选填"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="pl-9 h-9"
                  />
                  <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="description" className="text-xs">备注</Label>
              <Input
                id="description"
                placeholder="记录一下..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          {/* 如果是跨币种，发生地单独一行 */}
          {isCrossCurrency && (
            <div className="space-y-1">
              <Label htmlFor="location2" className="text-xs">发生地</Label>
              <div className="relative">
                <Input
                  id="location2"
                  placeholder="选填"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="pl-9 h-9"
                />
                <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              </div>
            </div>
          )}

          {/* 标记按钮 - 均分三列 */}
          <div className="flex gap-2">
            <ToggleButton
              checked={isStarred}
              onChange={setIsStarred}
              label="重要"
            />
            <ToggleButton
              checked={needsReview}
              onChange={setNeedsReview}
              label="待核对"
            />
            <ToggleButton
              checked={nature === 'unexpected'}
              onChange={(checked) => setNature(checked ? 'unexpected' : 'regular')}
              label="意外"
            />
          </div>

          <DialogFooter>
            <Button type="submit" className="w-full bg-black hover:bg-gray-800" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
