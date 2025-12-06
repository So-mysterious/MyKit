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
  recalculateAllBudgetPeriods,
  commitBudgetRecalculations,
  BudgetRecalculationItem,
} from "@/lib/bookkeeping/actions";
import { useBookkeepingCache } from "@/lib/bookkeeping/cache/BookkeepingCacheProvider";
import { useBookkeepingColors } from "@/lib/bookkeeping/useColors";
import { BudgetRecalcDialog } from "@/components/BudgetRecalcDialog";

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
  const [form, setForm] = React.useState<FormState>(initialFormState);
  const [error, setError] = React.useState<string | null>(null);

  // 重算相关状态 
  const [recalculating, setRecalculating] = React.useState(false);
  const [recalcReport, setRecalcReport] = React.useState<BudgetRecalculationItem[] | null>(null);
  const [showRecalcDialog, setShowRecalcDialog] = React.useState(false);
  const [commitingRecalc, setCommitingRecalc] = React.useState(false);

  // 获取支出和划转标签
  const expenseAndTransferTags = React.useMemo(() => {
    return tags.filter(t => t.kind === "expense" || t.kind === "transfer");
  }, [tags]);

  // 加载数据 (使用缓存)
  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansData, accountsData, tagsData] = await Promise.all([
        cache.getBudgetPlans({ includeRecords: true }), // ✅ 使用缓存
        cache.getAccounts({ includeBalance: false }), // ✅ 使用缓存
        cache.getTags(), // ✅ 使用缓存
      ]);

      // 分离标签计划和总支出计划
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
  }, [cache.getBudgetPlans, cache.getAccounts, cache.getTags]); // ✅ 只依赖稳定的函数

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
      categoryName: plan.category_name || "",
      period: plan.period,
      hardLimit: String(plan.hard_limit),
      limitCurrency: plan.limit_currency,
      softLimitEnabled: plan.soft_limit_enabled,
      accountFilterMode: plan.account_filter_mode,
      accountFilterIds: plan.account_filter_ids || [],
      includedCategories: plan.included_categories || [],
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

    try {
      const isNewPlan = editingPlanId === "new-total" || showNewCategoryForm;

      if (!isNewPlan && editingPlanId) {
        // 更新计划
        await updateBudgetPlan(editingPlanId, {
          hard_limit: parseFloat(form.hardLimit),
          soft_limit_enabled: form.softLimitEnabled,
          account_filter_mode: form.accountFilterMode,
          account_filter_ids: form.accountFilterIds.length > 0 ? form.accountFilterIds : null,
          included_categories: form.includedCategories.length > 0 ? form.includedCategories : null,
        });
      } else {
        // 创建计划
        await createBudgetPlan({
          plan_type: form.planType,
          category_name: form.planType === "category" ? form.categoryName : undefined,
          period: form.period,
          hard_limit: parseFloat(form.hardLimit),
          limit_currency: form.limitCurrency,
          soft_limit_enabled: form.softLimitEnabled,
          account_filter_mode: form.accountFilterMode,
          account_filter_ids: form.accountFilterIds.length > 0 ? form.accountFilterIds : undefined,
          included_categories: form.planType === "total" && form.includedCategories.length > 0
            ? form.includedCategories
            : undefined,
          start_date: form.startDate,
        });
      }

      // ✅ 失效并刷新缓存
      await cache.invalidateAndRefresh(['budgetPlans', 'dashboardBudgetData']);
      resetForm();
      await loadData();
    } catch (err) {
      console.error("Failed to save budget plan:", err);
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  // 切换计划状态
  const handleToggleStatus = async (plan: BudgetPlanWithRecords) => {
    try {
      const newStatus = plan.status === "active" ? "paused" : "active";
      await toggleBudgetPlanStatus(plan.id, newStatus);
      await loadData();
    } catch (err) {
      console.error("Failed to toggle plan status:", err);
      setError(err instanceof Error ? err.message : "操作失败");
    }
  };

  // 再启动计划
  const handleRestart = async (plan: BudgetPlanWithRecords) => {
    try {
      await restartBudgetPlan(plan.id);
      await loadData();
    } catch (err) {
      console.error("Failed to restart plan:", err);
      setError(err instanceof Error ? err.message : "再启动失败");
    }
  };

  // 删除计划
  const handleDelete = async (planId: string) => {
    if (!confirm("确定要删除这个预算计划吗？")) return;

    try {
      await deleteBudgetPlan(planId);
      // ✅ 失效并刷新缓存
      await cache.invalidateAndRefresh(['budgetPlans', 'dashboardBudgetData']);
      await loadData();
    } catch (err) {
      console.error("Failed to delete plan:", err);
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  // 重算所有预算
  const handleRecalculate = async () => {
    if (!confirm('重算所有预算周期可能需要较长时间（约5-10秒），确定要继续吗？')) {
      return;
    }

    setRecalculating(true);
    try {
      const results = await recalculateAllBudgetPeriods();

      if (results.length === 0) {
        alert('所有预算数据已是最新，无需修正');
        return;
      }

      setRecalcReport(results);
      setShowRecalcDialog(true);
    } catch (err) {
      console.error(err);
      alert('重算失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setRecalculating(false);
    }
  };

  // 提交重算结果
  const handleCommitRecalc = async () => {
    if (!recalcReport) return;

    setCommitingRecalc(true);
    try {
      await commitBudgetRecalculations(recalcReport);
      await cache.invalidateAndRefresh(['budgetPlans', 'dashboardBudgetData']);
      alert(`成功修正 ${recalcReport.length} 个周期的数据`);
      setShowRecalcDialog(false);
      setRecalcReport(null);
      await loadData();
    } catch (err) {
      console.error(err);
      alert('提交失败，数据未修改：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setCommitingRecalc(false);
    }
  };

  // 获取账户名称
  const getAccountName = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    return account ? `${account.name} (${account.currency})` : accountId;
  };

  // 统一的选择框样式（与 Input 等高）
  const selectClassName = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

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
            {expenseAndTransferTags.map((tag) => (
              <option key={tag.name} value={tag.name}>
                {tag.name} ({tag.kind === "expense" ? "支出" : "划转"})
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
            {form.categoryName}
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
            {accounts.map((acc) => (
              <label
                key={acc.id}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer text-sm transition-colors ${form.accountFilterIds.includes(acc.id)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-gray-200 hover:border-gray-300 text-gray-700"
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
                {acc.name}
                <span className="text-xs opacity-60">({acc.currency})</span>
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
            {expenseAndTransferTags.map((tag) => (
              <label
                key={tag.name}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer text-sm transition-colors ${form.includedCategories.includes(tag.name)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-gray-200 hover:border-gray-300 text-gray-700"
                  }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={form.includedCategories.includes(tag.name)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setForm({ ...form, includedCategories: [...form.includedCategories, tag.name] });
                    } else {
                      setForm({ ...form, includedCategories: form.includedCategories.filter(c => c !== tag.name) });
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
                {plan.plan_type === "total" ? "总支出" : plan.category_name}
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
                  {plan.included_categories && plan.included_categories.length > 0 ? (
                    plan.included_categories.map((cat) => (
                      <span
                        key={cat}
                        className="px-2 py-0.5 bg-gray-100 rounded text-xs"
                      >
                        {cat}
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
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
            Budget Management
          </p>
          <h1 className="text-2xl font-bold tracking-tight">预算管理</h1>
          <p className="text-sm text-gray-500">
            设置和管理各类支出预算计划。预算执行情况请在仪表盘查看。
          </p>
        </div>

        {/* 重算按钮 */}
        <Button
          variant="outline"
          onClick={handleRecalculate}
          disabled={recalculating || loading}
        >
          {recalculating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              计算中...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              重算所有预算
            </>
          )}
        </Button>
      </div>

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

      {/* 重算对话框 */}
      {recalcReport && (
        <BudgetRecalcDialog
          open={showRecalcDialog}
          onOpenChange={setShowRecalcDialog}
          recalculations={recalcReport}
          onConfirm={handleCommitRecalc}
          loading={commitingRecalc}
        />
      )}
    </div>
  );
}
