"use client";

import * as React from "react";
import { Wallet, TrendingDown, Star, Circle, ChevronRight } from "lucide-react";
import Link from "next/link";
import { updateBudgetPeriodRecord } from "@/lib/bookkeeping/actions";
import { BudgetPlanRow, BudgetPeriodRecordRow } from "@/types/database";
import { useBookkeepingColors } from "@/lib/bookkeeping/useColors";
import { useBookkeepingCache } from "@/lib/bookkeeping/cache/BookkeepingCacheProvider";

interface BudgetPlanData {
  plan: BudgetPlanRow;
  currentPeriod: BudgetPeriodRecordRow | null;
  allRecords: BudgetPeriodRecordRow[];
}

export function BudgetTracker() {
  const { colors } = useBookkeepingColors();
  const cache = useBookkeepingCache(); // ✅ 使用缓存
  const [loading, setLoading] = React.useState(true);
  const [plans, setPlans] = React.useState<BudgetPlanData[]>([]);

  // 加载数据 - 只从缓存获取，不强制更新
  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      // ✅ 只获取缓存数据，不更新period records
      // period records的actual_amount会由Dashboard的每日打卡更新
      const data = await cache.getDashboardBudgetData();
      setPlans(data.plans);
    } catch (err) {
      console.error("Failed to load budget data:", err);
    } finally {
      setLoading(false);
    }
  }, [cache.getDashboardBudgetData]); // ✅ 只依赖稳定函数

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // 渲染指示灯
  const renderIndicator = (status: string, index: number) => {
    switch (status) {
      case "star":
        return (
          <Star
            key={index}
            className="w-3 h-3 fill-amber-400 text-amber-400"
          />
        );
      case "green":
        return (
          <Circle
            key={index}
            className="w-3 h-3 fill-green-500 text-green-500"
          />
        );
      case "red":
        return (
          <Circle
            key={index}
            className="w-3 h-3 fill-red-500 text-red-500"
          />
        );
      default:
        return (
          <Circle
            key={index}
            className="w-3 h-3 text-gray-300"
          />
        );
    }
  };

  // 渲染进度条
  const renderProgressBar = (
    actualAmount: number | null,
    hardLimit: number,
    softLimit: number | null
  ) => {
    const actual = actualAmount || 0;
    const maxLimit = Math.max(hardLimit, softLimit || 0);
    const barMax = maxLimit * 1.3;
    const percentage = Math.min((actual / barMax) * 100, 100);

    // 确定约束线位置
    const hardPos = (hardLimit / barMax) * 100;
    const softPos = softLimit ? (softLimit / barMax) * 100 : null;

    // 确定进度条颜色
    let barColor = "bg-green-500";
    if (softLimit !== null) {
      const minLimit = Math.min(hardLimit, softLimit);
      const maxLimitValue = Math.max(hardLimit, softLimit);

      if (actual > maxLimitValue) {
        barColor = "bg-red-500";
      } else if (actual > minLimit) {
        barColor = "bg-amber-500";
      }
    } else {
      if (actual > hardLimit) {
        barColor = "bg-red-500";
      }
    }

    // 进度条高度 h-3 = 12px
    return (
      <div className="relative h-3 bg-gray-100 rounded-sm overflow-visible">
        {/* 进度条 */}
        <div
          className={`absolute left-0 top-0 h-full rounded-sm transition-all duration-500 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />

        {/* 刚性约束线（实线，与进度条等高） */}
        <div
          className="absolute top-0 w-0.5 h-full bg-gray-800 z-10"
          style={{ left: `${hardPos}%` }}
          title={`刚性约束: ${hardLimit.toLocaleString()}`}
        />

        {/* 柔性约束线（虚线效果，与进度条等高） */}
        {softPos !== null && (
          <div
            className="absolute top-0 w-0.5 h-full z-10"
            style={{
              left: `${softPos}%`,
              background: "repeating-linear-gradient(to bottom, #6b7280 0px, #6b7280 2px, transparent 2px, transparent 4px)",
            }}
            title={`柔性约束: ${softLimit?.toLocaleString()}`}
          />
        )}
      </div>
    );
  };

  // 渲染单个预算计划
  const renderPlanCard = (planData: BudgetPlanData) => {
    const { plan, currentPeriod, allRecords } = planData;
    const isTotal = plan.plan_type === "total";

    // 计算进度百分比
    const actual = currentPeriod?.actual_amount || 0;
    const hardLimit = currentPeriod?.hard_limit || plan.hard_limit;
    const percentage = Math.round((actual / hardLimit) * 100);

    // 计算剩余天数
    let remainingDays = 0;
    if (currentPeriod) {
      const endDate = new Date(currentPeriod.period_end);
      const today = new Date();
      remainingDays = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    }

    // 状态文字
    let statusText = "";
    if (percentage > 100) {
      statusText = "已超支";
    } else if (percentage > 80) {
      statusText = "注意";
    } else {
      statusText = "安全";
    }

    return (
      <div key={plan.id} className="space-y-2">
        {/* 标题行 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isTotal ? (
              <Wallet className="w-4 h-4 text-gray-600" />
            ) : (
              <TrendingDown className="w-4 h-4" style={{ color: colors.expense }} />
            )}
            <span className="text-sm font-medium">
              {isTotal ? "总支出" : plan.category_name}
            </span>
          </div>
          <span className="text-sm text-gray-600">
            {plan.limit_currency} {actual.toLocaleString(undefined, { maximumFractionDigits: 0 })}/{hardLimit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>

        {/* 进度条 */}
        {renderProgressBar(actual, hardLimit, currentPeriod?.soft_limit || null)}

        {/* 指示灯和状态 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            {allRecords
              .sort((a, b) => a.period_index - b.period_index)
              .map((record, idx) => renderIndicator(record.indicator_status, idx))}
          </div>
          <span className="text-xs text-gray-500">
            {percentage}% · {statusText}
            {remainingDays > 0 && ` · 剩余${remainingDays}天`}
          </span>
        </div>
      </div>
    );
  };

  // 按周期分组
  const weeklyPlans = plans.filter(p => p.plan.period === "weekly");
  const monthlyPlans = plans.filter(p => p.plan.period === "monthly");

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">预算追踪</h3>
        </div>
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
          加载中...
        </div>
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">预算追踪</h3>
          <Link
            href="/bookkeeping/budget"
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            设置预算
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
          暂无活跃的预算计划
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">预算追踪</h3>
        <Link
          href="/bookkeeping/budget"
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          查看全部
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="space-y-6">
        {/* 月度预算 */}
        {monthlyPlans.length > 0 && (
          <div className="space-y-4">
            {weeklyPlans.length > 0 && (
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                月度预算
              </div>
            )}
            {monthlyPlans.map((planData) => renderPlanCard(planData))}
          </div>
        )}

        {/* 周度预算 */}
        {weeklyPlans.length > 0 && (
          <div className="space-y-4">
            {monthlyPlans.length > 0 && (
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider pt-2 border-t border-gray-100">
                周度预算
              </div>
            )}
            {weeklyPlans.map((planData) => renderPlanCard(planData))}
          </div>
        )}
      </div>

      {/* 图例 */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
          <span>优秀</span>
        </div>
        <div className="flex items-center gap-1">
          <Circle className="w-3 h-3 fill-green-500 text-green-500" />
          <span>达标</span>
        </div>
        <div className="flex items-center gap-1">
          <Circle className="w-3 h-3 fill-red-500 text-red-500" />
          <span>超支</span>
        </div>
        <div className="flex items-center gap-1">
          <Circle className="w-3 h-3 text-gray-300" />
          <span>未到</span>
        </div>
      </div>
    </div>
  );
}

