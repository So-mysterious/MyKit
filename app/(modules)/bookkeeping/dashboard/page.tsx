"use client";

import * as React from "react";
import { Heatmap } from "./components/Heatmap";
import { TransactionExplorer } from "./components/TransactionExplorer";
import { LifeRecipe } from "./components/LifeRecipe";
import { getDashboardTransactions, getTodayCheckin, handleDailyCheckin } from "@/lib/bookkeeping/actions";
import { Button } from "@/components/ui/button";
import { CheckCircle, RefreshCw, Loader2 } from "lucide-react";

export default function DashboardPage() {
  const [transactions, setTransactions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [checkedToday, setCheckedToday] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<{
    executed: number;
    isFirstCheckin: boolean;
  } | null>(null);

  const fetchData = React.useCallback(async () => {
    try {
      const [txData, checkinData] = await Promise.all([
        getDashboardTransactions(),
        getTodayCheckin(),
      ]);
      setTransactions(txData || []);
      setCheckedToday(checkinData.checked);
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    }
  }, []);

  React.useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const handleCheckin = async () => {
    setChecking(true);
    try {
      const result = await handleDailyCheckin();
      setCheckedToday(true);
      setLastResult({
        executed: result.refreshResult.periodicTasks.executed,
        isFirstCheckin: result.isFirstCheckin,
      });
      // 刷新数据
      await fetchData();
    } catch (err) {
      console.error("Check-in failed", err);
      alert("打卡失败，请稍后重试");
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return <div className="text-center text-gray-500">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Dashboard</p>
          <h1 className="text-2xl font-bold tracking-tight">仪表盘</h1>
          <p className="text-sm text-gray-500">查看收支趋势、热力图与消费构成。</p>
        </div>

        {/* 每日打卡按钮 */}
        <div className="flex items-center gap-3">
          {lastResult && (
            <span className="text-sm text-gray-500">
              {lastResult.isFirstCheckin 
                ? `已打卡，执行了 ${lastResult.executed} 笔周期交易` 
                : `已刷新，执行了 ${lastResult.executed} 笔周期交易`}
            </span>
          )}
          <Button 
            onClick={handleCheckin} 
            disabled={checking}
            variant={checkedToday ? "outline" : "default"}
            className="gap-2"
          >
            {checking ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                处理中...
              </>
            ) : checkedToday ? (
              <>
                <RefreshCw size={16} />
                全局刷新
              </>
            ) : (
              <>
                <CheckCircle size={16} />
                每日打卡
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-10">
        <section className="w-full">
          <Heatmap transactions={transactions} />
        </section>

        <section className="w-full h-[500px]">
          <TransactionExplorer transactions={transactions} />
        </section>

        <section className="w-full h-[600px]">
          <LifeRecipe transactions={transactions} />
        </section>
      </div>
    </div>
  );
}
