import { Sidebar } from "@/components/Sidebar";
import { LayoutDashboard, List, Wallet, Settings } from "lucide-react";

const bookkeepingNavItems = [
  { icon: LayoutDashboard, href: "/bookkeeping/dashboard", label: "仪表盘" },
  { icon: List, href: "/bookkeeping/transactions", label: "流水" },
  { icon: Wallet, href: "/bookkeeping/accounts", label: "账户" },
  { icon: Settings, href: "/bookkeeping/settings", label: "设置" },
];

export default function BookkeepingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex">
      <Sidebar items={bookkeepingNavItems} />
      <div className="flex-1 p-6 bg-gray-50/50">
        {children}
      </div>
    </div>
  );
}

