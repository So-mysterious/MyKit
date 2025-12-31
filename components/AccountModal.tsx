"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCOUNTS_TYPES, AccountType, CURRENCIES, Currency } from "@/lib/constants";
import { createAccount, updateAccount } from "@/lib/bookkeeping/actions";
import { Loader2 } from "lucide-react";

interface AccountModalProps {
  trigger?: React.ReactNode;
  mode?: 'create' | 'edit';
  initialData?: {
    id: string;
    name: string;
    type: AccountType;
    currency: Currency;
  };
  onSuccess?: () => void;
}

export function AccountModal({ trigger, mode = 'create', initialData, onSuccess }: AccountModalProps) {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Form States
  const [name, setName] = React.useState(initialData?.name || "");
  const [type, setType] = React.useState<AccountType>(initialData?.type || "Checking");
  const [currency, setCurrency] = React.useState<Currency>(initialData?.currency || "CNY");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'create') {
        await createAccount({ name, type, currency });
      } else if (initialData?.id) {
        await updateAccount(initialData.id, { name, type });
      }
      setOpen(false);
      if (!initialData) {
        // Reset form only on create
        setName("");
        setType("Checking");
        setCurrency("CNY");
      }
      onSuccess?.();
    } catch (error) {
      console.error(error);
      alert("操作失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="bg-black text-white hover:bg-black/90">
            新建账户
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '新建账户' : '编辑账户'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? '添加一个新的资金账户。' : '修改账户基本信息。'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">账户名称</Label>
            <Input
              id="name"
              placeholder="例如：招商银行储蓄卡"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">账户类型</Label>
              <select
                id="type"
                className="flex h-10 w-full items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={type}
                onChange={(e) => setType(e.target.value as AccountType)}
              >
                {Object.entries(ACCOUNTS_TYPES).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">币种</Label>
              <select
                id="currency"
                className="flex h-10 w-full items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
                disabled={mode === 'edit'} // Currency immutable
              >
                {CURRENCIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'create' ? '创建' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
