/**
 * [性质]: [页面] 周期性交易管理
 * [Input]: None
 * [Output]: Page UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { Plus, CalendarIcon, Loader2, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createPeriodicTask,
  updatePeriodicTask,
  deletePeriodicTask,
  togglePeriodicTaskActive,
  getProjects,
  getPeriodicTasks,
} from "@/lib/bookkeeping/actions";
import { useBookkeepingCache } from "@/lib/bookkeeping/cache/BookkeepingCacheProvider";
import { useBookkeepingColors } from "@/lib/bookkeeping/useColors";
import {
  PeriodicTaskForm,
  PeriodicTaskFormData,
  PeriodicTaskItem,
  PeriodicTaskHeader,
  PeriodicTaskData,
  AccountOption,
  ProjectOption,
} from "./components";

// ============================================================================
// 辅助函数
// ============================================================================

function inferTransactionType(
  fromAccountType: string | undefined,
  toAccountType: string | undefined
): "expense" | "income" | "transfer" {
  const isFromReal = fromAccountType === "asset" || fromAccountType === "liability";
  const isToReal = toAccountType === "asset" || toAccountType === "liability";

  if (isFromReal && !isToReal && toAccountType === "expense") {
    return "expense";
  }
  if (!isFromReal && isToReal && fromAccountType === "income") {
    return "income";
  }
  if (isFromReal && isToReal) {
    return "transfer";
  }
  return "expense";
}

// ============================================================================
// 主页面组件
// ============================================================================

export default function PeriodicTasksPage() {
  // 状态
  const [loading, setLoading] = React.useState(true);
  const [tasks, setTasks] = React.useState<PeriodicTaskData[]>([]);
  const [accounts, setAccounts] = React.useState<AccountOption[]>([]);
  const [projects, setProjects] = React.useState<ProjectOption[]>([]);

  // 表单状态
  const [showForm, setShowForm] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<PeriodicTaskData | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // 操作状态
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  // Hooks
  const { colors } = useBookkeepingColors();
  const cache = useBookkeepingCache();

  // 加载数据 - 直接从 API 获取，避免缓存问题
  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [taskData, accountData, projectData] = await Promise.all([
        getPeriodicTasks(), // 直接调用 API，不使用缓存
        cache.getAccounts({ includeBalance: false }),
        getProjects().catch(() => [] as ProjectOption[]),
      ]);
      setTasks(taskData);
      setAccounts(accountData);
      setProjects(projectData as ProjectOption[]);
    } catch (error) {
      console.error("加载周期任务失败:", error);
      const message = error instanceof Error ? error.message : "未知错误";
      alert(`加载数据失败: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [cache.getAccounts]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 创建任务
  const handleCreate = async (data: PeriodicTaskFormData) => {
    setSubmitting(true);
    try {
      await createPeriodicTask(data);
      setShowForm(false);
      await fetchData(); // 直接刷新数据
    } catch (error) {
      console.error(error);
      alert("创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  // 更新任务
  const handleUpdate = async (data: PeriodicTaskFormData) => {
    if (!editingTask) return;

    setSubmitting(true);
    try {
      await updatePeriodicTask(editingTask.id, data);
      setEditingTask(null);
      await fetchData(); // 直接刷新数据
    } catch (error) {
      console.error(error);
      alert("保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  // 切换启用状态 - 乐观更新
  const handleToggleActive = async (task: PeriodicTaskData) => {
    const newActiveState = !task.is_active;

    // 乐观更新：立即更新本地状态
    setTasks(prev =>
      prev.map(t =>
        t.id === task.id ? { ...t, is_active: newActiveState } : t
      )
    );

    setTogglingId(task.id);
    try {
      await togglePeriodicTaskActive(task.id, newActiveState);
      // 成功后不需要 fetchData，因为已经乐观更新了
    } catch (error) {
      console.error("Toggle active error:", error);
      const message = error instanceof Error ? error.message : "操作失败";
      alert(message);

      // 回滚：恢复原状态
      setTasks(prev =>
        prev.map(t =>
          t.id === task.id ? { ...t, is_active: task.is_active } : t
        )
      );
    } finally {
      setTogglingId(null);
    }
  };

  // 删除任务
  const handleDelete = async (task: PeriodicTaskData) => {
    const fromName = task.from_account?.name || "未知";
    const toName = task.to_account?.name || "未知";
    if (!confirm(`确定删除「${fromName} → ${toName}」周期任务吗？`)) return;

    setDeletingId(task.id);
    try {
      await deletePeriodicTask(task.id);
      await fetchData(); // 直接刷新数据
    } catch (error) {
      console.error(error);
      alert("删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  // 开始编辑
  const handleEdit = (task: PeriodicTaskData) => {
    setEditingTask(task);
    setShowForm(false);
  };

  // 取消表单
  const handleCancelForm = () => {
    setShowForm(false);
    setEditingTask(null);
  };

  // 统计月度预计收支（只统计启用的月度任务）
  const { monthlyExpense, monthlyIncome } = React.useMemo(() => {
    let expense = 0;
    let income = 0;

    tasks.forEach((t) => {
      if (!t.is_active) return;
      if (t.frequency !== "monthly") return;

      const txType = inferTransactionType(
        t.from_account?.type,
        t.to_account?.type
      );

      if (txType === "expense") {
        expense += Math.abs(t.amount);
      } else if (txType === "income") {
        income += Math.abs(t.amount);
      }
    });

    return { monthlyExpense: expense, monthlyIncome: income };
  }, [tasks]);

  const activeCount = tasks.filter((t) => t.is_active).length;

  return (
    <div className="space-y-6">
      {/* Header - 完全复刻流水页面样式 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
              Periodic Transactions
            </p>
            <h1 className="text-2xl font-bold tracking-tight">周期性交易</h1>
            <p className="text-sm text-gray-500">
              管理定期发生的收支，如月租、工资、订阅服务等。
            </p>
          </div>

          {/* 统计信息 - 与流水页面完全一致 */}
          {!loading && tasks.length > 0 && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5" style={{ color: colors.income }}>
                <ArrowDownCircle size={14} />
                <span>收入 ¥{monthlyIncome.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1.5" style={{ color: colors.expense }}>
                <ArrowUpCircle size={14} />
                <span>支出 ¥{monthlyExpense.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：新建按钮 */}
        {!showForm && !editingTask && (
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus size={16} />
            新建任务
          </Button>
        )}
      </div>

      {/* 新建表单 */}
      {showForm && !editingTask && (
        <PeriodicTaskForm
          accounts={accounts}
          projects={projects}
          submitting={submitting}
          onSubmit={handleCreate}
          onCancel={handleCancelForm}
        />
      )}

      {/* 编辑表单 */}
      {editingTask && (
        <PeriodicTaskForm
          accounts={accounts}
          projects={projects}
          initialData={editingTask}
          submitting={submitting}
          onSubmit={handleUpdate}
          onCancel={handleCancelForm}
        />
      )}

      {/* Task List */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            加载中...
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <CalendarIcon className="mx-auto h-10 w-10 mb-3 opacity-50" />
            <p>还没有周期性交易</p>
            <p className="text-sm mt-1">点击上方按钮创建第一个任务</p>
          </div>
        ) : (
          <>
            <PeriodicTaskHeader />
            <div className="divide-y divide-gray-50">
              {tasks.map((task) => (
                <PeriodicTaskItem
                  key={task.id}
                  task={task}
                  colors={colors}
                  onEdit={handleEdit}
                  onToggleActive={handleToggleActive}
                  onDelete={handleDelete}
                  isToggling={togglingId === task.id}
                  isDeleting={deletingId === task.id}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Summary Footer */}
      {!loading && tasks.length > 0 && (
        <div className="text-xs text-gray-400 pt-2">
          共 {tasks.length} 个任务，{activeCount} 个启用中
        </div>
      )}
    </div>
  );
}
