"use client";

import * as React from "react";
import { Heatmap } from "./components/Heatmap";
import { TransactionExplorer } from "./components/TransactionExplorer";
import { LifeRecipe } from "./components/LifeRecipe";
import { getDashboardTransactions } from "@/lib/bookkeeping/actions";

export default function DashboardPage() {
  const [transactions, setTransactions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    getDashboardTransactions()
      .then(data => setTransactions(data || []))
      .catch(err => console.error("Failed to load dashboard data", err))
      .finally(() => setLoading(false));
  }, []);

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
