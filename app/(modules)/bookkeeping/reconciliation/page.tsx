/**
 * [性质]: [页面] 查账中心 (一键查账/差异处理)
 * [Input]: None
 * [Output]: Page UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { AlertCircle, CalendarIcon, CheckCircle2, Loader2, RefreshCcw, ShieldAlert, Crosshair, AlertTriangle, Info, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TransactionModal, TransactionModalSuccessPayload } from "@/components/bookkeeping/TransactionModal";
import { SnapshotDialog } from "@/components/bookkeeping/SnapshotDialog";
import { ReconciliationDialog } from "@/components/bookkeeping/ReconciliationDialog";
import { TransactionItem } from "@/components/bookkeeping/TransactionItem";
import {
  resolveReconciliationIssue,
  runReconciliationCheck,
  runReconciliationCheckBatch,
  regenerateIssuesForAccounts,
  getSnapshotsByIds,
  getTransactions,
  updateTransaction,
} from "@/lib/bookkeeping/actions";
import { useBookkeepingCache } from "@/lib/bookkeeping/cache/BookkeepingCacheProvider";
import { useBookkeepingColors } from "@/lib/bookkeeping/useColors";
import { cn } from "@/lib/utils";
import { Database, TransactionWithAccounts } from "@/types/database";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

type ReconciliationIssue = Database["public"]["Tables"]["reconciliation_issues"]["Row"];
type SnapshotRow = Database["public"]["Tables"]["snapshots"]["Row"];
type AccountMeta = {
  id: string;
  name: string;
  currency: string;
  is_group?: boolean;
  account_class?: 'real' | 'nominal';
  children?: AccountMeta[];
};

function formatRange(start: string, end: string) {
  const startStr = format(new Date(start), "yyyy年M月d日", { locale: zhCN });
  const endStr = format(new Date(end), "yyyy年M月d日", { locale: zhCN });
  return `${startStr} ~ ${endStr}`;
}

export default function ReconciliationPage() {
  const [issues, setIssues] = React.useState<ReconciliationIssue[]>([]);
  const [accounts, setAccounts] = React.useState<AccountMeta[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [selectedAccount, setSelectedAccount] = React.useState<string>("");
  const [startDate, setStartDate] = React.useState(() => {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    return yearStart.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = React.useState(() => new Date().toISOString().split("T")[0]);
  const [running, setRunning] = React.useState(false);
  const [resolvingId, setResolvingId] = React.useState<string | null>(null);
  const [snapshotMap, setSnapshotMap] = React.useState<Record<string, SnapshotRow>>({});
  const [calibrateIssue, setCalibrateIssue] = React.useState<ReconciliationIssue | null>(null);
  const [calibrateAccountId, setCalibrateAccountId] = React.useState<string | null>(null);

  // 使用缓存Hook
  const cache = useBookkeepingCache();
  const { colors } = useBookkeepingColors();

  // 待核对流水状态
  const [needsReviewTransactions, setNeedsReviewTransactions] = React.useState<TransactionWithAccounts[]>([]);
  const [loadingNeedsReview, setLoadingNeedsReview] = React.useState(true);
  const [refreshingNeedsReview, setRefreshingNeedsReview] = React.useState(false);
  const [refreshingIssues, setRefreshingIssues] = React.useState(false);
  const [editingTransaction, setEditingTransaction] = React.useState<TransactionWithAccounts | null>(null);
  const [showInfoModal, setShowInfoModal] = React.useState(false);
  const [infoModalPage, setInfoModalPage] = React.useState(0);
  const [progress, setProgress] = React.useState<{ current: number; total: number } | null>(null);

  const initializedAccountRef = React.useRef(false);

  const accountNameMap = React.useMemo(() => {
    const map = new Map<string, { name: string; currency: string }>();
    const traverse = (nodes: AccountMeta[]) => {
      nodes.forEach((acc) => {
        map.set(acc.id, { name: acc.name, currency: acc.currency });
        if (acc.children?.length) traverse(acc.children);
      });
    };
    traverse(accounts);
    return map;
  }, [accounts]);

  // 过滤出实账户（用于查账）
  const realAccounts = React.useMemo(() => {
    const filterRealAccounts = (nodes: AccountMeta[]): AccountMeta[] => {
      return nodes
        .filter(acc => acc.account_class !== 'nominal')
        .map(acc => ({
          ...acc,
          children: acc.children ? filterRealAccounts(acc.children) : undefined
        }));
    };
    return filterRealAccounts(accounts);
  }, [accounts]);


  const hydrateCalibrations = React.useCallback(async (issueList: ReconciliationIssue[]) => {
    const ids = issueList.reduce<string[]>((acc, issue) => {
      // 使用新的字段名
      const issueAny = issue as any;
      if (issueAny.start_calibration_id) acc.push(issueAny.start_calibration_id);
      if (issueAny.end_calibration_id) acc.push(issueAny.end_calibration_id);
      return acc;
    }, []);

    if (!ids.length) {
      setSnapshotMap({});
      return;
    }

    const calibrations = await getSnapshotsByIds(ids);
    const map: Record<string, SnapshotRow> = {};
    (calibrations as SnapshotRow[]).forEach((cal) => {
      map[cal.id] = cal;
    });
    setSnapshotMap(map);
  }, []);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [issueData, accountData] = await Promise.all([
        cache.getReconciliationIssues("open"), // ✅ 使用缓存
        cache.getAccounts({ includeBalance: false }) // ✅ 使用缓存
      ]);
      setIssues(issueData);
      await hydrateCalibrations(issueData);
      setAccounts(accountData as AccountMeta[]);
      if (!initializedAccountRef.current && accountData?.length) {
        setSelectedAccount(accountData[0].id);
        initializedAccountRef.current = true;
      }
    } catch (error) {
      console.error("Failed to load reconciliation center", error);
      alert("加载查账中心失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [cache.getReconciliationIssues, cache.getAccounts, hydrateCalibrations]);

  // 获取待核对流水 - 增量更新避免闪烁
  const fetchNeedsReviewTransactions = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshingNeedsReview(true);
      // 添加人为延迟，确保动画可见
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      setLoadingNeedsReview(true);
    }
    try {
      const { transactions } = await getTransactions({ needsReview: true, limit: 100 });
      // 对比更新：只有有差异时才更新状态
      setNeedsReviewTransactions(prev => {
        const prevIds = new Set(prev.map(tx => tx.id));
        const newIds = new Set(transactions.map(tx => tx.id));
        // 检查是否有差异
        if (prevIds.size !== newIds.size ||
          [...prevIds].some(id => !newIds.has(id))) {
          return transactions;
        }
        return prev;
      });
    } catch (error) {
      console.error("Failed to load needs review transactions", error);
    } finally {
      setLoadingNeedsReview(false);
      setRefreshingNeedsReview(false);
    }
  }, []);

  // 刷新查账提醒 - 独立 loading 状态
  const refreshIssues = React.useCallback(async () => {
    setRefreshingIssues(true);
    // 添加人为延迟，确保动画可见
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      const issueData = await cache.getReconciliationIssues("open");
      setIssues(issueData);
      await hydrateCalibrations(issueData);
    } catch (error) {
      console.error("Failed to refresh issues", error);
    } finally {
      setRefreshingIssues(false);
    }
  }, [cache.getReconciliationIssues, hydrateCalibrations]);

  React.useEffect(() => {
    fetchData();
    fetchNeedsReviewTransactions();
  }, [fetchData, fetchNeedsReviewTransactions]);

  // 批量查账处理函数 - 客户端循环以支持进度显示
  const handleBatchRun = async (accountIds: string[], startDate: string, endDate: string) => {
    setRunning(true);
    setProgress({ current: 0, total: accountIds.length });

    const results = {
      total_accounts: accountIds.length,
      checked_accounts: 0,
      total_issues_found: 0,
      insufficient_calibrations: 0,
      errors: 0
    };

    try {
      // 逐个处理账户
      for (let i = 0; i < accountIds.length; i++) {
        const accountId = accountIds[i];

        try {
          const result = await runReconciliationCheck(accountId, startDate, endDate);

          if (result.status === 'checked') {
            results.checked_accounts++;
            // 使用类型断言处理可能的类型不匹配
            results.total_issues_found += (result as any).issues_found || 0;
          } else if (result.status === 'insufficient_calibrations') {
            results.insufficient_calibrations++;
          } else if (result.status === 'error') {
            console.error(`Check failed for account ${accountId}`, (result as any).error);
            results.errors++;
          }
        } catch (error) {
          console.error(`Check failed for account ${accountId}`, error);
          results.errors++;
        }

        // 更新进度
        setProgress({ current: i + 1, total: accountIds.length });
      }

      await fetchData();

      // 完成后关闭弹窗
      setDialogOpen(false);

      // 显示结果摘要
      const summary = [
        `检查账户: ${results.checked_accounts}/${results.total_accounts}`,
        `发现问题: ${results.total_issues_found}`,
      ];

      if (results.insufficient_calibrations > 0) {
        summary.push(`校准不足: ${results.insufficient_calibrations} 个账户`);
      }
      if (results.errors > 0) {
        summary.push(`检查失败: ${results.errors} 个账户`);
      }

      // 使用 setTimeout 避免 alert 阻塞最后的渲染更新（虽然 React 状态更新是异步的，但这有助于体验）
      setTimeout(() => {
        alert(`查账完成！\n\n${summary.join('\n')}`);
      }, 100);

    } catch (error) {
      console.error("Batch reconciliation failed", error);
      alert("查账流程异常终止，请检查网络或刷新页面");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const handleResolve = async (id: string) => {
    setResolvingId(id);
    try {
      await resolveReconciliationIssue(id);
      await fetchData();
    } catch (error) {
      console.error("Resolve failed", error);
      alert("标记失败，请稍后重试");
    } finally {
      setResolvingId(null);
    }
  };

  // 编辑流水
  const handleEdit = (tx: TransactionWithAccounts) => {
    setEditingTransaction(tx);
  };

  // 编辑完成后刷新
  const handleEditSuccess = async () => {
    setEditingTransaction(null);
    await fetchNeedsReviewTransactions(true);
  };

  const handlePatchFlow = async () => {
    // 补流水后刷新数据
    await fetchData();
  };

  // 待核对流水状态切换 - 全部乐观更新
  const handleNeedsReviewStatusChange = async (id: string, field: string, value: boolean) => {
    // 保存原始列表用于回滚
    const originalList = [...needsReviewTransactions];

    // 如果是取消待核对，立即从列表移除
    if (field === 'needs_review' && value === false) {
      setNeedsReviewTransactions(prev => prev.filter(tx => tx.id !== id));
    } else {
      // 其他状态切换，乐观更新列表中的对应项
      setNeedsReviewTransactions(prev => prev.map(tx =>
        tx.id === id ? { ...tx, [field]: value } : tx
      ));
    }

    try {
      await updateTransaction(id, { [field]: value });
    } catch (error) {
      console.error("更新状态失败", error);
      // 回滚
      setNeedsReviewTransactions(originalList);
      alert("操作失败，请重试");
    }
  };

  const getSnapshot = (id?: string | null) => {
    if (!id) return undefined;
    return snapshotMap[id];
  };

  // 处理"去校准"按钮点击
  const handleCalibrateClick = (issue: ReconciliationIssue) => {
    setCalibrateIssue(issue);
    // 默认选择问题所属的账户
    setCalibrateAccountId(issue.account_id);
  };

  // 校准完成后的回调
  const handleCalibrateSuccess = async () => {
    setCalibrateIssue(null);
    setCalibrateAccountId(null);
    // 重新运行查账以更新问题列表
    if (calibrateIssue) {
      await regenerateIssuesForAccounts([calibrateIssue.account_id], "manual");
    }
    await fetchData();
  };

  // 获取校准弹窗需要的账户信息
  const getCalibrateAccountInfo = () => {
    if (!calibrateAccountId) return null;
    const account = accountNameMap.get(calibrateAccountId);
    if (!account) return null;
    return {
      id: calibrateAccountId,
      name: account.name,
      currency: account.currency,
    };
  };

  const calibrateAccountInfo = getCalibrateAccountInfo();

  // 获取所有非分组且为实户的账户用于下拉选择
  // 若属于币种户头，则带上父账户名称显示，同时避免币种重复显示
  const leafAccounts = React.useMemo(() => {
    const flat: AccountMeta[] = [];
    const traverse = (nodes: AccountMeta[], parentName?: string, depth = 0) => {
      nodes.forEach(node => {
        if (!node.is_group && node.account_class === 'real') {
          const isCurrency = ['CNY', 'USD', 'HKD', 'JPY', 'EUR', 'GBP'].includes(node.name.toUpperCase());
          let displayName = "";

          // 特殊处理币种子账户：展示为 "父账户名称 币种"
          if (isCurrency && parentName) {
            displayName = `${parentName} ${node.name}`;
          } else {
            // 普通账户：若深度 > 1 (不是直接挂在资产/负债下的)，带上父节点名前缀
            // 资产/负债这类顶级分类通常不带入前缀
            const prefix = (parentName && depth > 1) ? `${parentName} ` : '';
            displayName = `${prefix}${node.name} (${node.currency})`;
          }

          flat.push({ id: node.id, name: displayName, currency: node.currency });
        }

        if (node.children?.length) {
          traverse(node.children, node.name, depth + 1);
        }
      });
    };
    traverse(accounts);
    return flat;
  }, [accounts]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Reconciliation</p>
          <h1 className="text-2xl font-bold tracking-tight">查账中心</h1>
          <p className="text-sm text-gray-500">一键查账、提醒列表与补流水操作集中于此。</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setShowInfoModal(true); setInfoModalPage(0); }}
            className="flex items-center justify-center w-9 h-9 rounded-md border border-gray-200 bg-white shadow-sm text-gray-400 hover:text-blue-500 hover:border-blue-400 transition-colors"
            title="页面说明"
          >
            <Info size={16} />
          </button>
          <ReconciliationDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            accounts={realAccounts}
            onSubmit={handleBatchRun}
            progress={progress}
            trigger={
              <Button className="gap-2">
                <ShieldAlert size={16} />
                一键查账
              </Button>
            }
          />
        </div>
      </div>

      {/* 待核对流水表 */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-orange-500" />
          <h2 className="text-lg font-semibold">待核对流水</h2>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
            {needsReviewTransactions.length} 笔
          </span>
          <Button variant="ghost" size="icon" onClick={() => fetchNeedsReviewTransactions(true)} disabled={refreshingNeedsReview}>
            <RefreshCcw size={16} className={refreshingNeedsReview ? "animate-spin" : ""} />
          </Button>
        </div>

        {loadingNeedsReview ? (
          <div className="flex items-center gap-3 p-6 border rounded-lg text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            正在加载待核对流水...
          </div>
        ) : needsReviewTransactions.length === 0 ? (
          <div className="flex items-center gap-3 p-6 border border-green-200 bg-green-50 rounded-lg text-green-800">
            <CheckCircle2 className="w-5 h-5" />
            <div>
              <p className="font-medium">无待核对流水</p>
              <p className="text-xs opacity-80">所有流水均已核对完毕。</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {/* 表头 */}
            <div className="grid grid-cols-[90px_90px_150px_160px_150px_1fr_36px_36px] gap-2 items-center py-2 px-4 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <div className="text-center">状态</div>
              <div>时间</div>
              <div className="text-center">转出</div>
              <div className="text-center">金额</div>
              <div className="text-center">转入</div>
              <div>备注</div>
              <div />
              <div />
            </div>
            {/* 列表 */}
            {needsReviewTransactions.map((tx) => (
              <TransactionItem
                key={tx.id}
                transaction={tx}
                colors={colors}
                onStatusChange={(id, field, value) => handleNeedsReviewStatusChange(id, field, value as boolean)}
                onEdit={handleEdit}
              />
            ))}
          </div>
        )}
      </section>

      {/* 编辑弹窗 */}
      {editingTransaction && (
        <TransactionModal
          editMode
          initialData={editingTransaction}
          onSuccess={handleEditSuccess}
          onClose={() => setEditingTransaction(null)}
        />
      )}

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">查账提醒</h2>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">{issues.length} 待处理</span>
          <Button variant="ghost" size="icon" onClick={refreshIssues} disabled={refreshingIssues}>
            <RefreshCcw size={16} className={refreshingIssues ? "animate-spin" : ""} />
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 p-6 border rounded-lg text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            正在加载查账提醒...
          </div>
        ) : issues.length === 0 ? (
          <div className="flex items-center gap-3 p-6 border border-green-200 bg-green-50 rounded-lg text-green-800">
            <CheckCircle2 className="w-5 h-5" />
            <div>
              <p className="font-medium">所有账户账目平整</p>
              <p className="text-xs opacity-80">可随时再次运行“一键查账”。</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {issues.map((issue) => {
              const account = accountNameMap.get(issue.account_id);
              const issueAny = issue as any;
              const startCal = getSnapshot(issueAny.start_calibration_id);
              const endCal = getSnapshot(issueAny.end_calibration_id);
              const calibrationDiff =
                endCal && startCal ? Number(endCal.balance) - Number(startCal.balance) : issue.expected_delta;

              return (
                <div key={issue.id} className="rounded-lg border border-red-200 bg-red-50/60 p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-red-700">
                        {account?.name || "未知账户"} · {account?.currency || "--"}
                      </p>
                      <p className="text-xs text-red-500 mt-0.5">{formatRange(issue.period_start, issue.period_end)}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-white text-red-600 border border-red-200">
                        {issue.source === "calibration" ? "余额校准" : "手动查账"}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-red-600/10 text-red-700 border border-red-200">待处理</span>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <SnapshotPanel label="起点校准" snapshot={startCal} />
                    <SnapshotPanel label="终点校准" snapshot={endCal} />
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <SummaryCard title="流水总和" value={issue.actual_delta} tone="neutral" />
                    <SummaryCard title="后一次 - 前一次" value={calibrationDiff} tone="neutral" />
                    <SummaryCard title="差额（流水 - 校准差）" value={issue.diff} tone="alert" />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <CalendarIcon size={12} />
                      创建于 {format(new Date(issue.created_at), "yyyy年M月d日 HH:mm", { locale: zhCN })}
                    </div>
                    <div className="flex items-center gap-2">
                      <TransactionModal
                        onSuccess={handlePatchFlow}
                        trigger={
                          <Button size="sm" variant="secondary" className="text-xs px-3 py-1 h-auto">
                            补流水
                          </Button>
                        }
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        className="text-xs px-3 py-1 h-auto gap-1"
                        onClick={() => handleCalibrateClick(issue)}
                      >
                        <Crosshair size={12} />
                        去校准
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs px-3 py-1 h-auto"
                        onClick={() => handleResolve(issue.id)}
                        disabled={resolvingId === issue.id}
                      >
                        {resolvingId === issue.id && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                        标记已处理
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 校准弹窗 */}
      {calibrateIssue && (
        <Dialog open={!!calibrateIssue} onOpenChange={(open) => !open && setCalibrateIssue(null)}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle>校准账户余额</DialogTitle>
              <DialogDescription>
                选择需要校准的账户，输入该日期的实际余额。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* 账户选择 */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">选择账户</label>
                <select
                  className="flex h-11 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/50"
                  value={calibrateAccountId || ""}
                  onChange={(e) => setCalibrateAccountId(e.target.value)}
                >
                  {/* 问题所属账户 */}
                  {(() => {
                    const account = accountNameMap.get(calibrateIssue.account_id);
                    return account ? (
                      <option value={calibrateIssue.account_id}>
                        {account.name} ({account.currency})
                      </option>
                    ) : null;
                  })()}
                  {/* 如果是划转，可能涉及其他账户 */}
                  {accounts
                    .filter((acc) => acc.id !== calibrateIssue.account_id)
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.currency})
                      </option>
                    ))}
                </select>
              </div>

              {/* 时间段提示 */}
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-800">
                <p className="font-medium">问题时段</p>
                <p className="text-xs mt-1">{formatRange(calibrateIssue.period_start, calibrateIssue.period_end)}</p>
                <p className="text-xs mt-1 opacity-80">建议校准终点日期（{format(new Date(calibrateIssue.period_end), "yyyy年M月d日", { locale: zhCN })}）的余额。</p>
              </div>
            </div>

            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setCalibrateIssue(null)}>
                取消
              </Button>
              {calibrateAccountInfo && (
                <SnapshotDialog
                  accountId={calibrateAccountInfo.id}
                  accountName={calibrateAccountInfo.name}
                  currentEstimatedBalance={0}
                  currency={calibrateAccountInfo.currency}
                  defaultDate={calibrateIssue.period_end.split("T")[0]}
                  onSuccess={handleCalibrateSuccess}
                  trigger={
                    <Button className="gap-1">
                      <Crosshair size={14} />
                      前往校准
                    </Button>
                  }
                />
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 页面说明弹窗 */}
      {showInfoModal && (
        <div
          className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center text-left"
          onClick={() => setShowInfoModal(false)}
        >
          <div
            className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={() => setShowInfoModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>

            {/* 页面标题 */}
            <h3 className="text-lg font-bold mb-4">
              {infoModalPage === 0 && "核心术语说明"}
              {infoModalPage === 1 && "查账逻辑与规则"}
              {infoModalPage === 2 && "账目不平排查建议"}
            </h3>

            {/* 分页内容 */}
            <div className="text-sm text-gray-600 space-y-3 min-h-[220px]">
              {infoModalPage === 0 && (
                <>
                  <p><strong>• 快照额 (Snapshot Balance)</strong>：在特定时间点系统记录的账户固定余额。通常代表该时刻你的实际资产状况。</p>
                  <p><strong>• 计算额 (Calculated Balance)</strong>：从上一个快照点开始，加减其后的所有流水得到的理论余额。计算额 = 上次快照额 + (收入 - 支出)。</p>
                  <p><strong>• 校准额 (Calibrated Balance)</strong>：当你发现系统记录与实际不符时，手动输入并确认的真实余额。确认后会产生一条新的快照作为后续计算的起点。</p>
                </>
              )}
              {infoModalPage === 1 && (
                <>
                  <p><strong>• 账目对齐原理</strong>：系统会对比「当前计算额」与「预设快照额」。若两者之差超过 0.01（即一分钱），则视为账目不平。</p>
                  <p><strong>• 自动对账</strong>：每次创建账户快照（如银行自动同步或手动校准）时，系统会自动运行一次该账户的全量对账。</p>
                  <p><strong>• 手动一键查账</strong>：允许你在指定时间范围内，针对特定账户进行深度扫描，找出所有账目异常的时段。</p>
                </>
              )}
              {infoModalPage === 2 && (
                <>
                  <p className="font-semibold">为什么会出现账目不齐？</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><span className="font-medium text-gray-900">漏记/重记</span>：银行转账已经发生但未录入，或是一笔消费重复输入。</li>
                    <li><span className="font-medium text-gray-900">账户选择错误</span>：本应从银行卡支出，错选成了现金账户。</li>
                    <li><span className="font-medium text-gray-900">起始金额偏差</span>：如果在还没有任何流水时账户初始余额（期初）录入错误，后续所有计算都会带入此误差。</li>
                    <li><span className="font-medium text-gray-900">汇率变动</span>：多币种账户在不同时点计算时，汇率波动可能产生微小差额。</li>
                  </ul>
                  <p className="mt-2"><strong>解决方案</strong>：通过「补流水」手动修正缺失记录，或使用「去校准」以当前真实余额覆盖并建立新起点。</p>
                </>
              )}
            </div>

            {/* 分页导航 */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setInfoModalPage(p => Math.max(0, p - 1))}
                disabled={infoModalPage === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
                上一页
              </button>
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setInfoModalPage(i)}
                    className={cn(
                      "w-2 h-2 rounded-full transition-colors",
                      infoModalPage === i ? "bg-blue-500" : "bg-gray-300"
                    )}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setInfoModalPage(p => Math.min(2, p + 1))}
                disabled={infoModalPage === 2}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                下一页
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SnapshotPanel({ label, snapshot }: { label: string; snapshot?: SnapshotRow }) {
  return (
    <div className="rounded-lg border border-white/80 bg-white/70 p-3 flex flex-col gap-1">
      <p className="text-xs text-gray-500">{label}</p>
      {snapshot ? (
        <>
          <p className="text-sm font-semibold text-gray-900">
            {format(new Date(snapshot.date), "yyyy年M月d日", { locale: zhCN })}
          </p>
          <p className="text-base font-mono font-bold text-gray-900">¥{Number(snapshot.balance).toFixed(2)}</p>
          <p className="text-xs text-gray-500">
            {snapshot.source === "manual" ? "手动校准" : "自动结算"} · 录入{" "}
            {format(new Date(snapshot.created_at), "yyyy年M月d日 HH:mm", { locale: zhCN })}
          </p>
        </>
      ) : (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          未找到对应快照
        </p>
      )}
    </div>
  );
}

function SummaryCard({ title, value, tone }: { title: string; value: number; tone?: "alert" | "neutral" }) {
  const formatted = `${value >= 0 ? "+" : "-"}¥${Math.abs(value).toFixed(2)}`;
  const alertStyles =
    tone === "alert" ? "bg-white border border-red-200 text-red-600" : "bg-white/70 border border-red-100 text-gray-900";

  return (
    <div className={`p-3 rounded-lg ${alertStyles}`}>
      <p className={`text-xs ${tone === "alert" ? "text-red-600 font-semibold" : "text-gray-500"}`}>{title}</p>
      <p className={`font-mono font-semibold ${tone === "alert" ? "text-red-600" : "text-gray-900"}`}>{formatted}</p>
    </div>
  );
}

