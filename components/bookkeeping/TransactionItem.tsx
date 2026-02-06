/**
 * [性质]: [组件] 交易列表项
 * [Input]: Transaction
 * [Output]: List Item UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Pencil } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { StatusIndicators } from "./StatusIndicators";
import { MoreInfoTooltip } from "./MoreInfoTooltip";
import { formatAmount, BookkeepingSettings } from "@/lib/bookkeeping/useSettings";
import { inferTransactionType, CURRENCY_SYMBOLS } from "@/lib/constants";
import { TransactionWithAccounts } from "@/types/database";
import { LongPressDeleteButton } from "./LongPressDeleteButton";

interface BookkeepingColors {
  expense: string;
  income: string;
  transfer: string;
}

interface TransactionItemProps {
  transaction: TransactionWithAccounts;
  colors?: BookkeepingColors;
  displaySettings?: Partial<BookkeepingSettings>;
  onEdit?: (transaction: TransactionWithAccounts) => void;
  onStatusChange?: (id: string, field: string, value: boolean) => void;
  onDelete?: (id: string) => void;
  isLinkedChild?: boolean;
}

const DEFAULT_COLORS: BookkeepingColors = {
  expense: "#ef4444",
  income: "#22c55e",
  transfer: "#6b7280",
};

function getCurrencySymbol(currency: string | null | undefined): string {
  if (!currency) return "¥";
  return CURRENCY_SYMBOLS[currency] || currency;
}

function isNominalAccount(account: any): boolean {
  if (!account) return false;
  if (account.account_class) return account.account_class === 'nominal';
  const type = account.type;
  return type === 'income' || type === 'expense' || type === 'equity';
}

/**
 * 交易列表项组件 (v7 - 优化列宽与删除功能)
 * 
 * 表格布局（优化后）：
 * 1. 状态 (110px)
 * 2. 时间 (90px)
 * 3. 转出账户 (1fr) - 居中，等宽
 * 4. 金额 (1fr) - 居中，等宽
 * 5. 转入账户 (1fr) - 居中，等宽
 * 6. 备注 (100px) - 大幅缩小
 * 7. 更多 (36px)
 * 8. 编辑 (36px)
 * 9. 删除 (36px) - 新增
 */
