"use client";

import * as React from "react";
import { AccountCard } from "@/components/AccountCard";
import { Button } from "@/components/ui/button";
import { TransactionModal } from "@/components/TransactionModal";
import { SnapshotDialog } from "@/components/SnapshotDialog";
import { AccountModal } from "@/components/AccountModal";
import { Edit, Trash2, MoreVertical, Loader2, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteAccount } from "@/lib/bookkeeping/actions";
import { useBookkeepingCache } from "@/lib/bookkeeping/cache/BookkeepingCacheProvider";
import { AccountType, Currency } from "@/lib/constants";

interface AccountWithBalance {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance: number;
  credit_limit?: number | null;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = React.useState<AccountWithBalance[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  // 使用缓存Hook
  const cache = useBookkeepingCache();

  const fetchAccounts = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // 使用缓存获取账户数据
      const data = await cache.getAccounts({ includeBalance: true });
      setAccounts(data as unknown as AccountWithBalance[]);
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
      alert("加载账户失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cache.getAccounts]); // ✅ 只依赖稳定的getAccounts函数

  React.useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除账户 "${name}" 吗？\n\n⚠️ 警告：所有相关数据将被永久删除：\n• 所有流水记录\n• 所有快照记录\n• 相关的划转记录（含对侧账户）\n• 查账记录\n• 周期任务\n\n此操作不可恢复！`)) {
      return;
    }

    try {
      console.log('开始删除账户:', id, name);

      // 执行删除
      const result = await deleteAccount(id);
      console.log('删除成功:', result);

      // 立即更新UI：从当前状态中移除已删除的账户
      setAccounts(prev => prev.filter(acc => acc.id !== id));

      // 失效所有相关缓存（后台异步执行）
      cache.invalidateAndRefresh([
        'accounts',
        'dashboardTransactions',
        'heatmapAggregation',
        'dashboardBudgetData'
      ]).catch(err => console.error('缓存失效失败:', err));

      alert(`账户 "${name}" 已成功删除`);
    } catch (error) {
      console.error('删除账户失败:', error);
      alert(`删除失败：${error instanceof Error ? error.message : '未知错误'}\n\n请检查控制台了解详细信息。`);
      // 删除失败，重新加载以确保UI正确
      await fetchAccounts();
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // 强制刷新：失效缓存并重新加载
      await cache.invalidateAndRefresh(['accounts']);
      await fetchAccounts();
    } finally {
      setRefreshing(false);
    }
  };

  const handleSuccess = async () => {
    // CRUD操作成功后：失效缓存并刷新
    await cache.invalidateAndRefresh(['accounts']);
    await fetchAccounts();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Accounts</p>
            <h1 className="text-2xl font-bold tracking-tight">账户管理</h1>
            <p className="text-sm text-gray-500">管理你的银行卡、信用卡、电子钱包等账户。</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            className={refreshing ? "animate-spin" : ""}
            title="强制刷新余额"
          >
            <RefreshCw size={18} />
          </Button>
        </div>
        <div className="flex gap-2">
          <AccountModal onSuccess={handleSuccess} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.length === 0 ? (
            <div className="col-span-full text-center p-8 border border-dashed rounded-lg text-gray-500">
              暂无账户，请点击右上角新建。
            </div>
          ) : (
            accounts.map((account) => (
              <div key={account.id} className="relative group h-full">
                <AccountCard
                  name={account.name}
                  type={account.type as AccountType}
                  currency={account.currency}
                  balance={account.balance}
                />

                {/* Actions Row */}
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <SnapshotDialog
                    accountName={account.name}
                    accountId={account.id}
                    currency={account.currency}
                    currentEstimatedBalance={account.balance}
                    trigger={
                      <Button size="sm" variant="secondary" className="h-8 px-2 bg-white/90 backdrop-blur hover:bg-white shadow-sm text-xs">
                        校准
                      </Button>
                    }
                    onSuccess={handleSuccess}
                  />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="secondary" className="h-8 w-8 p-0 bg-white/90 backdrop-blur hover:bg-white shadow-sm">
                        <MoreVertical size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>账户操作</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <AccountModal
                        mode="edit"
                        initialData={{
                          id: account.id,
                          name: account.name,
                          type: account.type as AccountType,
                          currency: account.currency as Currency
                        }}
                        onSuccess={handleSuccess}
                        trigger={
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                            <Edit className="mr-2 h-4 w-4" /> 编辑信息
                          </DropdownMenuItem>
                        }
                      />
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        onClick={() => handleDelete(account.id, account.name)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> 删除账户
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div className="fixed bottom-8 right-8">
        <TransactionModal accounts={accounts} onSuccess={handleSuccess} />
      </div>
    </div>
  );
}
