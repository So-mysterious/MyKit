"use client";

import { Sidebar } from "@/components/Sidebar";
import { LayoutDashboard, List, Wallet, Settings, ShieldAlert, CalendarClock, Target, Database } from "lucide-react";
import { BookkeepingCacheProvider } from "@/lib/bookkeeping/cache/BookkeepingCacheProvider";

const bookkeepingNavItems = [
  { icon: LayoutDashboard, href: "/bookkeeping/dashboard", label: "仪表盘" },
  { icon: List, href: "/bookkeeping/transactions", label: "流水" },
  { icon: Wallet, href: "/bookkeeping/accounts", label: "账户" },
  { icon: CalendarClock, href: "/bookkeeping/periodic", label: "周期交易" },
  { icon: Target, href: "/bookkeeping/budget", label: "预算" },
  { icon: ShieldAlert, href: "/bookkeeping/reconciliation", label: "查账" },
  { icon: Database, href: "/bookkeeping/data", label: "数据管理" },
  { icon: Settings, href: "/bookkeeping/settings", label: "设置" },
];

export default function BookkeepingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <BookkeepingCacheProvider>
      <div className="min-h-[calc(100vh-3.5rem)]">
        <Sidebar items={bookkeepingNavItems} />
        {/* 内容区域：固定左边距（sidebar宽度），可滚动 */}
        <div className="ml-14 p-6">
          {children}
        </div>
      </div>
    </BookkeepingCacheProvider>
  );
}
