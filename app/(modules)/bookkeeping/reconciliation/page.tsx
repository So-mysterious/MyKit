"use client";

import * as React from "react";
import { AlertCircle, CalendarIcon, CheckCircle2, Loader2, RefreshCcw, ShieldAlert, Crosshair } from "lucide-react";
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
import { TransactionModal, TransactionModalSuccessPayload } from "@/components/TransactionModal";
import { SnapshotDialog } from "@/components/SnapshotDialog";
import {
  getAccountsMeta,
  getReconciliationIssues,
  resolveReconciliationIssue,
  runReconciliationCheck,
  regenerateIssuesForAccounts,
  getSnapshotsByIds,
} from "@/lib/bookkeeping/actions";
import { Database } from "@/types/database";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

type ReconciliationIssue = Database["public"]["Tables"]["reconciliation_issues"]["Row"];
type SnapshotRow = Database["public"]["Tables"]["snapshots"]["Row"];
type AccountMeta = { id: string; name: string; currency: string };

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

  const initializedAccountRef = React.useRef(false);

  const accountNameMap = React.useMemo(() => {
    const map = new Map<string, { name: string; currency: string }>();
    accounts.forEach((acc) => map.set(acc.id, { name: acc.name, currency: acc.currency }));
    return map;
  }, [accounts]);

  const hydrateSnapshots = React.useCallback(async (issueList: ReconciliationIssue[]) => {
    const ids = issueList.reduce<string[]>((acc, issue) => {
      if (issue.start_snapshot_id) acc.push(issue.start_snapshot_id);
      if (issue.end_snapshot_id) acc.push(issue.end_snapshot_id);
      return acc;
    }, []);

    if (!ids.length) {
      setSnapshotMap({});
      return;
    }

    const snapshots = await getSnapshotsByIds(ids);
    const map: Record<string, SnapshotRow> = {};
    snapshots.forEach((snap) => {
      map[snap.id] = snap;
    });
    setSnapshotMap(map);
  }, []);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [issueData, accountData] = await Promise.all([getReconciliationIssues("open"), getAccountsMeta()]);
      setIssues(issueData);
      await hydrateSnapshots(issueData);
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
  }, [hydrateSnapshots]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRun = async () => {
    if (!selectedAccount) {
      alert("请先选择需要查账的账户");
      return;
    }
    setRunning(true);
    try {
      const result = await runReconciliationCheck({
        accountId: selectedAccount,
        startDate,
        endDate,
        source: "manual",
      });
      await fetchData();
      if (result.inserted === 0) {
        alert("查账完成，未发现异常。");
      } else {
        alert(`查账完成：发现 ${result.inserted} 个异常时段，请在列表中查看。`);
      }
      setDialogOpen(false);
    } catch (error) {
      console.error("Reconciliation failed", error);
      alert("查账失败，请稍后再试");
    } finally {
      setRunning(false);
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

  const handlePatchFlow = async ({ accountId, type, toAccountId }: TransactionModalSuccessPayload) => {
    try {
      const targets = [accountId];
      if (type === "transfer" && toAccountId) {
        targets.push(toAccountId);
      }
      await regenerateIssuesForAccounts(targets, "manual");
      await fetchData();
    } catch (error) {
      console.error("补流水后重新查账失败", error);
      alert("补流水后重新查账失败，请稍后重试");
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Reconciliation</p>
          <h1 className="text-2xl font-bold tracking-tight">查账中心</h1>
          <p className="text-sm text-gray-500">一键查账、提醒列表与补流水操作集中于此。</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <ShieldAlert size={16} />
              一键查账
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>一键查账</DialogTitle>
              <DialogDescription>选择账户及时间范围，系统将逐段比对快照与流水。</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">账户</label>
                <select
                  className="flex h-11 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/50"
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                >
                  <option value="">选择账户</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currency})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">开始日期</label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">结束日期</label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleRun} disabled={running || !selectedAccount}>
                {running && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                立即查账
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">查账提醒</h2>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">{issues.length} 待处理</span>
          <Button variant="ghost" size="icon" onClick={fetchData} disabled={loading}>
            <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
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
              const startSnap = getSnapshot(issue.start_snapshot_id);
              const endSnap = getSnapshot(issue.end_snapshot_id);
              const snapshotDiff =
                endSnap && startSnap ? Number(endSnap.balance) - Number(startSnap.balance) : issue.expected_delta;

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
                        {issue.source === "snapshot" ? "余额校准" : "手动查账"}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-red-600/10 text-red-700 border border-red-200">待处理</span>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <SnapshotPanel label="起点快照" snapshot={startSnap} />
                    <SnapshotPanel label="终点快照" snapshot={endSnap} />
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <SummaryCard title="流水总和" value={issue.actual_delta} tone="neutral" />
                    <SummaryCard title="后一次 - 前一次" value={snapshotDiff} tone="neutral" />
                    <SummaryCard title="差额（流水 - 快照差）" value={issue.diff} tone="alert" />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <CalendarIcon size={12} />
                      创建于 {format(new Date(issue.created_at), "yyyy年M月d日 HH:mm", { locale: zhCN })}
                    </div>
                    <div className="flex items-center gap-2">
                      <TransactionModal
                        accounts={accounts}
                        defaultAccountId={issue.account_id}
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
            {snapshot.type === "Manual" ? "手动校准" : "自动结算"} · 录入{" "}
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

