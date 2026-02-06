/**
 * [性质]: [组件] 余额快照/校准对话框
 * [Input]: Account Balance
 * [Output]: Dialog
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { AlertTriangle, CalendarIcon, Loader2 } from "lucide-react";
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
import { createSnapshot, runReconciliationCheck, calculateBalance } from "@/lib/bookkeeping/actions";
import { supabase } from "@/lib/supabase/client";

interface SnapshotDialogProps {
  accountId: string;
  accountName: string;
  currentEstimatedBalance: number;
  currency: string;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
  defaultDate?: string; // YYYY-MM-DD 格式
  // 受控模式支持
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SnapshotDialog({
  accountId,
  accountName,
  currentEstimatedBalance,
  currency,
  trigger,
  onSuccess,
  defaultDate,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: SnapshotDialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);

  // 支持受控和非受控模式
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (controlledOnOpenChange || (() => { })) : setInternalOpen;
  const [actualBalance, setActualBalance] = React.useState("");
  // 使用完整的 datetime-local 格式 (YYYY-MM-DDTHH:mm)
  const [date, setDate] = React.useState(() => {
    if (defaultDate) return defaultDate;
    const now = new Date();
    // 格式化为 datetime-local 格式
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  });
  const [submitting, setSubmitting] = React.useState(false);

  // System calculation state
  const [systemBalance, setSystemBalance] = React.useState(currentEstimatedBalance || 0); // ✅ 默认0防止undefined
  const [isCalculating, setIsCalculating] = React.useState(false);

  const [diff, setDiff] = React.useState<number | null>(null);

  // Re-calculate when date changes using REAL logic
  React.useEffect(() => {
    if (!open) return;

    const fetchBalance = async () => {
      setIsCalculating(true);
      try {
        const bal = await calculateBalance(supabase, accountId, new Date(date));
        setSystemBalance(bal || 0); // ✅ 防止undefined
      } catch (e) {
        console.error(e);
      } finally {
        setIsCalculating(false);
      }
    };

    // Debounce slightly
    const timer = setTimeout(fetchBalance, 500);
    return () => clearTimeout(timer);
  }, [date, accountId, open]);

  // Calculate difference
  React.useEffect(() => {
    if (actualBalance && !isCalculating) {
      const val = parseFloat(actualBalance);
      if (!isNaN(val)) {
        setDiff(val - (systemBalance || 0)); // ✅ 防止undefined
      } else {
        setDiff(null);
      }
    } else {
      setDiff(null);
    }
  }, [actualBalance, systemBalance, isCalculating]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createSnapshot({
        account_id: accountId,
        balance: parseFloat(actualBalance),
        date: new Date(date).toISOString()
      });

      const shouldLogIssue = diff !== null && Math.abs(diff) > 0.01;

      if (shouldLogIssue) {
        await runReconciliationCheck(accountId);
      }

      // ✅ 显示成功提示
      alert('校准成功！');

      // ✅ 重置表单状态
      setActualBalance('');
      setDiff(null);

      // ✅ 触发父组件刷新（先刷新再关闭，确保数据更新）
      onSuccess?.();

      // ✅ 关闭对话框
      if (isControlled && controlledOnOpenChange) {
        controlledOnOpenChange(false);
      } else {
        setInternalOpen(false);
      }
    } catch (error: any) {
      // ✅ 改进错误提示，显示具体错误信息
      alert(error.message || '校准失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || <Button variant="outline" size="sm">校准余额</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>校准余额: {accountName}</DialogTitle>
          <DialogDescription>
            输入该日期的实际余额。系统仅校验此前流水的连贯性。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">

          <div className="space-y-2">
            <Label htmlFor="date">校准时间</Label>
            <div className="relative">
              <Input
                id="date"
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="pl-9"
                required
              />
              <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-lg flex justify-between items-center transition-colors duration-300">
              <span className="text-sm text-gray-500">系统计算值 ({date})</span>
              {isCalculating ? (
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              ) : (
                <span className="font-mono font-semibold animate-in fade-in">
                  {(systemBalance || 0).toFixed(2)} {currency}
                </span>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="actual">实际余额</Label>
              <div className="relative">
                <Input
                  id="actual"
                  type="number"
                  step="0.01"
                  placeholder={(systemBalance || 0).toString()}
                  value={actualBalance}
                  onChange={(e) => setActualBalance(e.target.value)}
                  className="pl-8 font-bold"
                  autoFocus
                />
                <span className="absolute left-3 top-2.5 text-gray-500">
                  {currency === 'CNY' ? '¥' : '$'}
                </span>
              </div>
            </div>

            {/* Audit Feedback */}
            {!isCalculating && diff !== null && Math.abs(diff) > 0.01 && (
              <div className="flex items-start gap-3 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm border border-amber-100 animate-in fade-in slide-in-from-top-2">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-semibold">发现差额: {diff > 0 ? '+' : ''}{diff.toFixed(2)}</p>
                  <p className="mt-1 opacity-90 text-xs">
                    ⚠️ 提交后将生成“查账标记”，请后续在设置页排查流水。
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!actualBalance || isCalculating || submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确认校准
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
