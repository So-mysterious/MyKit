/**
 * [性质]: [组件] 侧边栏导航
 * [Input]: None (Self-contained configuration)
 * [Output]: Sidebar UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LucideIcon,
  LayoutDashboard,
  List,
  Wallet,
  CalendarClock,
  Target,
  Settings,
  Database,
  ShieldAlert
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface SidebarItem {
  icon: LucideIcon;
  href: string;
  label: string;
}

// Interface kept for compatibility if needed, but items prop is optional/ignored in this implementation
interface SidebarProps {
  items?: SidebarItem[];
}

function SidebarLink({ item, isActive }: { item: SidebarItem; isActive: boolean }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const linkRef = useRef<HTMLAnchorElement>(null);

  const handleMouseEnter = () => {
    if (linkRef.current) {
      const rect = linkRef.current.getBoundingClientRect();
      setTooltipPos({
        top: rect.top + rect.height / 2,
        left: rect.right + 8,
      });
      setShowTooltip(true);
    }
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
  };

  return (
    <>
      <Link
        ref={linkRef}
        href={item.href}
        className={cn(
          "w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-200",
          isActive
            ? "bg-white text-black shadow-sm border border-gray-200"
            : "text-gray-500 hover:bg-gray-200 hover:text-gray-900"
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
      </Link>

      {/* Portal Tooltip - 渲染到 body 层级，确保始终在最上层 */}
      {showTooltip && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap pointer-events-none z-[9999]"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: 'translateY(-50%)',
          }}
        >
          {item.label}
        </div>,
        document.body
      )}
    </>
  );
}

export function Sidebar({ items: _ignoredItems }: SidebarProps) {
  const pathname = usePathname();

  const SIDEBAR_ITEMS: SidebarItem[] = [
    { icon: LayoutDashboard, href: '/bookkeeping/dashboard', label: '仪表盘' },
    { icon: List, href: '/bookkeeping/transactions', label: '流水' },
    { icon: Wallet, href: '/bookkeeping/accounts', label: '账户' },
    { icon: CalendarClock, href: '/bookkeeping/periodic', label: '周期' },
    { icon: Target, href: '/bookkeeping/budget', label: '预算' },
    { icon: ShieldAlert, href: '/bookkeeping/reconciliation', label: '查账' },
    { icon: Database, href: '/bookkeeping/data', label: '数据' },
    { icon: Settings, href: '/bookkeeping/settings', label: '设置' },
  ];

  return (
    <aside className="w-14 border-r border-gray-200 bg-gray-50 h-[calc(100vh-3.5rem)] flex flex-col items-center py-4 gap-2 sticky top-14 z-20">
      {SIDEBAR_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return <SidebarLink key={item.href} item={item} isActive={isActive} />;
      })}
    </aside>
  );
}
