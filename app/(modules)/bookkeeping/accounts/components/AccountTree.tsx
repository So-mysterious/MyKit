/**
 * [性质]: [组件] 账户树状导航
 * [Input]: Account List
 * [Output]: Tree UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { Plus, FolderPlus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountWithBalance } from "@/types/database";
import { AccountTreeItem } from "./AccountTreeItem";
import { cn } from "@/lib/utils";

interface AccountTreeProps {
    accounts: AccountWithBalance[];
    selectedAccountId: string | null;
    onSelectAccount: (account: AccountWithBalance | null) => void;
    onCreateAccount: () => void;
    onCreateGroup: () => void;
    loading?: boolean;
}

// 递归获取所有账户 ID（用于默认展开）
function getAllGroupIds(accounts: AccountWithBalance[]): Set<string> {
    const ids = new Set<string>();
    const traverse = (nodes: AccountWithBalance[]) => {
        nodes.forEach(node => {
            if (node.is_group) {
                ids.add(node.id);
            }
            if (node.children && node.children.length > 0) {
                traverse(node.children);
            }
        });
    };
    traverse(accounts);
    return ids;
}

// 递归搜索过滤账户
function filterAccounts(accounts: AccountWithBalance[], searchTerm: string): AccountWithBalance[] {
    if (!searchTerm.trim()) return accounts;

    const term = searchTerm.toLowerCase();

    const filter = (nodes: AccountWithBalance[]): AccountWithBalance[] => {
        return nodes.reduce<AccountWithBalance[]>((acc, node) => {
            const nameMatch = node.name.toLowerCase().includes(term);
            const filteredChildren = node.children ? filter(node.children) : [];

            if (nameMatch || filteredChildren.length > 0) {
                acc.push({
                    ...node,
                    children: filteredChildren.length > 0 ? filteredChildren : node.children
                });
            }
            return acc;
        }, []);
    };

    return filter(accounts);
}

export function AccountTree({
    accounts,
    selectedAccountId,
    onSelectAccount,
    onCreateAccount,
    onCreateGroup,
    loading,
}: AccountTreeProps) {
    const [searchTerm, setSearchTerm] = React.useState("");
    const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => getAllGroupIds(accounts));

    // 当账户列表变化时，更新展开状态
    React.useEffect(() => {
        setExpandedIds(getAllGroupIds(accounts));
    }, [accounts]);

    const handleToggle = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const filteredAccounts = filterAccounts(accounts, searchTerm);

    return (
        <div className="flex flex-col h-full">
            {/* 头部 */}
            <div className="p-4 border-b border-gray-100">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold text-gray-900">账户管理</h2>
                    <div className="flex gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onCreateAccount}
                            title="新建账户"
                        >
                            <Plus className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onCreateGroup}
                            title="新建分组"
                        >
                            <FolderPlus className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
                {/* 搜索框 */}
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="搜索账户..."
                        className="pl-8 h-8 text-sm"
                    />
                </div>
            </div>

            {/* 账户列表 */}
            <div className="flex-1 overflow-y-auto py-2">
                {filteredAccounts.length === 0 ? (
                    <div className="p-4 text-center text-gray-400 text-sm">
                        {searchTerm ? '无匹配账户' : '暂无账户'}
                    </div>
                ) : (
                    filteredAccounts.map(account => (
                        <AccountTreeItem
                            key={account.id}
                            account={account}
                            level={0}
                            selectedAccountId={selectedAccountId}
                            expandedIds={expandedIds}
                            onSelect={onSelectAccount}
                            onToggle={handleToggle}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
