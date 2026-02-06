/**
 * [性质]: [组件] 状态指示灯 (待核对/重要/性质/大额)
 * [Input]: Transaction Metadata
 * [Output]: Status Icons UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import { Star, AlertTriangle, Calendar, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusIndicatorsProps {
    isLargeExpense: boolean;
    isStarred: boolean;
    needsReview: boolean;
    nature: 'regular' | 'unexpected' | 'periodic';
    onToggle?: (field: "is_starred" | "needs_review" | "nature", value: any) => void;
    size?: number;
    className?: string;
}

/**
 * 「大」字图标 - 用于表示大额交易
 */
function LargeIcon({ size = 18, active }: { size?: number; active: boolean }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            className={cn(
                "transition-colors",
                active ? "text-red-500" : "text-gray-200"
            )}
        >
            <text
                x="12"
                y="17"
                textAnchor="middle"
                fontSize="16"
                fontWeight="bold"
                fill="currentColor"
            >
                大
            </text>
        </svg>
    );
}

/**
 * 斜向惊叹号图标 - 用于表示意外交易
 */
function ExclamationIcon({ size = 18, active }: { size?: number; active: boolean }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            className={cn(
                "transition-colors",
                active ? "text-amber-500" : "text-gray-200"
            )}
            style={{ transform: "rotate(-15deg)" }}
        >
            <circle cx="12" cy="19" r="2" fill="currentColor" />
            <path
                d="M12 3L12 14"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
            />
        </svg>
    );
}

/**
 * 状态指示灯组件 (v2 - 重构版本)
 * 
 * 从左到右顺序：
 * 1. 待核对 (AlertTriangle) - 红色，可点击
 * 2. 重要 (Star) - 黄色，可点击
 * 3. 性质 - 周期(Calendar蓝色只读) / 意外(Exclamation黄色) / 常规(Exclamation灰色)，非周期可点击
 * 4. 大额 (「大」字) - 红色，只读自动计算
 */
export function StatusIndicators({
    isLargeExpense,
    isStarred,
    needsReview,
    nature,
    onToggle,
    size = 18,
    className,
}: StatusIndicatorsProps) {
    const isPeriodic = nature === 'periodic';
    const isUnexpected = nature === 'unexpected';

    // 切换性质（仅在非周期时可用）
    const handleNatureToggle = () => {
        if (isPeriodic || !onToggle) return;
        // 在常规和意外之间切换
        const newNature = isUnexpected ? 'regular' : 'unexpected';
        onToggle('nature', newNature);
    };

    return (
        <div className={cn("flex items-center gap-0.5", className)}>
            {/* 1. 待核对 - 红色三角警告，可点击 */}
            <button
                type="button"
                onClick={() => onToggle?.("needs_review", !needsReview)}
                className={cn(
                    "p-0.5 rounded transition-colors",
                    needsReview ? "text-red-500" : "text-gray-200",
                    onToggle && "hover:bg-gray-100 cursor-pointer"
                )}
                title="待核对"
                disabled={!onToggle}
            >
                <AlertTriangle size={size} fill="none" />
            </button>

            {/* 2. 重要 - 黄色星星，可点击 */}
            <button
                type="button"
                onClick={() => onToggle?.("is_starred", !isStarred)}
                className={cn(
                    "p-0.5 rounded transition-colors",
                    isStarred ? "text-yellow-400" : "text-gray-200",
                    onToggle && "hover:bg-gray-100 cursor-pointer"
                )}
                title="重要标记"
                disabled={!onToggle}
            >
                <Star size={size} fill={isStarred ? "currentColor" : "none"} />
            </button>

            {/* 3. 性质 - 周期(蓝色日历只读) / 意外(黄色惊叹号) / 常规(灰色惊叹号) */}
            {isPeriodic ? (
                // 周期性交易 - 只读蓝色日历
                <div
                    className="p-0.5 rounded cursor-default text-blue-500"
                    title="周期性交易（自动创建，只读）"
                >
                    <Calendar size={size} />
                </div>
            ) : (
                // 非周期性 - 可切换的惊叹号
                <button
                    type="button"
                    onClick={handleNatureToggle}
                    className={cn(
                        "p-0.5 rounded transition-colors",
                        onToggle && "hover:bg-gray-100 cursor-pointer"
                    )}
                    title={isUnexpected ? "意外交易（点击切换为常规）" : "常规交易（点击切换为意外）"}
                    disabled={!onToggle}
                >
                    <ExclamationIcon size={size} active={isUnexpected} />
                </button>
            )}

            {/* 4. 大额 - 只读，自动计算 */}
            <div
                className="p-0.5 rounded cursor-default"
                title="大额交易（自动判断）"
            >
                <LargeIcon size={size} active={isLargeExpense} />
            </div>
        </div>
    );
}
