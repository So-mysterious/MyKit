"use client";

import * as React from "react";
import { format, addDays, addWeeks, addMonths, addYears } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  Plus,
  Pause,
  Play,
  Pencil,
  Trash2,
  CalendarIcon,
  Loader2,
  X,
  Check,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowRightLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getPeriodicTasks,
  createPeriodicTask,
  updatePeriodicTask,
  deletePeriodicTask,
  togglePeriodicTaskActive,
  getAccountsMeta,
  getAvailableTags,
  PeriodicTaskWithAccount,
} from "@/lib/bookkeeping/actions";

type TransactionType = "expense" | "income" | "transfer";

// 周期选项设计：覆盖常见场景
const FREQUENCY_OPTIONS = [
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "biweekly", label: "每两周" },
  { value: "monthly", label: "每月" },
  { value: "quarterly", label: "每季度" },
  { value: "yearly", label: "每年" },
  { value: "custom", label: "自定义天数" },
];

const FREQUENCY_LABEL: Record<string, string> = {
  daily: "每天",
  weekly: "每周",
  biweekly: "每两周",
  monthly: "每月",
  quarterly: "每季度",
  yearly: "每年",
  custom: "自定义",
};

// 计算下一次执行日期（基于首次执行日期和周期）
function calculateNextRunDate(
  firstRunDate: string,
  frequency: string,
  customDays?: number
): Date {
  const first = new Date(firstRunDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 如果首次执行日期在今天或之后，直接返回首次执行日期
  if (first >= today) {
    return first;
  }

  // 根据周期计算下一次执行日期
  let next = new Date(first);

  const getNextDate = (current: Date): Date => {
    switch (frequency) {
      case "daily":
        return addDays(current, 1);
      case "weekly":
        return addWeeks(current, 1);
      case "biweekly":
        return addWeeks(current, 2);
      case "monthly":
        // 自然月：保持日期，如1月31日 -> 2月28/29日 -> 3月31日
        return addMonths(current, 1);
      case "quarterly":
        return addMonths(current, 3);
      case "yearly":
        return addYears(current, 1);
      case "custom":
        return addDays(current, customDays || 30);
      default:
        return addMonths(current, 1);
    }
  };

  // 循环计算直到找到下一个未来日期
  while (next < today) {
    next = getNextDate(next);
  }

  return next;
}

// 格式化周期显示
function formatFrequency(frequency: string, customDays?: number): string {
  if (frequency === "custom" && customDays) {
    return `每 ${customDays} 天`;
  }
  return FREQUENCY_LABEL[frequency] || frequency;
}

interface FormState {
  type: TransactionType;
  accountId: string;
  toAccountId: string; // 划转目标账户
  amount: string;
  toAmount: string; // 划转目标金额（跨币种时）
  category: string;
  description: string;
  frequency: string;
  customDays: string; // 自定义天数
  firstRunDate: string; // 改为首次执行日期
}

const DEFAULT_FORM: FormState = {
  type: "expense",
  accountId: "",
  toAccountId: "",
  amount: "",
  toAmount: "",
  category: "",
  description: "",
  frequency: "monthly",
  customDays: "30",
  firstRunDate: new Date().toISOString().split("T")[0],
};

export default function PeriodicTasksPage() {
  const [loading, setLoading] = React.useState(true);
  const [tasks, setTasks] = React.useState<PeriodicTaskWithAccount[]>([]);
  const [accounts, setAccounts] = React.useState<{ id: string; name: string; currency: string }[]>([]);
  const [availableTags, setAvailableTags] = React.useState<{ kind: string; name: string }[]>([]);

  // Form State
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(DEFAULT_FORM);
  const [submitting, setSubmitting] = React.useState(false);

  // Edit State
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState<FormState>(DEFAULT_FORM);

  // Action States
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [taskData, accountData, tagData] = await Promise.all([
        getPeriodicTasks(),
        getAccountsMeta(),
        getAvailableTags(),
      ]);
      setTasks(taskData);
      setAccounts(accountData);
      setAvailableTags(tagData);

      // Set default account if not set
      if (!form.accountId && accountData.length > 0) {
        setForm((prev) => ({ ...prev, accountId: accountData[0].id }));
      }
    } catch (error) {
      console.error("加载周期任务失败:", error);
      const message = error instanceof Error ? error.message : "未知错误";
      alert(`加载数据失败: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [form.accountId]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter categories by type
  const currentCategories = React.useMemo(() => {
    const filtered = availableTags.filter((t) => t.kind === form.type).map((t) => t.name);
    return filtered.length > 0 ? filtered : ["默认"];
  }, [form.type, availableTags]);

  const editCategories = React.useMemo(() => {
    const filtered = availableTags.filter((t) => t.kind === editForm.type).map((t) => t.name);
    return filtered.length > 0 ? filtered : ["默认"];
  }, [editForm.type, availableTags]);

  // Auto-select first category when type changes
  React.useEffect(() => {
    if (currentCategories.length > 0 && !currentCategories.includes(form.category)) {
      setForm((prev) => ({ ...prev, category: currentCategories[0] }));
    }
  }, [currentCategories, form.category]);

  React.useEffect(() => {
    if (editCategories.length > 0 && !editCategories.includes(editForm.category)) {
      setEditForm((prev) => ({ ...prev, category: editCategories[0] }));
    }
  }, [editCategories, editForm.category]);

  // Auto-select toAccountId when type changes to transfer
  React.useEffect(() => {
    if (form.type === "transfer" && !form.toAccountId) {
      const target = accounts.find((a) => a.id !== form.accountId);
      if (target) {
        setForm((prev) => ({ ...prev, toAccountId: target.id }));
      }
    }
  }, [form.type, form.accountId, form.toAccountId, accounts]);

  // Reset toAccountId if it conflicts with accountId
  React.useEffect(() => {
    if (form.type === "transfer" && form.toAccountId === form.accountId) {
      const fallback = accounts.find((a) => a.id !== form.accountId);
      if (fallback) {
        setForm((prev) => ({ ...prev, toAccountId: fallback.id }));
      } else {
        setForm((prev) => ({ ...prev, toAccountId: "" }));
      }
    }
  }, [form.type, form.accountId, form.toAccountId, accounts]);

  // Auto-select toAccountId for edit form when type changes to transfer
  React.useEffect(() => {
    if (editForm.type === "transfer" && !editForm.toAccountId) {
      const target = accounts.find((a) => a.id !== editForm.accountId);
      if (target) {
        setEditForm((prev) => ({ ...prev, toAccountId: target.id }));
      }
    }
  }, [editForm.type, editForm.accountId, editForm.toAccountId, accounts]);

  // Reset edit form toAccountId if it conflicts with accountId
  React.useEffect(() => {
    if (editForm.type === "transfer" && editForm.toAccountId === editForm.accountId) {
      const fallback = accounts.find((a) => a.id !== editForm.accountId);
      if (fallback) {
        setEditForm((prev) => ({ ...prev, toAccountId: fallback.id }));
      } else {
        setEditForm((prev) => ({ ...prev, toAccountId: "" }));
      }
    }
  }, [editForm.type, editForm.accountId, editForm.toAccountId, accounts]);

  const handleFormChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleEditFormChange = (key: keyof FormState, value: string) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.accountId || !form.amount || !form.category) {
      alert("请填写完整信息");
      return;
    }

    if (form.type === "transfer" && !form.toAccountId) {
      alert("请选择划转目标账户");
      return;
    }

    setSubmitting(true);
    try {
      const absAmount = Math.abs(parseFloat(form.amount));
      let finalAmount = absAmount;
      if (form.type === "expense" || form.type === "transfer") {
        finalAmount = -absAmount;
      }

      // 计算下一次执行日期
      const customDays = form.frequency === "custom" ? parseInt(form.customDays) || 30 : undefined;
      const nextRunDate = calculateNextRunDate(form.firstRunDate, form.frequency, customDays);

      await createPeriodicTask({
        account_id: form.accountId,
        type: form.type,
        amount: absAmount, // 存储正数，类型由 type 字段决定
        category: form.category,
        description: form.description || undefined,
        frequency: form.frequency === "custom" ? `custom_${form.customDays}` : form.frequency,
        next_run_date: nextRunDate.toISOString().split("T")[0],
        // 划转专用字段
        ...(form.type === "transfer" && {
          to_account_id: form.toAccountId,
          to_amount: form.toAmount ? parseFloat(form.toAmount) : undefined,
        }),
      });

      setForm({ ...DEFAULT_FORM, accountId: accounts[0]?.id || "" });
      setShowForm(false);
      await fetchData();
    } catch (error) {
      console.error(error);
      alert("创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setForm({ ...DEFAULT_FORM, accountId: accounts[0]?.id || "" });
    setShowForm(false);
  };

  const handleToggleActive = async (task: PeriodicTaskWithAccount) => {
    setTogglingId(task.id);
    try {
      await togglePeriodicTaskActive(task.id, !task.is_active);
      await fetchData();
    } catch (error) {
      console.error("Toggle active error:", error);
      const message = error instanceof Error ? error.message : "操作失败";
      alert(message);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (task: PeriodicTaskWithAccount) => {
    if (!confirm(`确定删除「${task.category}」周期任务吗？`)) return;

    setDeletingId(task.id);
    try {
      await deletePeriodicTask(task.id);
      await fetchData();
    } catch (error) {
      console.error(error);
      alert("删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = (task: PeriodicTaskWithAccount) => {
    // 使用 task.type 字段，兼容旧数据
    const taskType = task.type || (task.amount < 0 ? "expense" : "income");
    
    // 解析 frequency（可能是 custom_30 格式）
    let frequency = task.frequency;
    let customDays = "30";
    if (task.frequency.startsWith("custom_")) {
      frequency = "custom";
      customDays = task.frequency.replace("custom_", "");
    }

    setEditingId(task.id);
    setEditForm({
      type: taskType as TransactionType,
      accountId: task.account_id,
      toAccountId: task.to_account_id || "",
      amount: Math.abs(task.amount).toString(),
      toAmount: task.to_amount ? task.to_amount.toString() : "",
      category: task.category,
      description: task.description || "",
      frequency,
      customDays,
      firstRunDate: task.next_run_date.split("T")[0],
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(DEFAULT_FORM);
  };

  const saveEdit = async (id: string) => {
    if (!editForm.accountId || !editForm.amount || !editForm.category) {
      alert("请填写完整信息");
      return;
    }

    if (editForm.type === "transfer" && !editForm.toAccountId) {
      alert("请选择划转目标账户");
      return;
    }

    setSubmitting(true);
    try {
      const absAmount = Math.abs(parseFloat(editForm.amount));

      const customDays = editForm.frequency === "custom" ? parseInt(editForm.customDays) || 30 : undefined;
      const nextRunDate = calculateNextRunDate(editForm.firstRunDate, editForm.frequency, customDays);

      await updatePeriodicTask(id, {
        account_id: editForm.accountId,
        type: editForm.type,
        amount: absAmount, // 存储正数
        category: editForm.category,
        description: editForm.description || null,
        frequency: editForm.frequency === "custom" ? `custom_${editForm.customDays}` : editForm.frequency,
        next_run_date: nextRunDate.toISOString().split("T")[0],
        to_account_id: editForm.type === "transfer" ? editForm.toAccountId : null,
        to_amount: editForm.type === "transfer" && editForm.toAmount ? parseFloat(editForm.toAmount) : null,
      });

      setEditingId(null);
      await fetchData();
    } catch (error) {
      console.error(error);
      alert("保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  const getAccountCurrency = (id: string) => accounts.find((a) => a.id === id)?.currency || "CNY";
  const getCurrencySymbol = (currency: string) => (currency === "CNY" ? "¥" : "$");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Periodic Transactions</p>
          <h1 className="text-2xl font-bold tracking-tight">周期性交易</h1>
          <p className="text-sm text-gray-500">管理定期发生的收支，如月租、工资、订阅服务等。</p>
        </div>

        {/* 按钮区域 */}
        <div className="flex items-center gap-2">
          {showForm ? (
            <>
              <Button variant="outline" onClick={handleCancel} className="gap-2">
                <X size={16} />
                取消
              </Button>
              <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check size={16} />
                )}
                完成
              </Button>
            </>
          ) : (
            <Button onClick={() => setShowForm(true)} className="gap-2">
              <Plus size={16} />
              新建任务
            </Button>
          )}
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <h2 className="font-semibold text-gray-900">新建周期任务</h2>
          </div>

          {/* Type Switcher - 三选一 */}
          <div className="grid grid-cols-3 gap-2 p-1 bg-gray-100 rounded-lg">
            <button
              type="button"
              onClick={() => handleFormChange("type", "expense")}
              className={`text-sm font-medium py-1.5 rounded-md transition-all ${
                form.type === "expense"
                  ? "bg-white shadow-sm text-red-600"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              支出
            </button>
            <button
              type="button"
              onClick={() => handleFormChange("type", "income")}
              className={`text-sm font-medium py-1.5 rounded-md transition-all ${
                form.type === "income"
                  ? "bg-white shadow-sm text-green-600"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              收入
            </button>
            <button
              type="button"
              onClick={() => handleFormChange("type", "transfer")}
              className={`text-sm font-medium py-1.5 rounded-md transition-all ${
                form.type === "transfer"
                  ? "bg-white shadow-sm text-blue-600"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              划转
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">{form.type === "transfer" ? "转出金额" : "金额"}</Label>
              <div className="relative">
                <Input
                  id="amount"
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => handleFormChange("amount", e.target.value)}
                  className="pl-8"
                  required
                />
                <span className="absolute left-3 top-2.5 text-gray-500 text-sm">
                  {getCurrencySymbol(getAccountCurrency(form.accountId))}
                </span>
              </div>
            </div>

            {/* Account */}
            <div className="space-y-2">
              <Label htmlFor="account">{form.type === "transfer" ? "转出账户" : "账户"}</Label>
              <select
                id="account"
                className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-950"
                value={form.accountId}
                onChange={(e) => handleFormChange("accountId", e.target.value)}
                required
              >
                {accounts.length === 0 && <option value="">无账户</option>}
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency})
                  </option>
                ))}
              </select>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category">分类</Label>
              <select
                id="category"
                className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-950"
                value={form.category}
                onChange={(e) => handleFormChange("category", e.target.value)}
                required
              >
                {currentCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Frequency */}
            <div className="space-y-2">
              <Label htmlFor="frequency">周期</Label>
              <select
                id="frequency"
                className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-950"
                value={form.frequency}
                onChange={(e) => handleFormChange("frequency", e.target.value)}
              >
                {FREQUENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Transfer: Target Account - 与上方布局对齐，转入金额占两列宽度，转入账户占两列宽度 */}
          {form.type === "transfer" && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2 lg:col-span-2">
                <Label htmlFor="toAmount">转入金额 (选填)</Label>
                <div className="relative">
                  <Input
                    id="toAmount"
                    type="number"
                    placeholder={form.amount || "0.00"}
                    step="0.01"
                    value={form.toAmount}
                    onChange={(e) => handleFormChange("toAmount", e.target.value)}
                    className="pl-8"
                  />
                  <span className="absolute left-3 top-2.5 text-gray-500 text-sm">
                    {getCurrencySymbol(getAccountCurrency(form.toAccountId))}
                  </span>
                </div>
                <p className="text-[10px] text-gray-500">留空则默认等于转出金额</p>
              </div>

              <div className="space-y-2 lg:col-span-2">
                <Label htmlFor="toAccount">转入账户</Label>
                <select
                  id="toAccount"
                  className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-950"
                  value={form.toAccountId}
                  onChange={(e) => handleFormChange("toAccountId", e.target.value)}
                  required
                >
                  {accounts
                    .filter((a) => a.id !== form.accountId)
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.currency})
                      </option>
                    ))}
                </select>
              </div>
            </div>
          )}

          {/* Custom Days Input */}
          {form.frequency === "custom" && (
            <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
              <Label htmlFor="customDays" className="text-sm text-amber-800 whitespace-nowrap">
                每隔
              </Label>
              <Input
                id="customDays"
                type="number"
                min="1"
                max="365"
                value={form.customDays}
                onChange={(e) => handleFormChange("customDays", e.target.value)}
                className="w-20 text-center"
              />
              <span className="text-sm text-amber-800">天执行一次</span>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {/* First Run Date */}
            <div className="space-y-2">
              <Label htmlFor="firstRunDate">首次执行日期</Label>
              <div className="relative">
                <Input
                  id="firstRunDate"
                  type="date"
                  value={form.firstRunDate}
                  onChange={(e) => handleFormChange("firstRunDate", e.target.value)}
                  className="pl-9"
                  required
                />
                <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              </div>
              <p className="text-[10px] text-gray-500">
                系统将根据周期自动计算下一次执行时间
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">备注</Label>
              <Input
                id="description"
                placeholder="记录一下..."
                value={form.description}
                onChange={(e) => handleFormChange("description", e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Task List */}
      <div className="space-y-3">
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
          tasks.map((task) => {
            const taskType = task.type || (task.amount < 0 ? "expense" : "income"); // 兼容旧数据
            const isEditing = editingId === task.id;
            const currency = task.accounts?.currency || "CNY";
            const currencySymbol = getCurrencySymbol(currency);

            // 解析 frequency
            let displayFrequency = task.frequency;
            if (task.frequency.startsWith("custom_")) {
              const days = task.frequency.replace("custom_", "");
              displayFrequency = `每 ${days} 天`;
            } else {
              displayFrequency = FREQUENCY_LABEL[task.frequency] || task.frequency;
            }

            if (isEditing) {
              // Inline Edit Mode
              return (
                <div
                  key={task.id}
                  className="rounded-xl border-2 border-blue-200 bg-blue-50/30 p-4 space-y-4"
                >
                  {/* Type Switcher */}
                  <div className="grid grid-cols-3 gap-2 p-1 bg-gray-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => handleEditFormChange("type", "expense")}
                      className={`text-sm font-medium py-1.5 rounded-md transition-all ${
                        editForm.type === "expense"
                          ? "bg-white shadow-sm text-red-600"
                          : "text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      支出
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditFormChange("type", "income")}
                      className={`text-sm font-medium py-1.5 rounded-md transition-all ${
                        editForm.type === "income"
                          ? "bg-white shadow-sm text-green-600"
                          : "text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      收入
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditFormChange("type", "transfer")}
                      className={`text-sm font-medium py-1.5 rounded-md transition-all ${
                        editForm.type === "transfer"
                          ? "bg-white shadow-sm text-blue-600"
                          : "text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      划转
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    {/* Amount */}
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">
                        {editForm.type === "transfer" ? "转出金额" : "金额"}
                      </Label>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          value={editForm.amount}
                          onChange={(e) => handleEditFormChange("amount", e.target.value)}
                          className="pl-8"
                        />
                        <span className="absolute left-3 top-2.5 text-gray-500 text-sm">
                          {getCurrencySymbol(getAccountCurrency(editForm.accountId))}
                        </span>
                      </div>
                    </div>

                    {/* Account */}
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">
                        {editForm.type === "transfer" ? "转出账户" : "账户"}
                      </Label>
                      <select
                        className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                        value={editForm.accountId}
                        onChange={(e) => handleEditFormChange("accountId", e.target.value)}
                      >
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Category */}
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">分类</Label>
                      <select
                        className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                        value={editForm.category}
                        onChange={(e) => handleEditFormChange("category", e.target.value)}
                      >
                        {editCategories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Frequency */}
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">周期</Label>
                      <select
                        className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                        value={editForm.frequency}
                        onChange={(e) => handleEditFormChange("frequency", e.target.value)}
                      >
                        {FREQUENCY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Transfer Fields for Edit */}
                  {editForm.type === "transfer" && (
                    <div className="grid gap-3 md:grid-cols-2">
                      {/* To Amount */}
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">转入金额 (选填)</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={editForm.toAmount}
                            onChange={(e) => handleEditFormChange("toAmount", e.target.value)}
                            className="pl-8"
                          />
                          <span className="absolute left-3 top-2.5 text-gray-500 text-sm">
                            {getCurrencySymbol(getAccountCurrency(editForm.toAccountId))}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400">留空则默认等于转出金额</p>
                      </div>

                      {/* To Account */}
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">转入账户</Label>
                        <select
                          className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                          value={editForm.toAccountId}
                          onChange={(e) => handleEditFormChange("toAccountId", e.target.value)}
                        >
                          {accounts
                            .filter((acc) => acc.id !== editForm.accountId)
                            .map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.name} ({acc.currency})
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Custom Days for Edit */}
                  {editForm.frequency === "custom" && (
                    <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                      <Label className="text-sm text-amber-800 whitespace-nowrap">每隔</Label>
                      <Input
                        type="number"
                        min="1"
                        max="365"
                        value={editForm.customDays}
                        onChange={(e) => handleEditFormChange("customDays", e.target.value)}
                        className="w-20 text-center"
                      />
                      <span className="text-sm text-amber-800">天执行一次</span>
                    </div>
                  )}

                  <div className="grid gap-3 md:grid-cols-2">
                    {/* First Run Date */}
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">首次执行</Label>
                      <Input
                        type="date"
                        value={editForm.firstRunDate}
                        onChange={(e) => handleEditFormChange("firstRunDate", e.target.value)}
                      />
                    </div>

                    {/* Description */}
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-500">备注</Label>
                      <Input
                        value={editForm.description}
                        onChange={(e) => handleEditFormChange("description", e.target.value)}
                        placeholder="备注..."
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={cancelEdit}>
                      <X size={14} className="mr-1" />
                      取消
                    </Button>
                    <Button size="sm" onClick={() => saveEdit(task.id)} disabled={submitting}>
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Check size={14} className="mr-1" />
                      )}
                      保存
                    </Button>
                  </div>
                </div>
              );
            }

            // Normal Display Mode
            return (
              <div
                key={task.id}
                className={`group flex items-center gap-4 py-4 px-1 border-b border-gray-100 last:border-b-0 transition-colors hover:bg-gray-50/50 ${
                  !task.is_active ? "opacity-50" : ""
                }`}
              >
                {/* Icon */}
                <div
                  className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
                    taskType === "expense" ? "text-red-500" : taskType === "transfer" ? "text-blue-500" : "text-green-500"
                  }`}
                >
                  {taskType === "expense" ? (
                    <ArrowUpCircle size={22} />
                  ) : taskType === "transfer" ? (
                    <ArrowRightLeft size={22} />
                  ) : (
                    <ArrowDownCircle size={22} />
                  )}
                </div>

                {/* Main Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">{task.category}</span>
                    {!task.is_active && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                        已暂停
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                    <span>{task.accounts?.name || "未知账户"}</span>
                    <span>·</span>
                    <span>{displayFrequency}</span>
                    {task.description && (
                      <>
                        <span>·</span>
                        <span className="truncate max-w-[120px]">{task.description}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Next Run */}
                <div className="hidden sm:block text-right">
                  <p className="text-xs text-gray-400">下次执行</p>
                  <p className="text-sm text-gray-700">
                    {format(new Date(task.next_run_date), "MM/dd", { locale: zhCN })}
                  </p>
                </div>

                {/* Amount */}
                <div className="text-right min-w-[80px]">
                  <p
                    className={`text-base font-semibold tabular-nums ${
                      taskType === "expense" ? "text-red-600" : taskType === "transfer" ? "text-blue-600" : "text-green-600"
                    }`}
                  >
                    {taskType === "expense" ? "-" : taskType === "transfer" ? "" : "+"}
                    {currencySymbol}
                    {Math.abs(task.amount).toFixed(2)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => handleToggleActive(task)}
                    disabled={togglingId === task.id}
                    title={task.is_active ? "暂停" : "恢复"}
                  >
                    {togglingId === task.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : task.is_active ? (
                      <Pause size={15} className="text-amber-600" />
                    ) : (
                      <Play size={15} className="text-green-600" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => startEdit(task)}
                    title="编辑"
                  >
                    <Pencil size={15} className="text-gray-500" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => handleDelete(task)}
                    disabled={deletingId === task.id}
                    title="删除"
                  >
                    {deletingId === task.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 size={15} className="text-red-500" />
                    )}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Summary Footer */}
      {!loading && tasks.length > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-400 pt-4 border-t border-gray-100">
          <span>
            共 {tasks.length} 个任务，{tasks.filter((t) => t.is_active).length} 个启用中
          </span>
          <span>
            月预计支出 ¥
            {tasks
              .filter((t) => t.is_active && t.amount < 0 && t.frequency === "monthly")
              .reduce((sum, t) => sum + Math.abs(t.amount), 0)
              .toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
