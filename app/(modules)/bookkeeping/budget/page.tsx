/**
 * [性质]: [页面] 预算管理 (新建/编辑/查看预算)
 * [Input]: None
 * [Output]: Page UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Check,
  Pause,
  Play,
  RefreshCw,
  TrendingDown,
  Wallet,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createBudgetPlan,
  updateBudgetPlan,
  deleteBudgetPlan,
  toggleBudgetPlanStatus,
  restartBudgetPlan,
  BudgetPlanWithRecords,
} from "@/lib/bookkeeping/actions";
import { useBookkeepingCache } from "@/lib/bookkeeping/cache/BookkeepingCacheProvider";
import { useBookkeepingColors } from "@/lib/bookkeeping/useColors";

// 周期选项
const PERIOD_OPTIONS = [
  { value: "weekly", label: "周度" },
  { value: "monthly", label: "月度" },
] as const;

// 账户筛选模式
const FILTER_MODE_OPTIONS = [
  { value: "all", label: "全部账户" },
  { value: "include", label: "仅包含指定账户" },
  { value: "exclude", label: "排除指定账户" },
] as const;

interface FormState {
  planType: "category" | "total";
  categoryName: string;
  period: "weekly" | "monthly";
  hardLimit: string;
  limitCurrency: string;
  softLimitEnabled: boolean;
  accountFilterMode: "all" | "include" | "exclude";
  accountFilterIds: string[];
  includedCategories: string[];
  startDate: string;
}

const initialFormState: FormState = {
  planType: "category",
  categoryName: "",
  period: "monthly",
  hardLimit: "",
  limitCurrency: "CNY",
  softLimitEnabled: true,
  accountFilterMode: "all",
  accountFilterIds: [],
  includedCategories: [],
  startDate: format(new Date(), "yyyy-MM-dd"),
};

export default function BudgetPage() {
  const { colors } = useBookkeepingColors();

  // 使用缓存Hook
  const cache = useBookkeepingCache();

  // 数据状态
  const [plans, setPlans] = React.useState<BudgetPlanWithRecords[]>([]);
  const [totalPlan, setTotalPlan] = React.useState<BudgetPlanWithRecords | null>(null);
  const [accounts, setAccounts] = React.useState<{ id: string; name: string; currency: string }[]>([]);
  const [tags, setTags] = React.useState<{ kind: string; name: string }[]>([]);

  // UI 状态
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [showNewCategoryForm, setShowNewCategoryForm] = React.useState(false); // 新建标签预算表单
  const [editingPlanId, setEditingPlanId] = React.useState<string | null>(null); // 正在编辑的计划ID（包括总支出和标签）
  const [expandedPlanId, setExpandedPlanId] = React.useState<string | null>(null);
  const [showInfoModal, setShowInfoModal] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(initialFormState);
  const [error, setError] = React.useState<string | null>(null);

  // 格式化账户显示名称（包含父路径）
  const getAccountDisplayName = React.useCallback((account: any): string => {
    const currencySet = new Set(['CNY', 'USD', 'HKD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'SGD', 'TWD', 'KRW', 'THB', 'MYR', 'PHP', 'INR', 'RUB', 'BRL', 'MXN', 'ZAR']);

    if (currencySet.has(account.name) && account.full_path) {
      const parts = account.full_path.split(':');
      if (parts.length >= 2) {
        const parentName = parts[parts.length - 2];
        return `${parentName} ${account.name}`;
      }
    }
    return `${account.name}${account.currency ? ` (${account.currency})` : ''}`;
  }, []);

  // 展平后的实账户列表
  const flattenedRealAccounts = React.useMemo(() => {
    const result: Array<{ id: string; displayName: string }> = [];
    const flatten = (accs: any[]) => {
      accs.forEach(acc => {
        if (!acc.is_group && (acc.type === 'asset' || acc.type === 'liability')) {
          result.push({
            id: acc.id,
            displayName: getAccountDisplayName(acc)
          });
        }
        if (acc.children && acc.children.length) {
          flatten(acc.children);
        }
      });
    };
    flatten(accounts);
    return result;
  }, [accounts, getAccountDisplayName]);

  // 获取支出标签（仅限支出）
  const expenseTags = React.useMemo(() => {
    return tags.filter(t => t.kind === "expense");
  }, [tags]);

  // 加载数据 (使用缓存)
  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansData, accountsData, tagsData] = await Promise.all([
        cache.getBudgetPlans({ includeRecords: true }),
        cache.getAccounts({ includeBalance: false }),
        cache.getTags(),
      ]);

      const categoryPlans = plansData.filter(p => p.plan_type === "category");
      const totalPlanData = plansData.find(p => p.plan_type === "total") || null;

      setPlans(categoryPlans);
      setTotalPlan(totalPlanData);
      setAccounts(accountsData);
      setTags(tagsData);
    } catch (err) {
      console.error("Failed to load budget data:", err);
      setError(err instanceof Error ? err.message : "加载数据失败");
    } finally {
      setLoading(false);
    }
  }, [cache.getBudgetPlans, cache.getAccounts, cache.getTags]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // 重置表单
  const resetForm = () => {
    setForm(initialFormState);
    setEditingPlanId(null);
    setShowNewCategoryForm(false);
    setError(null);
  };

  // 开始编辑
  const startEdit = (plan: BudgetPlanWithRecords) => {
    setEditingPlanId(plan.id);
    setShowNewCategoryForm(false); // 关闭新建表单
    setForm({
      planType: plan.plan_type,
      categoryName: plan.category_account_id || "",
      period: plan.period,
      hardLimit: String(plan.hard_limit),
      limitCurrency: plan.limit_currency,
      softLimitEnabled: plan.soft_limit_enabled,
      accountFilterMode: plan.account_filter_mode,
      accountFilterIds: plan.account_filter_ids || [],
      includedCategories: plan.included_category_ids || [],
      startDate: plan.start_date,
    });
    setError(null);
  };

  // 开始新建标签预算
  const startNewCategory = () => {
    setEditingPlanId(null);
    setForm({ ...initialFormState, planType: "category" });
    setShowNewCategoryForm(true);
    setError(null);
  };

  // 开始新建总支出预算
  const startNewTotal = () => {
    setEditingPlanId("new-total"); // 特殊标记
    setShowNewCategoryForm(false);
    setForm({ ...initialFormState, planType: "total" });
    setError(null);
  };

  // 保存计划
  const handleSave = async () => {
    if (form.planType === "category" && !form.categoryName) {
      setError("请选择标签");
      return;
    }
    if (!form.hardLimit || parseFloat(form.hardLimit) <= 0) {
      setError("请输入有效的刚性约束金额");
      return;
    }

    setSaving(true);
    setError(null);

    // 乐观更新所需数据
    const isNewPlan = editingPlanId === "new-total" || showNewCategoryForm;
    const oldPlans = [...plans];
    const oldTotalPlan = totalPlan;

    try {
      if (!isNewPlan && editingPlanId) {
        // 更新计划 - 先乐观更新界面状态
        if (form.planType === 'total' && totalPlan) {
          setTotalPlan({ ...totalPlan, hard_limit: parseFloat(form.hardLimit) } as any);
        } else {
          setPlans(prev => prev.map(p => p.id === editingPlanId ? { ...p, hard_limit: parseFloat(form.hardLimit) } as any : p));
        }

        await updateBudgetPlan(editingPlanId, {
          hard_limit: parseFloat(form.hardLimit),
          soft_limit_enabled: form.softLimitEnabled,
          account_filter_mode: form.accountFilterMode,
          account_filter_ids: form.accountFilterIds.length > 0 ? form.accountFilterIds : null,
          included_category_ids: form.includedCategories.length > 0 ? form.includedCategories : null,
        });
      } else {
        // 创建计划
        await createBudgetPlan({
          plan_type: form.planType,
          category_account_id: form.planType === "category" ? form.categoryName : undefined,
          period: form.period,
          hard_limit: parseFloat(form.hardLimit),
          limit_currency: form.limitCurrency,
          soft_limit_enabled: form.softLimitEnabled,
          account_filter_mode: form.accountFilterMode,
          account_filter_ids: form.accountFilterIds.length > 0 ? form.accountFilterIds : undefined,
          included_category_ids: form.planType === "total" && form.includedCategories.length > 0
            ? form.includedCategories
            : undefined,
          start_date: form.startDate,
        } as any);
      }

      // ✅ 失效并刷新缓存
      await cache.invalidateAndRefresh(['budgetPlans', 'dashboardBudgetData']);
      resetForm();
      await loadData();
    } catch (err) {
      console.error("Failed to save budget plan:", err);
      // 回退并报错
      setPlans(oldPlans);
      setTotalPlan(oldTotalPlan);
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  // 切换计划状态
  const handleToggleStatus = async (plan: BudgetPlanWithRecords) => {
    const isTotal = plan.plan_type === 'total';
    const newStatus = plan.status === "active" ? "paused" : "active";

    // 乐观更新
    if (isTotal) {
      setTotalPlan((prev: BudgetPlanWithRecords | null) => prev ? ({ ...prev, status: newStatus } as any) : null);
    } else {
      setPlans(prev => prev.map(p => p.id === plan.id ? ({ ...p, status: newStatus } as any) : p));
    }

    try {
      await toggleBudgetPlanStatus(plan.id, newStatus);
      await cache.invalidateAndRefresh(['budgetPlans', 'dashboardBudgetData']);
    } catch (err) {
      console.error("Failed to toggle plan status:", err);
      // 回退
      await loadData();
      setError(err instanceof Error ? err.message : "操作失败");
    }
  };

  // 再启动计划
  const handleRestart = async (plan: BudgetPlanWithRecords) => {
    try {
      await restartBudgetPlan(plan.id);
      await cache.invalidateAndRefresh(['budgetPlans', 'dashboardBudgetData']);
      await loadData();
    } catch (err) {
      console.error("Failed to restart plan:", err);
      setError(err instanceof Error ? err.message : "再启动失败");
    }
  };

  // 删除计划
  const handleDelete = async (planId: string) => {
    if (!confirm("确定要删除这个预算计划吗？")) return;

    // 乐观更新
    const oldPlans = [...plans];
    setPlans(prev => prev.filter(p => p.id !== planId));

    try {
      await deleteBudgetPlan(planId);
      // ✅ 失效并刷新缓存
      await cache.invalidateAndRefresh(['budgetPlans', 'dashboardBudgetData']);
      await loadData();
    } catch (err) {
      console.error("Failed to delete plan:", err);
      setPlans(oldPlans);
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  // 获取账户名称
  const getAccountName = (accountId: string) => {
    const acc = flattenedRealAccounts.find(a => a.id === accountId);
    return acc ? acc.displayName : accountId;
  };

  // 统一的选择框样式（取消厚重的黑色边框，统一风格）
  const selectClassName = "flex h-10 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M7%207L10%204L13%207%22%20stroke%3D%22%236B7280%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3Cpath%20d%3D%22M7%2013L10%2016L13%2013%22%20stroke%3D%22%236B7280%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')] bg-[length:20px_20px] bg-[right_0.5rem_center] bg-no-repeat pr-10";

  // 渲染编辑表单（内联）
  const renderEditForm = (isTotal: boolean, isNew: boolean) => (
    <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">
          {isNew ? "新建" : "编辑"}{isTotal ? "总支出" : "标签"}预算
        </h3>
        <Button variant="ghost" size="sm" onClick={resetForm}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* 标签选择（仅标签预算新建时） */}
      {!isTotal && isNew && (
        <div className="space-y-2">
          <Label>选择标签</Label>
          <select
            className={selectClassName}
            value={form.categoryName}
            onChange={(e) => setForm({ ...form, categoryName: e.target.value })}
          >
            <option value="">请选择...</option>
            {expenseTags.map((tag: any) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 编辑时显示标签名称（只读） */}
      {!isTotal && !isNew && (
        <div className="space-y-2">
          <Label>标签</Label>
          <div className="flex h-10 w-full items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-600">
            {tags.find(t => (t as any).id === form.categoryName)?.name || form.categoryName}
          </div>
        </div>
      )}

      {/* 周期和开始日期（仅新建时） */}
      {isNew && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>预算周期</Label>
            <select
              className={selectClassName}
              value={form.period}
              onChange={(e) => setForm({ ...form, period: e.target.value as "weekly" | "monthly" })}
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>开始日期</Label>
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
        </div>
      )}

      {/* 刚性约束金额和币种 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>刚性约束金额</Label>
          <Input
            type="number"
            placeholder="0.00"
            value={form.hardLimit}
            onChange={(e) => setForm({ ...form, hardLimit: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>约束币种</Label>
          {!isNew ? (
            // 编辑时币种只读显示
            <div className="flex h-10 w-full items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-600">
              {form.limitCurrency}
            </div>
          ) : (
            // 新建时可选择币种
            <select
              className={selectClassName}
              value={form.limitCurrency}
              onChange={(e) => setForm({ ...form, limitCurrency: e.target.value })}
            >
              <option value="CNY">CNY</option>
              <option value="HKD">HKD</option>
              <option value="USD">USD</option>
            </select>
          )}
        </div>
      </div>

      {/* 柔性约束开关 */}
      <div className="flex items-center justify-between py-2">
        <div>
          <Label className="text-sm font-medium">启用柔性约束</Label>
          <p className="text-xs text-gray-500 mt-0.5">自动计算自然时间前3个周期的消费均值作为参考线</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={form.softLimitEnabled}
          onClick={() => setForm({ ...form, softLimitEnabled: !form.softLimitEnabled })}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${form.softLimitEnabled ? "bg-green-500" : "bg-gray-300"
            }`}
        >
          <span
            className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ${form.softLimitEnabled ? "translate-x-5" : "translate-x-0"
              }`}
          />
        </button>
      </div>

      {/* 账户筛选 */}
      <div className="space-y-2">
        <Label>监控账户范围</Label>
        <select
          className={selectClassName}
          value={form.accountFilterMode}
          onChange={(e) => setForm({
            ...form,
            accountFilterMode: e.target.value as "all" | "include" | "exclude",
            accountFilterIds: [],
          })}
        >
          {FILTER_MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {form.accountFilterMode !== "all" && (
          <div className="flex flex-wrap gap-2 mt-3">
            {flattenedRealAccounts.map((acc) => (
              <label
                key={acc.id}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer text-sm transition-all ${form.accountFilterIds.includes(acc.id)
                  ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                  : "border-gray-200 hover:border-blue-300 text-gray-700 bg-white"
                  }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={form.accountFilterIds.includes(acc.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setForm({ ...form, accountFilterIds: [...form.accountFilterIds, acc.id] });
                    } else {
                      setForm({ ...form, accountFilterIds: form.accountFilterIds.filter(id => id !== acc.id) });
                    }
                  }}
                />
                {acc.displayName}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* 总支出计划的纳入标签选择 */}
      {isTotal && (
        <div className="space-y-2">
          <Label>纳入统计的标签</Label>
          <p className="text-xs text-gray-500">不选择则统计全部支出和划转标签</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {expenseTags.map((tag: any) => (
              <label
                key={tag.id}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer text-sm transition-all ${form.includedCategories.includes(tag.id)
                  ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                  : "border-gray-200 hover:border-blue-300 text-gray-700 bg-white"
                  }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={form.includedCategories.includes(tag.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setForm({ ...form, includedCategories: [...form.includedCategories, tag.id] });
                    } else {
                      setForm({ ...form, includedCategories: form.includedCategories.filter(c => c !== tag.id) });
                    }
                  }}
                />
                {tag.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-md">
          {error}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button variant="ghost" onClick={resetForm}>
          <X className="w-4 h-4 mr-2" />
          取消
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              保存中...
            </>
          ) : (
            <>
              <Check className="w-4 h-4 mr-2" />
              {isNew ? "创建计划" : "保存修改"}
            </>
          )}
        </Button>
      </div>
    </div>
  );

  // 渲染计划卡片（显示模式）
  const renderPlanCardDisplay = (plan: BudgetPlanWithRecords) => {
    const isExpanded = expandedPlanId === plan.id;

    const statusBadge = {
      active: { label: "进行中", className: "bg-green-100 text-green-700" },
      paused: { label: "已暂停", className: "bg-gray-100 text-gray-600" },
      expired: { label: "已过期", className: "bg-amber-100 text-amber-700" },
    }[plan.status];

    return (
      <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
        {/* 卡片头部 */}
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {plan.plan_type === "total" ? (
                <Wallet className="w-5 h-5 text-gray-600" />
              ) : (
                <TrendingDown className="w-5 h-5" style={{ color: colors.expense }} />
              )}
              <span className="font-medium">
                {plan.plan_type === "total" ? "总支出" : tags.find(t => (t as any).id === plan.category_account_id)?.name || "未知标签"}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge.className}`}>
                {statusBadge.label}
              </span>
              <span className="text-xs text-gray-400">
                {plan.period === "weekly" ? "周度" : "月度"}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {plan.status === "expired" ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRestart(plan)}
                    title="再启动"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(plan)}
                    title="修改后启动"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleStatus(plan)}
                    title={plan.status === "active" ? "暂停" : "恢复"}
                  >
                    {plan.status === "active" ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(plan)}
                    title="编辑"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </>
              )}
              {plan.plan_type !== "total" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(plan.id)}
                  title="删除"
                  className="text-red-500 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* 简要信息 */}
          <div className="mt-2 text-sm text-gray-500">
            刚性约束: {plan.limit_currency} {plan.hard_limit.toLocaleString()}
            {plan.soft_limit_enabled && " · 柔性约束: 启用"}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {format(new Date(plan.start_date), "yyyy/M/d")} - {format(new Date(plan.end_date), "yyyy/M/d")}
            {" · "}第 {plan.round_number} 轮
          </div>
        </div>

        {/* 展开详情 */}
        <button
          className="w-full px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 flex items-center justify-center gap-1 border-t border-gray-50"
          onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              收起详情
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              查看详情
            </>
          )}
        </button>

        {/* 详情面板 */}
        {isExpanded && (
          <div className="px-4 pb-4 space-y-3 border-t border-gray-50">
            <div className="grid grid-cols-2 gap-4 text-sm pt-3">
              <div>
                <span className="text-gray-500">刚性约束:</span>
                <span className="ml-2 font-medium">
                  {plan.limit_currency} {plan.hard_limit.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-500">柔性约束:</span>
                <span className="ml-2">
                  {plan.soft_limit_enabled ? "启用（前3周期均值）" : "禁用"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">监控账户:</span>
                <span className="ml-2">
                  {plan.account_filter_mode === "all"
                    ? "全部账户"
                    : plan.account_filter_mode === "include"
                      ? "仅包含指定账户"
                      : "排除指定账户"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">计划周期:</span>
                <span className="ml-2">
                  {format(new Date(plan.start_date), "yyyy/M/d")} - {format(new Date(plan.end_date), "yyyy/M/d")}
                </span>
              </div>
            </div>

            {/* 账户筛选详情 */}
            {plan.account_filter_mode !== "all" && plan.account_filter_ids && plan.account_filter_ids.length > 0 && (
              <div className="text-sm">
                <span className="text-gray-500">
                  {plan.account_filter_mode === "include" ? "包含账户:" : "排除账户:"}
                </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {plan.account_filter_ids.map((id) => (
                    <span
                      key={id}
                      className="px-2 py-0.5 bg-gray-100 rounded text-xs"
                    >
                      {getAccountName(id)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 总支出计划的纳入标签 */}
            {plan.plan_type === "total" && (
              <div className="text-sm">
                <span className="text-gray-500">纳入标签:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {plan.included_category_ids && plan.included_category_ids.length > 0 ? (
                    plan.included_category_ids.map((id) => (
                      <span
                        key={id}
                        className="px-2 py-0.5 bg-gray-100 rounded text-xs"
                      >
                        {tags.find(t => (t as any).id === id)?.name || id}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-400 text-xs">全部支出和划转标签</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // 渲染计划卡片（根据状态决定显示模式还是编辑模式）
  const renderPlanCard = (plan: BudgetPlanWithRecords) => {
    const isEditing = editingPlanId === plan.id;

    if (isEditing) {
      return (
        <div key={plan.id}>
          {renderEditForm(plan.plan_type === "total", false)}
        </div>
      );
    }

    return (
      <div key={plan.id}>
        {renderPlanCardDisplay(plan)}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // 判断是否正在新建总支出预算
  const isCreatingTotal = editingPlanId === "new-total";

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
              Budget Management
            </p>
            <h1 className="text-2xl font-bold tracking-tight">预算管理</h1>
            <p className="text-sm text-gray-500">
              设置和管理各类支出预算计划。预算执行情况请在仪表盘查看。
            </p>
          </div>

          {!loading && (plans.length > 0 || totalPlan) && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Wallet size={14} />
                <span>活跃预算: {plans.filter(p => p.status === 'active').length + (totalPlan?.status === 'active' ? 1 : 0)}</span>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowInfoModal(true)}
          className="flex items-center justify-center w-9 h-9 rounded-md border border-gray-200 bg-white shadow-sm text-gray-400 hover:text-blue-500 hover:border-blue-400 transition-colors"
          title="说明信息"
        >
          <Info size={16} />
        </button>
      </div>

      {/* 说明模态框 */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between border-b pb-4">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Info className="w-5 h-5 text-blue-600" />
                  预算说明
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setShowInfoModal(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">刚性约束 (Hard Limit)</h3>
                  <p>您手动设定的最高消费限制。当实际支出超过此限制时，系统会亮红灯提醒您已严重超支。</p>
                </div>

                <div>
                  <h3 className="font-bold text-gray-900 mb-1">柔性约束 (Soft Limit)</h3>
                  <p>启用后，系统会自动计算自然时间前 3 个周期的消费均值作为动态参考。如果当前支出低于该均值，系统会显示“达标”星号。</p>
                </div>

                <div>
                  <h3 className="font-bold text-gray-900 mb-1">跨币种计费逻辑</h3>
                  <p>预算计划支持单一币种结算。当监控账户发生跨币种交易（例如：港币消费计入人民币预算）时，系统会根据<strong>交易发生当日</strong>的汇率实时折算，保证统计的准确性。</p>
                </div>

                <div>
                  <h3 className="font-bold text-gray-900 mb-1">统计口径</h3>
                  <p>标签预算仅统计以该标签为“去向”的外部支出。总支出预算则汇总所有（或指定）支出标签的流水，不包含内部转账。</p>
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end">
                <Button onClick={() => setShowInfoModal(false)}>我明白了</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 全局错误提示 */}
      {error && !editingPlanId && !showNewCategoryForm && (
        <div className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* 总支出预算 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            总支出预算
          </h2>
          {!totalPlan && !isCreatingTotal && (
            <Button size="sm" onClick={startNewTotal}>
              <Plus className="w-4 h-4 mr-2" />
              设置总支出预算
            </Button>
          )}
        </div>

        {/* 新建总支出预算表单 */}
        {isCreatingTotal && renderEditForm(true, true)}

        {/* 已有的总支出预算 */}
        {totalPlan && !isCreatingTotal && renderPlanCard(totalPlan)}

        {/* 空状态 */}
        {!totalPlan && !isCreatingTotal && (
          <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4 text-center">
            尚未设置总支出预算，点击上方按钮开始设置
          </div>
        )}
      </div>

      {/* 标签预算列表 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingDown className="w-5 h-5" />
            标签预算
          </h2>
          {!showNewCategoryForm && !editingPlanId && (
            <Button size="sm" onClick={startNewCategory}>
              <Plus className="w-4 h-4 mr-2" />
              新建标签预算
            </Button>
          )}
        </div>

        {/* 新建标签预算表单（在列表顶部） */}
        {showNewCategoryForm && renderEditForm(false, true)}

        {/* 标签预算列表 */}
        {plans.length > 0 ? (
          <div className="space-y-3">
            {plans.map((plan) => renderPlanCard(plan))}
          </div>
        ) : !showNewCategoryForm && (
          <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4 text-center">
            暂无标签预算，点击上方按钮开始创建
          </div>
        )}
      </div>
    </div>
  );
}
