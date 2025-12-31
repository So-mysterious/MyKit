'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface SidebarItem {
  icon: LucideIcon;
  href: string;
  label: string;
}

interface SidebarProps {
  items: SidebarItem[];
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

export function Sidebar({ items }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-14 border-r border-gray-200 bg-gray-50 fixed top-14 left-0 h-[calc(100vh-3.5rem)] flex flex-col items-center py-4 gap-2 z-20">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return <SidebarLink key={item.href} item={item} isActive={isActive} />;
      })}
    </aside>
  );
}

