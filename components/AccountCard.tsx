import { Wallet, CreditCard, Banknote, TrendingUp } from 'lucide-react';
import { ACCOUNTS_TYPES, AccountType } from '@/lib/constants';

interface AccountCardProps {
  name: string;
  type: AccountType;
  currency: string;
  balance: number;
  onClick?: () => void;
}

const TYPE_ICONS = {
  Checking: Banknote,
  Credit: CreditCard,
  Asset: TrendingUp,
  Wallet: Wallet,
};

export function AccountCard({ name, type, currency, balance, onClick }: AccountCardProps) {
  const Icon = TYPE_ICONS[type] || Wallet;
  
  // Format currency
  const formattedBalance = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: currency,
  }).format(balance);

  return (
    <div 
      onClick={onClick}
      className="group relative rounded-xl border bg-white p-6 shadow-sm transition-all hover:shadow-md cursor-pointer h-full flex flex-col justify-between"
    >
      {/* Top Row: Name & Type */}
      <div className="flex items-start justify-between pr-20"> {/* pr-20 to avoid overlap with absolute actions */}
        <div className="space-y-1">
          <h3 className="font-semibold text-lg leading-none tracking-tight text-gray-900 group-hover:text-black truncate">
            {name}
          </h3>
          <div className="flex items-center gap-1.5 text-gray-500">
             <Icon size={14} />
             <span className="text-xs font-medium">{ACCOUNTS_TYPES[type]}</span>
          </div>
        </div>
      </div>
      
      {/* Bottom Row: Balance */}
      <div className="mt-6">
        <div className="text-2xl font-bold tracking-tight text-gray-900">
          {formattedBalance}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          当前估算余额
        </p>
      </div>
    </div>
  );
}
