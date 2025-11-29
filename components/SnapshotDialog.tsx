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
import { calculateBalance } from "@/lib/bookkeeping/logic";
import { createSnapshot, runReconciliationCheck } from "@/lib/bookkeeping/actions";
import { supabase } from "@/lib/supabase"; // logic.ts needs client passed, or we can import inside logic.ts. 
// In logic.ts I defined calculateBalance to accept 'supabase'. Ideally logic.ts should export a version that uses the default client or accept it.
// Let's just use the logic one and pass client.

interface SnapshotDialogProps {
  accountId: string;
  accountName: string;
  currentEstimatedBalance: number;
  currency: string;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
  defaultDate?: string; // YYYY-MM-DD 格式
}

export function SnapshotDialog({ accountId, accountName, currentEstimatedBalance, currency, trigger, onSuccess, defaultDate }: SnapshotDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [actualBalance, setActualBalance] = React.useState("");
  const [date, setDate] = React.useState(defaultDate || new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = React.useState(false);
  
  // System calculation state
  const [systemBalance, setSystemBalance] = React.useState(currentEstimatedBalance);
  const [isCalculating, setIsCalculating] = React.useState(false);
  
  const [diff, setDiff] = React.useState<number | null>(null);

  // Re-calculate when date changes using REAL logic
  React.useEffect(() => {
    if (!open) return;
    
    const fetchBalance = async () => {
        setIsCalculating(true);
        try {
            const bal = await calculateBalance(supabase, accountId, new Date(date));
            setSystemBalance(bal);
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
        setDiff(val - systemBalance);
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
            await runReconciliationCheck({
                accountId,
                source: 'snapshot'
            });
        }
        setOpen(false);
        onSuccess?.();
    } catch (error) {
        alert("校准失败");
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
            <Label htmlFor="date">校准日期</Label>
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

          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-lg flex justify-between items-center transition-colors duration-300">
              <span className="text-sm text-gray-500">系统计算值 ({date})</span>
              {isCalculating ? (
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              ) : (
                <span className="font-mono font-semibold animate-in fade-in">
                  {systemBalance.toFixed(2)} {currency}
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
                  placeholder={systemBalance.toString()}
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
