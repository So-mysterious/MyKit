import Link from 'next/link';
import { Home, Calendar, CreditCard } from 'lucide-react';

export function TopNavBar() {
  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center px-4 justify-between sticky top-0 z-50">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-bold text-xl flex items-center gap-2">
          <div className="w-8 h-8 bg-black text-white rounded-lg flex items-center justify-center">
            M
          </div>
          <span>MyKit</span>
        </Link>
        
        <nav className="flex items-center gap-1">
          <Link 
            href="/bookkeeping" 
            className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-black hover:bg-gray-100 rounded-md transition-colors flex items-center gap-2"
          >
            <CreditCard size={16} />
            记账
          </Link>
          <Link 
            href="/calendar" 
            className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-black hover:bg-gray-100 rounded-md transition-colors flex items-center gap-2"
          >
            <Calendar size={16} />
            日程
          </Link>
        </nav>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Right side placeholder (e.g., user avatar later) */}
        <div className="w-8 h-8 bg-gray-100 rounded-full"></div>
      </div>
    </header>
  );
}