export function TransactionItem({
  transaction,
  colors = DEFAULT_COLORS,
  displaySettings,
  onEdit,
  onStatusChange,
  onDelete,
  isLinkedChild = false,
}: TransactionItemProps) {
  const {
    id,
    date,
    amount,
    from_amount,
    to_amount,
    description,
    from_account,
    to_account,
    is_large_expense,
    is_starred,
    needs_review,
    location,
    created_at,
    nature,
    project,
  } = transaction;

  // 备注悬浮状态
  const [showNoteTooltip, setShowNoteTooltip] = useState(false);
  const [noteTooltipPos, setNoteTooltipPos] = useState({ top: 0, left: 0, width: 0 });
  const noteRef = useRef<HTMLDivElement>(null);

  // 推断交易类型
  const fromType = from_account?.type || "asset";
  const toType = to_account?.type || "expense";
  let txType = inferTransactionType(fromType as any, toType as any);

  // 强制修正：如果标记为期初，则为 opening 类型
  if (transaction.is_opening) {
    txType = "opening";
  }

  // 金额颜色
  let amountColor = colors.transfer;
  let amountSign = "";

  if (txType === "expense") {
    amountColor = colors.expense;
    amountSign = "-";
  } else if (txType === "income") {
    amountColor = colors.income;
    amountSign = "+";
  } else if (txType === "opening") {
    // 期初余额：正数为流入（绿），负数为欠款/流出（红/蓝）
    if (amount >= 0) {
      amountColor = colors.income;
      amountSign = "+";
    } else {
      amountColor = colors.expense; // 欠款显示为红色
      amountSign = "-";
    }
  }

  // 时间格式化
  const dateObj = new Date(date);
  const timeStr = isLinkedChild
    ? format(dateObj, "M/d HH:mm", { locale: zhCN })  // 关联交易：月/日 时:分
    : format(dateObj, "HH:mm");                       // 普通交易：时:分

  // 账户信息
  const getDisplayAccountName = (acc: any) => {
    if (!acc) return "未知账户";
    // Check if account name is a currency code (3 uppercase letters)
    if (/^[A-Z]{3}$/.test(acc.name) && acc.parent?.name) {
      return `${acc.parent.name} (${acc.name})`;
    }
    return acc.name;
  };

  const fromAccountName = getDisplayAccountName(from_account);
  const toAccountName = getDisplayAccountName(to_account);
  const isFromNominal = isNominalAccount(from_account);
  const isToNominal = isNominalAccount(to_account);

  // 金额显示
  const fromCurrency = from_account?.currency;
  const toCurrency = to_account?.currency;

  let displayAmount = "";
  if (txType === "transfer" && fromCurrency !== toCurrency && from_amount && to_amount) {
    const fromSymbol = getCurrencySymbol(fromCurrency);
    const toSymbol = getCurrencySymbol(toCurrency);
    displayAmount = `${fromSymbol}${formatAmount(from_amount, displaySettings)} → ${toSymbol}${formatAmount(to_amount, displaySettings)}`;
  } else {
    const currency = from_account?.currency || to_account?.currency;
    const symbol = getCurrencySymbol(currency);
    const displayValue = to_amount || from_amount || amount;
    displayAmount = `${amountSign}${symbol}${formatAmount(Math.abs(displayValue), displaySettings)}`;
  }

  // 备注截断
  const MAX_NOTE_CHARS = 6;
  const noteText = description || "";
  const shouldTruncateNote = noteText.length > MAX_NOTE_CHARS;
  const displayNote = shouldTruncateNote ? noteText.slice(0, MAX_NOTE_CHARS) : noteText;

  const handleNoteMouseEnter = () => {
    if (shouldTruncateNote && noteRef.current) {
      const rect = noteRef.current.getBoundingClientRect();
      setNoteTooltipPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 200),
      });
      setShowNoteTooltip(true);
    }
  };

  const handleNoteMouseLeave = () => {
    setShowNoteTooltip(false);
  };

  const handleStatusToggle = (field: "is_starred" | "needs_review" | "nature", value: any) => {
    onStatusChange?.(id, field, value);
  };

  return (
    <div
      className={`group grid items-center py-2.5 px-6 border-b border-gray-50 hover:bg-blue-50/30 transition-colors text-sm ${isLinkedChild ? "bg-gray-50/50 border-l-2 border-l-blue-200" : ""
        }`}
      style={{ gridTemplateColumns: "110px 90px 1fr 1fr 1fr 100px 36px 36px 36px" }}
    >
      {/* Col 1: 状态指示灯 */}
      <div className="flex items-center">
        <StatusIndicators
          isLargeExpense={is_large_expense}
          isStarred={is_starred}
          needsReview={needs_review}
          nature={nature}
          onToggle={onStatusChange ? handleStatusToggle : undefined}
          size={18}
        />
      </div>

      {/* Col 2: 时间 */}
      <div className={`font-mono text-xs ${isLinkedChild ? 'text-blue-500' : 'text-gray-500'}`}>
        {timeStr}
      </div>

      {/* Col 3: 转出账户 - 居中 */}
      <div
        className={`truncate text-xs text-center px-2 ${isFromNominal ? 'text-gray-400' : 'text-gray-700 font-medium'}`}
        title={fromAccountName}
      >
        {fromAccountName}
      </div>

      {/* Col 4: 金额 - 居中 */}
      <div
        className="text-center font-bold font-mono text-sm whitespace-nowrap px-2"
        style={{ color: amountColor }}
      >
        {displayAmount}
      </div>

      {/* Col 5: 转入账户 - 居中 */}
      <div
        className={`truncate text-xs text-center px-2 ${isToNominal ? 'text-gray-400' : 'text-gray-700 font-medium'}`}
        title={toAccountName}
      >
        {toAccountName}
      </div>

      {/* Col 6: 备注 */}
      <div
        className="relative h-full flex items-center overflow-visible px-1"
        onMouseEnter={handleNoteMouseEnter}
        onMouseLeave={handleNoteMouseLeave}
        ref={noteRef}
      >
        <div className="text-gray-600 cursor-default w-full whitespace-nowrap overflow-hidden flex items-center text-xs">
          <span>{displayNote}</span>
          {shouldTruncateNote && <span className="text-gray-400 ml-px">...</span>}
        </div>

        {showNoteTooltip &&
          createPortal(
            <div
              className="fixed z-[9999] bg-white border border-gray-200 shadow-xl rounded-md p-3 text-xs text-gray-600 break-words whitespace-normal"
              style={{
                top: noteTooltipPos.top,
                left: noteTooltipPos.left,
                maxWidth: Math.max(noteTooltipPos.width, 300),
              }}
            >
              {noteText}
            </div>,
            document.body
          )}
      </div>

      {/* Col 7: 更多信息 */}
      <div className="flex justify-center">
        <MoreInfoTooltip
          location={location}
          createdAt={created_at}
          nature={nature}
          projectName={project?.name}
        />
      </div>

      {/* Col 8: 编辑按钮 */}
      <div className="flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onEdit?.(transaction)}
          title="编辑"
        >
          <Pencil size={14} className="text-gray-500" />
        </Button>
      </div>

      {/* Col 9: 删除按钮 */}
      <div className="flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        {onDelete && <LongPressDeleteButton onDelete={() => onDelete(id)} />}
      </div>
    </div>
  );
}

export function LinkedTransactionItem(props: TransactionItemProps) {
  return <TransactionItem {...props} isLinkedChild={true} />;
}
