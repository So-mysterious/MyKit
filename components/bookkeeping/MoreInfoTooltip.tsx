/**
 * [性质]: [组件] 更多信息提示框
 * [Input]: Transaction Metadata
 * [Output]: Tooltip UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

interface MoreInfoTooltipProps {
    location?: string | null;
    createdAt?: string | null;
    nature?: "regular" | "unexpected" | "periodic";
    projectName?: string | null;
    className?: string;
}

const NATURE_LABELS: Record<string, string> = {
    regular: "常规",
    unexpected: "意外",
    periodic: "周期",
};

/**
 * 更多信息悬浮组件
 * 鼠标悬停在「...」上时显示附加信息
 */
export function MoreInfoTooltip({
    location,
    createdAt,
    nature,
    projectName,
    className,
}: MoreInfoTooltipProps) {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);

    // 检查是否有任何信息需要显示
    const hasInfo = location || createdAt || projectName;

    const handleMouseEnter = () => {
        if (buttonRef.current && hasInfo) {
            const rect = buttonRef.current.getBoundingClientRect();
            setTooltipPos({
                top: rect.bottom + 4,
                left: rect.left - 100, // 向左偏移以居中
            });
            setShowTooltip(true);
        }
    };

    const handleMouseLeave = () => {
        setShowTooltip(false);
    };

    // 格式化创建时间
    const formattedCreatedAt = createdAt
        ? format(new Date(createdAt), "yyyy-MM-dd HH:mm", { locale: zhCN })
        : null;

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                className={`p-1 rounded transition-colors ${hasInfo ? "text-gray-400 hover:bg-gray-100 hover:text-gray-600" : "text-gray-200 cursor-default"
                    } ${className}`}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                disabled={!hasInfo}
            >
                <MoreHorizontal size={16} />
            </button>

            {showTooltip &&
                hasInfo &&
                createPortal(
                    <div
                        className="fixed z-[9999] bg-white border border-gray-200 shadow-xl rounded-lg p-3 text-xs min-w-[140px]"
                        style={{
                            top: tooltipPos.top,
                            left: tooltipPos.left,
                        }}
                        onMouseEnter={() => setShowTooltip(true)}
                        onMouseLeave={handleMouseLeave}
                    >
                        <div className="space-y-2">
                            {location && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-400 w-12">发生地</span>
                                    <span className="text-gray-700 font-medium">{location}</span>
                                </div>
                            )}
                            {projectName && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-400 w-12">项目</span>
                                    <span className="text-gray-700 font-medium">{projectName}</span>
                                </div>
                            )}
                            {formattedCreatedAt && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-400 w-12">创建于</span>
                                    <span className="text-gray-500 font-mono text-[11px]">{formattedCreatedAt}</span>
                                </div>
                            )}
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
}
