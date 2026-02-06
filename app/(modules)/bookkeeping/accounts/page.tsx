/**
 * [性质]: [页面] 账户管理 (账户树/CRUD)
 * [Input]: None
 * [Output]: Page UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { AccountWithBalance } from "@/types/database";
import { getAccounts, createAccount, deleteAccount, toggleAccountStatus, mergeAccounts, addCurrencySubAccount } from "@/lib/bookkeeping/actions";
import { AccountTree } from "./components/AccountTree";
import { AccountDetail } from "./components/AccountDetail";
import { CreateAccountModal, CreateAccountData } from "./components/CreateAccountModal";
import { AccountEditModal, EditAccountData } from "./components/AccountEditModal";
import { CurrencySelectModal } from "./components/CurrencySelectModal";
import { SnapshotDialog } from "@/components/bookkeeping/SnapshotDialog";
import { updateAccount } from "@/lib/bookkeeping/actions";
import { CURRENCIES } from "@/lib/constants";

// 递归扁平化账户树
function flattenAccounts(accounts: AccountWithBalance[]): AccountWithBalance[] {
  const result: AccountWithBalance[] = [];
  const traverse = (list: AccountWithBalance[]) => {
    list.forEach(acc => {
      result.push(acc);
      if (acc.children && acc.children.length > 0) {
        traverse(acc.children);
      }
    });
  };
  traverse(accounts);
  return result;
}

// 在树中查找账户
function findAccountInTree(accounts: AccountWithBalance[], id: string): AccountWithBalance | null {
  for (const acc of accounts) {
    if (acc.id === id) return acc;
    if (acc.children) {
      const found = findAccountInTree(acc.children, id);
      if (found) return found;
    }
  }
  return null;
}

// 判断是否为币种户头（名称是币种代码且是叶子账户）
function isCurrencySubAccount(account: AccountWithBalance): boolean {
  if (account.is_group) return false;
  // 检查名称是否为币种代码
  return (CURRENCIES as readonly string[]).includes(account.name);
}

// 判断是否为转换分组（银行卡转换而来）
// 特征：是分组、非系统组、所有子账户都是币种户头
function isConvertedGroup(account: AccountWithBalance): boolean {
  if (!account.is_group || account.is_system) return false;
  if (!account.children || account.children.length === 0) return false;
  return account.children.every(child => isCurrencySubAccount(child));
}

// 获取账户已有的币种列表（为转换分组或币种户头）
function getExistingCurrencies(account: AccountWithBalance, tree: AccountWithBalance[]): string[] {
  if (isConvertedGroup(account)) {
    return account.children?.map(c => c.name) || [];
  }
  if (isCurrencySubAccount(account) && account.parent_id) {
    const parent = findAccountInTree(tree, account.parent_id);
    if (parent && isConvertedGroup(parent)) {
      return parent.children?.map(c => c.name) || [];
    }
  }
  return [];
}

export default function AccountsPage() {
  // 账户数据
  const [accounts, setAccounts] = React.useState<AccountWithBalance[]>([]);
  const [loading, setLoading] = React.useState(true);

  // 选中的账户
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | null>(null);

  // 弹窗状态
  const [createModalOpen, setCreateModalOpen] = React.useState(false);
  const [editModalOpen, setEditModalOpen] = React.useState(false);
  const [createMode, setCreateMode] = React.useState<'account' | 'group'>('account');
  const [calibrateDialogOpen, setCalibrateDialogOpen] = React.useState(false);
  const [currencyModalOpen, setCurrencyModalOpen] = React.useState(false);
  const [selectedCurrency, setSelectedCurrency] = React.useState('HKD');

  // 加载账户数据
  const fetchAccounts = React.useCallback(async () => {
    try {
      const data = await getAccounts({ includeBalance: true, accountClass: 'real' });
      setAccounts(data);
    } catch (error: any) {
      console.error("Failed to fetch accounts:", error);
      // 不在初始加载时显示错误弹窗，让页面正常显示空状态
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // 获取当前选中的账户对象
  const selectedAccount = React.useMemo(() => {
    if (!selectedAccountId) return null;
    return findAccountInTree(accounts, selectedAccountId);
  }, [accounts, selectedAccountId]);

  // 处理账户选择
  const handleSelectAccount = (account: AccountWithBalance | null) => {
    setSelectedAccountId(account?.id || null);
  };

  // 处理新建账户
  const handleCreateAccount = () => {
    setCreateMode('account');
    setCreateModalOpen(true);
  };

  // 处理新建分组
  const handleCreateGroup = () => {
    setCreateMode('group');
    setCreateModalOpen(true);
  };

  // 提交新建账户/分组
  const handleSubmitCreate = async (data: CreateAccountData) => {
    // 确定 type（从父账户继承）
    const parent = findAccountInTree(accounts, data.parent_id);
    if (!parent) throw new Error('父账户不存在');

    await createAccount(
      {
        name: data.name,
        parent_id: data.parent_id,
        type: data.is_credit_card ? 'liability' : parent.type, // 信用卡强制为负债
        account_class: 'real',
        is_group: data.is_group,
        currency: data.currency || null,
        credit_limit: data.credit_limit || null,
        statement_day: data.statement_day || null,
        due_day: data.due_day || null,
      },
      // 期初信息（仅叶子账户）
      !data.is_group ? {
        opening_date: data.opening_date,
        opening_balance: data.opening_balance,
      } : undefined
    );

    await fetchAccounts();
  };

  // 处理编辑
  const handleEdit = () => {
    setEditModalOpen(true);
  };

  // 提交编辑
  const handleSubmitEdit = async (data: EditAccountData) => {
    if (!selectedAccount) return;
    await updateAccount(selectedAccount.id, data);
    await fetchAccounts();
  };

  // 处理校准
  const handleCalibrate = () => {
    setCalibrateDialogOpen(true);
  };

  // 处理停用/启用
  const handleDeactivate = async () => {
    if (!selectedAccount) return;
    const action = selectedAccount.is_active ? '停用' : '启用';
    if (!confirm(`确定要${action}账户 "${selectedAccount.name}" 吗？`)) return;

    try {
      await toggleAccountStatus(selectedAccount.id, !selectedAccount.is_active);
      await fetchAccounts();
    } catch (error: any) {
      alert(error.message || `${action}失败`);
    }
  };

  // 处理删除
  const handleDelete = async () => {
    if (!selectedAccount) return;
    if (!confirm(`确定要删除账户 "${selectedAccount.name}" 吗？此操作不可恢复！`)) return;

    try {
      await deleteAccount(selectedAccount.id);
      setSelectedAccountId(null);
      await fetchAccounts();
    } catch (error: any) {
      alert(error.message || '删除失败');
    }
  };

  // 处理合并
  const handleMerge = async () => {
    if (!selectedAccount) return;

    // 获取可合并的目标账户（同类型的叶子账户）
    const flatList = flattenAccounts(accounts);
    const targets = flatList.filter(acc =>
      !acc.is_group &&
      acc.id !== selectedAccount.id &&
      acc.type === selectedAccount.type
    );

    if (targets.length === 0) {
      alert('没有可合并的目标账户');
      return;
    }

    const targetName = prompt(
      `请输入目标账户名称（可选：${targets.map(t => t.name).join('、')}）：`
    );

    if (!targetName) return;

    const target = targets.find(t => t.name === targetName);
    if (!target) {
      alert('未找到目标账户');
      return;
    }

    if (!confirm(`确定要将 "${selectedAccount.name}" 的所有流水合并到 "${target.name}" 吗？`)) return;

    try {
      await mergeAccounts(selectedAccount.id, target.id);
      setSelectedAccountId(target.id);
      await fetchAccounts();
      alert('合并成功');
    } catch (error: any) {
      alert(error.message || '合并失败');
    }
  };

  // 处理添加币种户头
  const handleAddCurrencySubAccount = () => {
    if (!selectedAccount) return;
    setCurrencyModalOpen(true);
  };

  // 获取要添加币种户头的目标账户ID
  const getTargetAccountIdForCurrency = (): string | null => {
    if (!selectedAccount) return null;

    // 如果是转换分组，在其下添加
    if (isConvertedGroup(selectedAccount)) {
      return selectedAccount.id;
    }

    // 如果是币种户头，在其父账户下添加（同级）
    if (isCurrencySubAccount(selectedAccount) && selectedAccount.parent_id) {
      return selectedAccount.parent_id;
    }

    // 普通叶子账户，直接在其下添加（会转换为分组）
    if (!selectedAccount.is_group) {
      return selectedAccount.id;
    }

    return null;
  };

  // 处理币种选择确认
  const handleCurrencySubmit = async (currency: string) => {
    const targetId = getTargetAccountIdForCurrency();
    if (!targetId) return;

    try {
      const result = await addCurrencySubAccount(targetId, currency);
      await fetchAccounts();

      if (result.migratedCount > 0) {
        alert(`已创建 ${result.created.join(', ')} 户头，并迁移了 ${result.migratedCount} 笔交易。`);
      } else if (result.created.length > 0) {
        alert(`已创建 ${result.created.join(', ')} 户头。`);
      } else {
        alert('该币种户头已存在。');
      }
    } catch (error: any) {
      alert(error.message || '添加币种户头失败');
    }
  };

  // 判断是否可以添加币种户头
  const canAddCurrencySubAccount = React.useMemo(() => {
    if (!selectedAccount) return false;
    // 转换分组可以添加
    if (isConvertedGroup(selectedAccount)) return true;
    // 币种户头可以添加同级
    if (isCurrencySubAccount(selectedAccount)) return true;
    // 普通叶子账户可以添加（会转换）
    if (!selectedAccount.is_group) return true;
    return false;
  }, [selectedAccount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full -m-6 bg-white">
      {/* 左侧：账户树 */}
      <div className="w-72 flex-shrink-0 border-r border-gray-200 bg-white">
        <AccountTree
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onSelectAccount={handleSelectAccount}
          onCreateAccount={handleCreateAccount}
          onCreateGroup={handleCreateGroup}
          loading={loading}
        />
      </div>

      {/* 右侧：账户详情 */}
      <div className="flex-1 flex flex-col min-w-0">
        <AccountDetail
          account={selectedAccount}
          onEdit={handleEdit}
          onCalibrate={handleCalibrate}
          onDeactivate={handleDeactivate}
          onDelete={handleDelete}
          onMerge={handleMerge}
          onAddCurrencySubAccount={canAddCurrencySubAccount ? handleAddCurrencySubAccount : undefined}
          isConvertedGroup={selectedAccount ? isConvertedGroup(selectedAccount) : false}
        />
      </div>

      {/* 新建账户/分组弹窗 */}
      <CreateAccountModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        accounts={accounts}
        onSubmit={handleSubmitCreate}
        mode={createMode}
        defaultParentId={selectedAccount?.is_group ? selectedAccount.id : selectedAccount?.parent_id}
      />

      {/* 校准余额弹窗 */}
      {selectedAccount && !selectedAccount.is_group && (
        <SnapshotDialog
          accountName={selectedAccount.name}
          accountId={selectedAccount.id}
          currency={selectedAccount.currency || 'CNY'}
          currentEstimatedBalance={selectedAccount.balance || 0}
          trigger={<span />}
          open={calibrateDialogOpen}
          onOpenChange={setCalibrateDialogOpen}
          onSuccess={fetchAccounts}
        />
      )}

      {/* 编辑账户弹窗 */}
      {selectedAccount && (
        <AccountEditModal
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          account={selectedAccount}
          accounts={accounts}
          onSubmit={handleSubmitEdit}
        />
      )}

      {/* 添加币种户头弹窗 */}
      <CurrencySelectModal
        open={currencyModalOpen}
        onOpenChange={setCurrencyModalOpen}
        existingCurrencies={selectedAccount ? getExistingCurrencies(selectedAccount, accounts) : []}
        onSubmit={handleCurrencySubmit}
      />
    </div>
  );
}
