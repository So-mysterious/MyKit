import { ArrowRightLeft, ArrowDownLeft, ArrowUpRight, Pencil, Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatAmount, BookkeepingSettings } from '@/lib/bookkeeping/useSettings';
import { Button } from '@/components/ui/button';

interface BookkeepingColors {
  expense: string;
  income: string;
  transfer: string;
}

interface TransactionItemProps {
  transaction: any;
  isMergedTransfer?: boolean;
  colors?: BookkeepingColors;
  displaySettings?: Partial<BookkeepingSettings>;
  onEdit?: (transaction: any) => void;
  onDelete?: (transaction: any) => void;
  isDeleting?: boolean;
}

const DEFAULT_COLORS: BookkeepingColors = {
  expense: "#ef4444",
  income: "#22c55e",
  transfer: "#0ea5e9",
};

export function TransactionItem({
  transaction,
  isMergedTransfer,
  colors = DEFAULT_COLORS,
  displaySettings,
  onEdit,
  onDelete,
  isDeleting = false,
}: TransactionItemProps) {
  const { type, amount, category, description, date, accounts, relatedTransfer } = transaction;
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0, width: 0 });
  const noteRef = useRef<HTMLDivElement>(null);

  // Styles & Icons based on Type
  let Icon = ArrowRightLeft;
  let iconColor = colors.transfer;
  let amountColor = "#111827"; // gray-900

  if (type === 'income') {
    Icon = ArrowDownLeft;
    iconColor = colors.income;
    amountColor = colors.income;
  } else if (type === 'expense') {
    Icon = ArrowUpRight;
    iconColor = colors.expense;
    amountColor = colors.expense;
  }

  // Formatting - 只在有具体时间时显示，使用UTC时间（不做时区转换）
  const dateObj = new Date(date);
  const hasSpecificTime = dateObj.getUTCHours() !== 0 || dateObj.getUTCMinutes() !== 0;
  // ✅ 使用UTC时间，格式化为HH:mm
  const timeStr = hasSpecificTime
    ? `${String(dateObj.getUTCHours()).padStart(2, '0')}:${String(dateObj.getUTCMinutes()).padStart(2, '0')}`
    : '';

  // Helper for currency symbol
  const getSymbol = (curr: string) => {
    if (curr === 'USD') return '$';
    if (curr === 'HKD') return 'HK$';
    if (curr === 'CNY') return '¥';
    return curr; // fallback to code if unknown
  };

  // Transfer Logic
  let displayTitle = category;
  let displayAccount = accounts?.name || "Unknown";
  let displayAmount: string | number = amount;

  if (isMergedTransfer && relatedTransfer) {
    const fromAcc = accounts?.name;
    const toAcc = relatedTransfer.accounts?.name;

    displayTitle = `划转`;

    // ✅ 健壮性检查：防止自转账显示和数据不完整情况
    if (!fromAcc || !toAcc) {
      // 数据不完整（账户信息缺失）
      displayAccount = `${fromAcc || '未知账户'} ➔ ${toAcc || '[已删除账户]'}`;
      amountColor = "#9ca3af"; // gray-400 表示数据异常
    } else if (fromAcc === toAcc) {
      // 自转账异常（理论上不应该出现）
      console.warn('发现自转账数据异常:', transaction.id);
      displayAccount = `${fromAcc} ➔ [数据异常]`;
      amountColor = "#ef4444"; // red 表示错误
    } else {
      // 正常的划转
      displayAccount = `${fromAcc} ➔ ${toAcc}`;
      amountColor = "#111827"; // gray-900 for normal transfers
    }

    const fromCurr = accounts?.currency;
    const toCurr = relatedTransfer.accounts?.currency;
    const fromSymbol = getSymbol(fromCurr);
    const toSymbol = getSymbol(toCurr);

    const formattedFromAmount = formatAmount(Math.abs(amount), displaySettings);
    const formattedToAmount = formatAmount(Math.abs(relatedTransfer.amount), displaySettings);

    if (fromCurr !== toCurr) {
      displayAmount = `${fromSymbol}${formattedFromAmount} ➔ ${toSymbol}${formattedToAmount}`;
    } else {
      displayAmount = `${fromSymbol}${formattedFromAmount}`;
    }
  } else if (type === 'transfer') {
    // ✅ 处理单独的划转流水（没有relatedTransfer的情况）
    // 这可能是不完整的transfer_group或者分页导致的
    displayTitle = `划转`;

    if (amount < 0) {
      displayAccount = `${accounts?.name || '未知'} ➔ [未显示]`;
    } else {
      displayAccount = `[未显示] ➔ ${accounts?.name || '未知'}`;
    }

    const currency = accounts?.currency || 'CNY';
    const symbol = getSymbol(currency);
    const formattedAbsAmount = formatAmount(Math.abs(amount), displaySettings);
    displayAmount = `${symbol}${formattedAbsAmount}`;
    amountColor = "#9ca3af"; // gray-400 表示不完整
  } else {
    const currency = accounts?.currency || 'CNY';
    const symbol = getSymbol(currency);

    const formattedAbsAmount = formatAmount(Math.abs(amount), displaySettings);
    const sign = amount > 0 ? '+' : '-';
    displayAmount = `${sign}${symbol}${formattedAbsAmount}`;
  }

  // Truncation Logic (10 chars max)
  const MAX_CHARS = 12;
  const noteText = description || "";
  const shouldTruncate = noteText.length > MAX_CHARS;
  // We keep exactly 10 chars, then append '...'
  // User asked for "fade out" effect starting from 11th char.
  // Simple approximation: standard ellipsis with a lighter color or opacity.
  const displayNote = shouldTruncate ? noteText.slice(0, MAX_CHARS) : noteText;

  const handleMouseEnter = () => {
    if (shouldTruncate && noteRef.current) {
      const rect = noteRef.current.getBoundingClientRect();
      setTooltipPos({
        top: rect.bottom,
        left: rect.left,
        width: rect.width,
      });
      setShowTooltip(true);
    }
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
  };

  return (
    <div
      className="group grid items-center py-3 px-6 border-b border-gray-50 hover:bg-blue-50/30 transition-colors text-sm"
      style={{ gridTemplateColumns: '180px 100px 220px 80px minmax(200px, 1fr) 160px 80px' }}
    >

      {/* Col 1: Category (Icon + Name) */}
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ color: iconColor }}>
          <Icon size={16} />
        </div>
        <span className="font-semibold text-gray-700 truncate" title={displayTitle}>{displayTitle}</span>
      </div>

      {/* Col 2: Tags (Empty for now) */}
      <div className="text-gray-400 truncate pl-0 pr-2">
        {/* Placeholder for tags */}
      </div>

      {/* Col 3: Note (Description) */}
      <div
        className="relative pl-0 pr-2 h-full flex items-center overflow-visible"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        ref={noteRef}
      >
        <div className="text-gray-400 cursor-default w-full whitespace-nowrap overflow-hidden flex items-center">
          <span>{displayNote}</span>
          {shouldTruncate && <span className="text-gray-300 ml-px">...</span>}
        </div>

        {/* Portal Tooltip */}
        {showTooltip && createPortal(
          <div
            className="fixed z-[9999] bg-white border border-gray-200 shadow-xl rounded-md p-3 text-xs text-gray-600 break-words whitespace-normal font-medium"
            style={{
              top: tooltipPos.top + 4, // slight offset
              left: tooltipPos.left,
              width: tooltipPos.width,
            }}
          >
            {noteText}
          </div>,
          document.body
        )}
      </div>

      {/* Col 4: Time */}
      <div className="text-gray-500 font-mono text-left pl-0 pr-2">
        {timeStr}
      </div>

      {/* Col 5: Account */}
      <div className="text-gray-500 truncate pl-0 pr-2" title={displayAccount}>
        {displayAccount}
        {/* Future: Add balance snapshot here if available, e.g. <span className="text-xs text-gray-300 ml-1">(...)</span> */}
      </div>

      {/* Col 6: Amount - Shifted Left */}
      <div className="text-right font-bold font-mono px-2" style={{ color: amountColor }}>
        {displayAmount}
      </div>

      {/* Col 7: Actions - Hover-activated buttons */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onEdit?.(transaction)}
          title="编辑"
        >
          <Pencil size={15} className="text-gray-500" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onDelete?.(transaction)}
          disabled={isDeleting}
          title="删除"
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 size={15} className="text-red-500" />
          )}
        </Button>
      </div>
    </div>
  );
}

