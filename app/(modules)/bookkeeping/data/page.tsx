/**
 * [性质]: [页面] 数据管理 (导入/导出/备份)
 * [Input]: None
 * [Output]: Page UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Database } from "lucide-react";
import { getAccounts } from "@/lib/bookkeeping/actions/modules/accounts";
import { AccountWithBalance } from "@/types/database";
import { DataImport } from "./components/DataImport";
import { DataExport } from "./components/DataExport";
import { OperatingRecord } from "./components/OperatingRecord";

export default function DataManagementPage() {
    const [accounts, setAccounts] = React.useState<AccountWithBalance[]>([]);
    const [loading, setLoading] = React.useState(true);


    const loadData = async () => {
        setLoading(true);
        try {
            const accs = await getAccounts();
            setAccounts(accs);
        } catch (error) {
            console.error("Failed to load data", error);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        loadData();
    }, []);

    return (
        <div className="space-y-6">
            {/* Header - 复刻 Setting/Periodic 样式 */}
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Data Management</p>
                    <h1 className="text-2xl font-bold tracking-tight">数据管理中心</h1>
                    <p className="text-sm text-gray-500">批量导入账单数据、导出流水备份与管理快照。</p>
                </div>

                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        刷新
                    </Button>
                </div>
            </div>

            {/* 数据导入组件 (全宽) */}
            <DataImport onComplete={loadData} />

            {/* 数据导出组件 (全宽) */}
            <DataExport accounts={accounts} />

            {/* 操作日志组件 (全宽) */}
            <div className="space-y-4">
                <OperatingRecord />
            </div>
        </div>
    );
}
