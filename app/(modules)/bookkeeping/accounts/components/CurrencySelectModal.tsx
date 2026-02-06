/**
 * [性质]: [组件] 币种选择弹窗 (添加多币种账户)
 * [Input]: Available Currencies
 * [Output]: Select Modal
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CURRENCIES } from "@/lib/constants";

interface CurrencySelectModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    existingCurrencies?: string[]; // 已有的币种（排除这些选项）
    onSubmit: (currency: string) => void;
}

export function CurrencySelectModal({
    open,
    onOpenChange,
    existingCurrencies = [],
    onSubmit,
}: CurrencySelectModalProps) {
    const [selectedCurrency, setSelectedCurrency] = React.useState('');

    // 可选的币种（排除已有的）
    const availableCurrencies = React.useMemo(() => {
        return CURRENCIES.filter(c => !existingCurrencies.includes(c));
    }, [existingCurrencies]);

    // 打开时重置选择
    React.useEffect(() => {
        if (open) {
            // 默认选择第一个可用币种
            setSelectedCurrency(availableCurrencies[0] || '');
        }
    }, [open, availableCurrencies]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedCurrency) {
            onSubmit(selectedCurrency);
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[340px]">
                <DialogHeader>
                    <DialogTitle>添加币种户头</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {availableCurrencies.length > 0 ? (
                        <div className="space-y-2">
                            <Label htmlFor="currency">选择币种</Label>
                            <select
                                id="currency"
                                value={selectedCurrency}
                                onChange={(e) => setSelectedCurrency(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white focus:outline-none focus:ring-2 focus:ring-gray-950 focus:ring-offset-2"
                                required
                            >
                                {availableCurrencies.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500 text-center py-4">
                            所有币种户头都已创建
                        </p>
                    )}

                    {existingCurrencies.length > 0 && (
                        <p className="text-xs text-gray-500">
                            已有币种：{existingCurrencies.join(', ')}
                        </p>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            取消
                        </Button>
                        <Button type="submit" disabled={availableCurrencies.length === 0}>
                            添加户头
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
