"use client";

import { Sidebar } from "@/components/Sidebar";
import { LayoutDashboard, List, Wallet, Settings, ShieldAlert, CalendarClock } from "lucide-react";

const bookkeepingNavItems = [
  { icon: LayoutDashboard, href: "/bookkeeping/dashboard", label: "仪表盘" },
  { icon: List, href: "/bookkeeping/transactions", label: "流水" },
  { icon: Wallet, href: "/bookkeeping/accounts", label: "账户" },
  { icon: CalendarClock, href: "/bookkeeping/periodic", label: "周期交易" },
  { icon: ShieldAlert, href: "/bookkeeping/reconciliation", label: "查账" },
  { icon: Settings, href: "/bookkeeping/settings", label: "设置" },
];

export default function BookkeepingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <Sidebar items={bookkeepingNavItems} />
      {/* 统一的内容区域：固定 padding，可滚动 */}
      <div className="flex-1 overflow-y-auto p-6">
        {children}
      </div>
    </div>
  );
}
