/**
 * [性质]: [页面] 记账模块布局 (侧边栏+缓存Provider)
 * [Input]: Children
 * [Output]: Layout UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import { Sidebar } from "@/components/Sidebar";
import { LayoutDashboard, List, Wallet, Settings, ShieldAlert, CalendarClock, Target } from "lucide-react";
import { BookkeepingCacheProvider } from "@/lib/bookkeeping/cache/BookkeepingCacheProvider";

const bookkeepingNavItems = [
  { icon: LayoutDashboard, href: "/bookkeeping/dashboard", label: "仪表盘" },
  { icon: List, href: "/bookkeeping/transactions", label: "流水" },
  { icon: Wallet, href: "/bookkeeping/accounts", label: "账户" },
  { icon: CalendarClock, href: "/bookkeeping/periodic", label: "周期交易" },
  { icon: Target, href: "/bookkeeping/budget", label: "预算" },
  { icon: ShieldAlert, href: "/bookkeeping/reconciliation", label: "查账" },
  { icon: Settings, href: "/bookkeeping/settings", label: "设置" },
];

export default function BookkeepingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <BookkeepingCacheProvider>
      <div className="flex h-[calc(100vh-3.5rem)]">
        <Sidebar items={bookkeepingNavItems} />
        {/* 统一的内容区域：固定 padding，可滚动 */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </div>
    </BookkeepingCacheProvider>
  );
}
