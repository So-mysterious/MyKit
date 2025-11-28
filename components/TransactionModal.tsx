"use client";

import * as React from "react";
import { CalendarIcon, Loader2 } from "lucide-react";
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
import { createTransaction, getAvailableTags, BookkeepingKind } from "@/lib/bookkeeping/actions";

export interface TransactionModalSuccessPayload {
  accountId: string;
  type: "income" | "expense" | "transfer";
  toAccountId?: string;
}

interface TransactionModalProps {
  accounts?: { id: string; name: string; currency: string }[];
  onSuccess?: (payload: TransactionModalSuccessPayload) => void;
  trigger?: React.ReactNode;
  defaultAccountId?: string;
}

export function TransactionModal({ accounts = [], onSuccess, trigger, defaultAccountId }: TransactionModalProps) {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [type, setType] = React.useState<"expense" | "income" | "transfer">("expense");
  
  // Dynamic tags
  const [availableTags, setAvailableTags] = React.useState<{ kind: string, name: string }[]>([]);
  
  // Form States
  const [amount, setAmount] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [accountId, setAccountId] = React.useState(defaultAccountId || "");
  const [date, setDate] = React.useState(new Date().toISOString().split('T')[0]);
  
  // Transfer Specific States
  const [toAccountId, setToAccountId] = React.useState("");
  const [toAmount, setToAmount] = React.useState(""); 

  React.useEffect(() => {
    if (open) {
      getAvailableTags().then(setAvailableTags).catch(console.error);
    }
  }, [open]);

  // ... (Same initialization effects) ...
  React.useEffect(() => {
    if (!open) return;

    if (!accountId) {
      if (defaultAccountId) {
        setAccountId(defaultAccountId);
      } else if (accounts.length > 0) {
        setAccountId(accounts[0].id);
      }
    }

    if (!toAccountId) {
      const fallbackTarget = accounts.find(acc => acc.id !== (defaultAccountId || accountId));
      if (fallbackTarget) {
        setToAccountId(fallbackTarget.id);
      } else if (accounts.length > 1) {
        setToAccountId(accounts[1].id);
      }
    }
  }, [open, accounts, accountId, toAccountId, defaultAccountId]);

  React.useEffect(() => {
    if (!open && defaultAccountId) {
      setAccountId(defaultAccountId);
    }
  }, [defaultAccountId, open]);

  // Reset toAccount if it conflicts with current account
  React.useEffect(() => {
    if (type === 'transfer' && toAccountId === accountId) {
        // Find a new target that isn't current
        const fallback = accounts.find(a => a.id !== accountId);
        if (fallback) {
            setToAccountId(fallback.id);
        } else {
            setToAccountId("");
        }
    }
  }, [type, accountId, toAccountId, accounts]);
  
  const currentCategories = React.useMemo(() => {
    // Filter tags by type
    const filtered = availableTags
        .filter(t => t.kind === type)
        .map(t => t.name);
    
    if (filtered.length === 0) return ['默认'];
    return filtered;
  }, [type, availableTags]);

  React.useEffect(() => {
    if (currentCategories.length > 0 && !currentCategories.includes(category)) {
    setCategory(currentCategories[0]);
    }
  }, [currentCategories, category]);

  React.useEffect(() => {
    if (open) {
      setAmount("");
      setDescription("");
      setDate(new Date().toISOString().split('T')[0]);
      setToAmount("");
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) {
        alert("请先创建账户！");
        return;
    }
    
    setSubmitting(true);
    try {
        const absAmount = Math.abs(parseFloat(amount));
        let finalAmount = absAmount;
        if (type === 'expense') {
            finalAmount = -absAmount;
        } else if (type === 'transfer') {
            finalAmount = -absAmount; 
        }

        const todayStr = new Date().toISOString().split('T')[0];
        let finalDateStr: string;
        
        if (date === todayStr) {
            finalDateStr = new Date().toISOString();
        } else {
            finalDateStr = new Date(date + 'T12:00:00.000Z').toISOString(); 
        }
        
        if (date === todayStr) {
            finalDateStr = new Date().toISOString();
        }

        await createTransaction({
            account_id: accountId,
            type,
            amount: finalAmount,
            category: category || '默认',
            date: finalDateStr,
            description,
            to_account_id: type === 'transfer' ? toAccountId : undefined,
            to_amount: type === 'transfer' && toAmount ? Math.abs(parseFloat(toAmount)) : undefined
        });

        setOpen(false);
        onSuccess?.({
          accountId,
          type,
          toAccountId: type === 'transfer' ? toAccountId : undefined,
        });
    } catch (error) {
        console.error(error);
        alert("保存失败");
    } finally {
        setSubmitting(false);
    }
  };
  
  const getAccountCurrency = (id: string) => accounts.find(a => a.id === id)?.currency || "";

  return (
     <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="bg-black text-white hover:bg-black/90 shadow-lg rounded-full px-6">
            记一笔
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>记一笔</DialogTitle>
        </DialogHeader>

        {/* Type Switcher */}
        <div className="grid grid-cols-3 gap-2 mb-4 p-1 bg-gray-100 rounded-lg">
          <button
            type="button"
            onClick={() => setType("expense")}
            className={`text-sm font-medium py-1.5 rounded-md transition-all ${
              type === "expense" ? "bg-white shadow-sm text-red-600" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            支出
          </button>
          <button
            type="button"
            onClick={() => setType("income")}
            className={`text-sm font-medium py-1.5 rounded-md transition-all ${
              type === "income" ? "bg-white shadow-sm text-green-600" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            收入
          </button>
          <button
            type="button"
            onClick={() => setType("transfer")}
            className={`text-sm font-medium py-1.5 rounded-md transition-all ${
              type === "transfer" ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            划转
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Amount & Account Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">{type === 'transfer' ? '转出金额' : '金额'}</Label>
              <div className="relative">
                <Input
                  id="amount"
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-8 text-lg font-semibold"
                  required
                />
                <span className="absolute left-3 top-2.5 text-gray-500 text-sm">
                  {getAccountCurrency(accountId) === 'CNY' ? '¥' : '$'}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="account">{type === 'transfer' ? '转出账户' : '账户'}</Label>
              <select
                id="account"
                className="flex h-10 w-full items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                required
              >
                {accounts.length === 0 && <option value="">无账户</option>}
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Transfer: Target Account & Amount - 与上方转出行对齐 */}
          {type === 'transfer' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="toAmount">转入金额 (选填)</Label>
                  <div className="relative">
                    <Input
                      id="toAmount"
                      type="number"
                      placeholder={amount || "0.00"} 
                      step="0.01"
                      value={toAmount}
                      onChange={(e) => setToAmount(e.target.value)}
                    className="pl-8 text-lg font-semibold"
                    />
                     <span className="absolute left-3 top-2.5 text-gray-500 text-sm">
                      {getAccountCurrency(toAccountId) === 'CNY' ? '¥' : '$'}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500">留空则默认等于转出金额</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="toAccount">转入账户</Label>
                  <select
                    id="toAccount"
                    className="flex h-10 w-full items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={toAccountId}
                    onChange={(e) => setToAccountId(e.target.value)}
                    required
                  >
                    {accounts.filter(a => a.id !== accountId).map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.currency})
                      </option>
                    ))}
                  </select>
              </div>
            </div>
          )}

          {/* Category & Date */}
          <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                <Label htmlFor="category">分类</Label>
                <select
                    id="category"
                    className="flex h-10 w-full items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                >
                    {currentCategories.map(c => (
                    <option key={c} value={c}>{c}</option>
                    ))}
                </select>
                </div>
            
            <div className="space-y-2">
              <Label htmlFor="date">日期</Label>
              <div className="relative">
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="pl-9"
                  required
                />
                <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">备注</Label>
            <Textarea
              id="description"
              placeholder="记录一下..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none"
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
