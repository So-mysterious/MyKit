'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarItem {
  icon: LucideIcon;
  href: string;
  label: string; // Used for tooltip/aria-label even if hidden
}

interface SidebarProps {
  items: SidebarItem[];
}

export function Sidebar({ items }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-14 border-r border-gray-200 bg-gray-50 h-[calc(100vh-3.5rem)] flex flex-col items-center py-4 gap-2 sticky top-14">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            className={cn(
              "w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-200 group relative",
              isActive 
                ? "bg-white text-black shadow-sm border border-gray-200" 
                : "text-gray-500 hover:bg-gray-200 hover:text-gray-900"
            )}
          >
            <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
            
            {/* Tooltip on hover */}
            <span className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              {item.label}
            </span>
          </Link>
        );
      })}
    </aside>
  );
}

