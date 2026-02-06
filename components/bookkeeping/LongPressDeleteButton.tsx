/**
 * [性质]: [组件] 长按删除按钮
 * [Input]: onDelete (回调函数)
 * [Output]: 带有长按动画的删除按钮
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import { useState, useRef, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LongPressDeleteButtonProps {
    onDelete: () => void;
    duration?: number; // 持续时间，毫秒，默认 2500
    className?: string;
}

export function LongPressDeleteButton({
    onDelete,
    duration = 2500,
    className,
}: LongPressDeleteButtonProps) {
    const [isHolding, setIsHolding] = useState(false);
    const [progress, setProgress] = useState(0);
    const requestRef = useRef<number>();
    const startTimeRef = useRef<number>();

    const startHolding = () => {
        setIsHolding(true);
        setProgress(0);
        startTimeRef.current = Date.now();
        requestRef.current = requestAnimationFrame(animate);
    };

    const stopHolding = () => {
        setIsHolding(false);
        setProgress(0);
        if (requestRef.current) {
            cancelAnimationFrame(requestRef.current);
        }
    };

    const animate = () => {
        if (!startTimeRef.current) return;

        const elapsed = Date.now() - startTimeRef.current;
        const newProgress = Math.min((elapsed / duration) * 100, 100);

        setProgress(newProgress);

        if (newProgress < 100) {
            requestRef.current = requestAnimationFrame(animate);
        } else {
            // 完成
            onDelete();
            stopHolding();
        }
    };

    // 清理
    useEffect(() => {
        return () => {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
    }, []);

    return (
        <div className={cn("relative flex items-center justify-center h-7 w-7", className)}>
            <button
                type="button"
                className="relative z-10 flex items-center justify-center h-full w-full text-gray-400 hover:text-gray-500 transition-colors focus:outline-none"
                onMouseDown={startHolding}
                onMouseUp={stopHolding}
                onMouseLeave={stopHolding}
                onTouchStart={(e) => {
                    // 防止移动端长按弹出菜单
                    e.preventDefault();
                    startHolding();
                }}
                onTouchEnd={stopHolding}
                title="长按 2.5 秒删除"
            >
                {/* 底层的灰色图标 */}
                <Trash2 size={14} className="text-gray-300 absolute" />

                {/* 上层的红色图标，通过 clip-path 控制显示部分 */}
                <div
                    className="absolute inset-0 flex items-center justify-center text-red-500"
                    style={{
                        clipPath: `inset(${100 - progress}% 0 0 0)`, // 从下往上显示
                        transition: isHolding ? 'none' : 'clip-path 0.2s ease-out' // 松手时平滑回退，长按时实时更新
                    }}
                >
                    <Trash2 size={14} />
                </div>
            </button>

            {/* 可选：添加一个微弱的背景进度指示或者震动反馈（如果支持）可能是过度的，目前仅图标染色即可满足需求 */}
        </div>
    );
}
