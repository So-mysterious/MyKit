/**
 * [性质]: [页面] 记账设置中心
 * [Input]: None
 * [Output]: Page UI
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  createTag,
  updateTag,
  deleteTag,
  updateBookkeepingColors,
  updateBookkeepingSettings,
  getExportData,
  updateCurrencyRate,
  BookkeepingKind,
} from "@/lib/bookkeeping/actions";
import { useBookkeepingCache } from "@/lib/bookkeeping/cache/BookkeepingCacheProvider";
// 移除 ImportSection 和 ExportSection，待后续重建数据管理页
// import ImportSection from "./components/ImportSection";
// import ExportSection from "./components/ExportSection";
import { CurrencyRateRow } from "@/types/database";
import { Database } from "@/types/database";
import { Camera, Download, Upload, FileSpreadsheet, FileText, RefreshCw, DollarSign } from "lucide-react";
import { formatAmount } from "@/lib/bookkeeping/useSettings";

type TagRow = {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
};
type BookkeepingSettingsRow = Database["public"]["Tables"]["bookkeeping_settings"]["Row"];

const KIND_LABEL: Record<string, string> = {
  expense: "支出",
  income: "收入",
};

const DEFAULT_TAG_FORM = {
  kind: "expense" as BookkeepingKind,
  name: "",
  description: "",
  is_active: true,
};

const CALIBRATION_INTERVAL_OPTIONS = [
  { value: 7, label: "每周" },
  { value: 14, label: "每两周" },
  { value: 30, label: "每月" },
  { value: 90, label: "每季" },
];

const DECIMAL_OPTIONS = [
  { value: 0, label: "整数" },
  { value: 1, label: "1位" },
  { value: 2, label: "2位" },
  { value: 3, label: "3位" },
  { value: 4, label: "4位" },
];

// CSV 表头定义
const TRANSACTION_CSV_HEADERS = [
  "id", "date", "type", "amount", "category", "description",
  "account_name", "account_currency", "transfer_group_id", "created_at"
];
const SNAPSHOT_CSV_HEADERS = [
  "id", "date", "balance", "type", "account_name", "account_currency", "created_at"
];

export default function SettingsPage() {
  const [loading, setLoading] = React.useState(true);

  // 使用缓存Hook
  const cache = useBookkeepingCache();

  // Settings State
  const [settings, setSettings] = React.useState<BookkeepingSettingsRow | null>(null);
  const [savingColor, setSavingColor] = React.useState(false);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [tempColors, setTempColors] = React.useState({
    expense_color: "#ef4444",
    income_color: "#22c55e",
    transfer_color: "#0ea5e9",
  });
  const [tempSettings, setTempSettings] = React.useState({
    decimal_places: 2,
    thousand_separator: true,
    calibration_reminder_enabled: true,
    calibration_interval_days: 30,
  });

  // Tags State
  const [tags, setTags] = React.useState<TagRow[]>([]);
  const [tagForm, setTagForm] = React.useState(DEFAULT_TAG_FORM);
  const [creatingTag, setCreatingTag] = React.useState(false);
  const [updatingTagId, setUpdatingTagId] = React.useState<string | null>(null);
  const [deletingTagId, setDeletingTagId] = React.useState<string | null>(null);

  // Snapshot State
  const [creatingSnapshot, setCreatingSnapshot] = React.useState(false);
  const [snapshotResult, setSnapshotResult] = React.useState<string | null>(null);

  // Export State
  const [exportStartDate, setExportStartDate] = React.useState("");
  const [exportEndDate, setExportEndDate] = React.useState("");
  const [exporting, setExporting] = React.useState(false);
  const [showExportPreview, setShowExportPreview] = React.useState(false);

  // Currency Rates State
  const [currencyRates, setCurrencyRates] = React.useState<CurrencyRateRow[]>([]);
  const [savingRate, setSavingRate] = React.useState<string | null>(null);

  // Accounts State (for ExportSection)
  const [accounts, setAccounts] = React.useState<any[]>([]);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [settingsData, tagRows, ratesData, accountsData] = await Promise.all([
        cache.getBookkeepingSettings(),        // ✅ 使用缓存
        cache.getAllTags(),                    // ✅ 使用缓存（所有标签）
        cache.getCurrencyRates(),              // ✅ 使用缓存
        cache.getAccounts({ includeBalance: true }), // ✅ 使用缓存
      ]);
      setSettings(settingsData);
      setTempColors({
        expense_color: settingsData.expense_color,
        income_color: settingsData.income_color,
        transfer_color: settingsData.transfer_color,
      });
      setTempSettings({
        decimal_places: settingsData.decimal_places,
        thousand_separator: settingsData.thousand_separator,
        calibration_reminder_enabled: (settingsData as any).calibration_reminder_enabled ?? true,
        calibration_interval_days: (settingsData as any).calibration_interval_days ?? 30,
      });
      setTags(tagRows);

      // 扁平化汇率数据从 Record<from, Record<to, rate>> 到数组
      const flatRates: any[] = [];
      Object.entries(ratesData).forEach(([from, targets]) => {
        Object.entries(targets as Record<string, number>).forEach(([to, rate]) => {
          flatRates.push({
            from_currency: from,
            to_currency: to,
            rate: rate,
            updated_at: new Date().toISOString()
          });
        });
      });
      setCurrencyRates(flatRates);
      setAccounts(accountsData);
    } catch (error) {
      console.error(error);
      alert("加载设置数据失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [cache.getBookkeepingSettings, cache.getAllTags, cache.getCurrencyRates, cache.getAccounts]); // ✅ 只依赖稳定的函数

  React.useEffect(() => {
    fetchData();
    // 设置默认导出日期范围（过去30天）
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    setExportEndDate(today.toISOString().split("T")[0]);
    setExportStartDate(thirtyDaysAgo.toISOString().split("T")[0]);
  }, [fetchData]);

  const handleColorChange = (key: keyof typeof tempColors, value: string) => {
    setTempColors(prev => ({ ...prev, [key]: value }));
  };

  const handleColorSave = async () => {
    setSavingColor(true);
    try {
      await updateBookkeepingColors(tempColors);
      await cache.invalidateAndRefresh(['bookkeepingSettings']); // ✅ 失效并刷新
      alert("颜色配置已保存");
    } catch (error) {
      console.error(error);
      alert("保存失败");
    } finally {
      setSavingColor(false);
    }
  };

  const handleSettingsSave = async () => {
    setSavingSettings(true);
    try {
      await updateBookkeepingSettings(tempSettings);
      await cache.invalidateAndRefresh(['bookkeepingSettings']); // ✅ 失效并刷新
      alert("显示设置已保存");
    } catch (error) {
      console.error(error);
      alert("保存失败");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateTag = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tagForm.name.trim()) {
      alert("请输入标签名称");
      return;
    }
    setCreatingTag(true);
    try {
      await createTag({
        kind: tagForm.kind,
        name: tagForm.name.trim(),
        description: tagForm.description?.trim() || undefined,
        is_active: tagForm.is_active,
      });
      setTagForm(DEFAULT_TAG_FORM);
      // 同时失效标签和账户缓存
      await cache.invalidateAndRefresh(['allTags', 'tags', 'accounts']);
      await fetchData(); // 强制重新抓取最新数据同步状态
    } catch (error) {
      console.error(error);
      alert("新增标签失败");
    } finally {
      setCreatingTag(false);
    }
  };
  const handleToggleTag = async (tag: TagRow) => {
    // 乐观更新
    const originalTags = [...tags];
    setTags(prev => prev.map(t => t.id === tag.id ? { ...t, is_active: !t.is_active } : t));

    setUpdatingTagId(tag.id);
    try {
      await updateTag(tag.id, { is_active: !tag.is_active });
      await cache.invalidateAndRefresh(['allTags', 'tags', 'accounts']);
      await fetchData(); // 补全数据刷新，确保 UI 与缓存最终一致
    } catch (error) {
      console.error(error);
      setTags(originalTags); // 回滚
      alert("更新标签状态失败");
    } finally {
      setUpdatingTagId(null);
    }
  };

  const handleDeleteTag = async (tag: TagRow) => {
    if (!confirm(`确定删除标签「${tag.name}」吗？`)) return;

    setDeletingTagId(tag.id);
    try {
      await deleteTag(tag.id);
      await cache.invalidateAndRefresh(['allTags', 'tags', 'accounts']);
      await fetchData(); // 成功后才通过刷新数据使标签消失
    } catch (error: any) {
      console.error(error);
      alert(error.message || "删除标签失败");
    } finally {
      setDeletingTagId(null);
    }
  };

  // 移除手动快照功能，已替换为校准提醒

  const handleExport = async (format: "csv" | "xlsx") => {
    setExporting(true);
    try {
      const data = await getExportData({
        startDate: exportStartDate || undefined,
        endDate: exportEndDate || undefined,
        includeTransactions: true,
        includeSnapshots: true,
      });

      if (format === "csv") {
        // 导出 CSV
        const transactionsCsv = convertToCSV(data.transactions, TRANSACTION_CSV_HEADERS);
        const snapshotsCsv = convertToCSV(data.snapshots, SNAPSHOT_CSV_HEADERS);

        downloadFile(transactionsCsv, `transactions_${exportStartDate}_${exportEndDate}.csv`, "text/csv");
        downloadFile(snapshotsCsv, `snapshots_${exportStartDate}_${exportEndDate}.csv`, "text/csv");
      } else {
        // 导出 XLS (实际是 TSV，Excel 可以打开)
        const transactionsXls = convertToTSV(data.transactions, TRANSACTION_CSV_HEADERS);
        const snapshotsXls = convertToTSV(data.snapshots, SNAPSHOT_CSV_HEADERS);

        downloadFile(transactionsXls, `transactions_${exportStartDate}_${exportEndDate}.xls`, "application/vnd.ms-excel");
        downloadFile(snapshotsXls, `snapshots_${exportStartDate}_${exportEndDate}.xls`, "application/vnd.ms-excel");
      }

      alert("导出成功！");
    } catch (error) {
      console.error(error);
      alert("导出失败");
    } finally {
      setExporting(false);
    }
  };

  const groupedTags = React.useMemo(() => {
    return tags.reduce<Record<string, TagRow[]>>(
      (acc, row) => {
        const kind = row.kind as string;
        if (!acc[kind]) acc[kind] = [];
        acc[kind].push(row);
        return acc;
      },
      { expense: [], income: [] }
    );
  }, [tags]);

  const handleUpdateRate = async (from: string, to: string, rate: number) => {
    const key = `${from}-${to}`;
    setSavingRate(key);
    try {
      await updateCurrencyRate(from, to, rate);
      await cache.invalidateAndRefresh(['currencyRates']); // ✅ 失效并刷新
    } catch (error) {
      console.error(error);
      alert("更新汇率失败");
    } finally {
      setSavingRate(null);
    }
  };

  // 金额预览
  const previewAmount = 12345.6789;
  const formattedPreview = formatAmount(previewAmount, {
    decimalPlaces: tempSettings.decimal_places,
    thousandSeparator: tempSettings.thousand_separator,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Settings</p>
          <h1 className="text-2xl font-bold tracking-tight">记账设置中心</h1>
          <p className="text-sm text-gray-500">配置全局显示规则、颜色主题、快照策略与数据管理。</p>
        </div>
      </div>

      {/* Display Settings Section */}
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-amber-600 uppercase tracking-wider">Display Rules</p>
            <h2 className="text-xl font-bold text-gray-900 mt-1">金额显示规则</h2>
            <p className="text-sm text-gray-500 mt-1">
              设置金额的小数位数和千分位分隔符，所有页面将统一遵守此规则。
            </p>
          </div>
          <Button onClick={handleSettingsSave} disabled={savingSettings || loading}>
            {savingSettings ? "保存中..." : "保存设置"}
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Decimal Places */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">小数位数</Label>
            <div className="flex gap-2">
              {DECIMAL_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTempSettings(prev => ({ ...prev, decimal_places: opt.value }))}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    tempSettings.decimal_places === opt.value
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Thousand Separator */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">千分位分隔符</Label>
            <div className="flex gap-2">
              <button
                onClick={() => setTempSettings(prev => ({ ...prev, thousand_separator: true }))}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  tempSettings.thousand_separator
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                启用 (1,234.56)
              </button>
              <button
                onClick={() => setTempSettings(prev => ({ ...prev, thousand_separator: false }))}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  !tempSettings.thousand_separator
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                禁用 (1234.56)
              </button>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-xl bg-gray-50 p-4 border border-gray-100">
          <p className="text-xs text-gray-400 mb-2">预览效果</p>
          <div className="flex items-baseline gap-2">
            <span className="text-gray-500 text-sm">原始值: {previewAmount}</span>
            <span className="text-gray-400">→</span>
            <span className="text-2xl font-bold font-mono text-gray-900">{formattedPreview}</span>
          </div>
        </div>
      </section>

      {/* Snapshot Settings Section */}
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-600 uppercase tracking-wider">Auto Snapshot</p>
            <h2 className="text-xl font-bold text-gray-900 mt-1">自动快照设置</h2>
            <p className="text-sm text-gray-500 mt-1">
              自动快照会在每日打卡时检查，如果距离上次快照超过设定间隔，则自动为所有账户创建快照。
            </p>
          </div>
          <Button onClick={handleSettingsSave} disabled={savingSettings || loading}>
            {savingSettings ? "保存中..." : "保存设置"}
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Calibration Reminder Toggle */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">校准提醒</Label>
            <p className="text-xs text-gray-500">
              启用后，系统会在账户距上次校准超过设定天数时提醒您进行余额确认。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setTempSettings(prev => ({ ...prev, calibration_reminder_enabled: true }))}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  tempSettings.calibration_reminder_enabled
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                启用
              </button>
              <button
                onClick={() => setTempSettings(prev => ({ ...prev, calibration_reminder_enabled: false }))}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  !tempSettings.calibration_reminder_enabled
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                禁用
              </button>
            </div>
          </div>

          {/* Calibration Interval */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">提醒间隔</Label>
            <p className="text-xs text-gray-500">
              设置多长时间未校准时触发提醒。
            </p>
            <div className="flex gap-2">
              {CALIBRATION_INTERVAL_OPTIONS.map((opt: { value: number; label: string }) => (
                <button
                  key={opt.value}
                  onClick={() => setTempSettings(prev => ({ ...prev, calibration_interval_days: opt.value }))}
                  disabled={!tempSettings.calibration_reminder_enabled}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    tempSettings.calibration_interval_days === opt.value
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                    !tempSettings.calibration_reminder_enabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Calibration Info */}
        <div className="rounded-xl bg-blue-50 p-4 border border-blue-100">
          <p className="font-medium text-blue-900">关于账户校准</p>
          <p className="text-sm text-blue-700 mt-1">
            校准是您确认账户真实余额的记录。系统会基于最近的校准点计算账户余额，
            确保您的记账数据与实际账户一致。建议定期校准以保持数据准确性。
          </p>
        </div>
      </section>

      {/* Color Settings Section */}
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wider">Global Colors</p>
            <h2 className="text-xl font-bold text-gray-900 mt-1">全局分类配色</h2>
            <p className="text-sm text-gray-500 mt-1">
              设置支出、收入与划转的代表色，系统所有图表与列表将统一使用此配色。
            </p>
          </div>
          <Button onClick={handleColorSave} disabled={savingColor || loading}>
            {savingColor ? "保存中..." : "保存配色"}
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Expense Color */}
          <div className="rounded-xl border border-gray-100 p-4 bg-gray-50/60">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tempColors.expense_color }} />
              <h3 className="font-semibold text-gray-900">支出颜色</h3>
            </div>
            <div className="flex gap-2">
              <input
                type="color"
                className="h-10 w-14 rounded border border-gray-200 cursor-pointer"
                value={tempColors.expense_color}
                onChange={(e) => handleColorChange('expense_color', e.target.value)}
              />
              <Input
                value={tempColors.expense_color}
                onChange={(e) => handleColorChange('expense_color', e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          {/* Income Color */}
          <div className="rounded-xl border border-gray-100 p-4 bg-gray-50/60">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tempColors.income_color }} />
              <h3 className="font-semibold text-gray-900">收入颜色</h3>
            </div>
            <div className="flex gap-2">
              <input
                type="color"
                className="h-10 w-14 rounded border border-gray-200 cursor-pointer"
                value={tempColors.income_color}
                onChange={(e) => handleColorChange('income_color', e.target.value)}
              />
              <Input
                value={tempColors.income_color}
                onChange={(e) => handleColorChange('income_color', e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          {/* Transfer Color */}
          <div className="rounded-xl border border-gray-100 p-4 bg-gray-50/60">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tempColors.transfer_color }} />
              <h3 className="font-semibold text-gray-900">划转颜色</h3>
            </div>
            <div className="flex gap-2">
              <input
                type="color"
                className="h-10 w-14 rounded border border-gray-200 cursor-pointer"
                value={tempColors.transfer_color}
                onChange={(e) => handleColorChange('transfer_color', e.target.value)}
              />
              <Input
                value={tempColors.transfer_color}
                onChange={(e) => handleColorChange('transfer_color', e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Data Export/Import Section - 已移除，待建立独立数据管理页 */}
      {/* 
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-purple-600 uppercase tracking-wider">Data Management</p>
            <h2 className="text-xl font-bold text-gray-900 mt-1">数据导入导出</h2>
            <p className="text-sm text-gray-500 mt-1">
              导入外部账单数据或导出您的流水和快照数据。
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <ImportSection />
          <ExportSection accounts={accounts} />
        </div>
      </section>
      */}

      {/* Currency Rates Section */}
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-amber-600 uppercase tracking-wider">Exchange Rates</p>
            <h2 className="text-xl font-bold text-gray-900 mt-1">汇率设置</h2>
            <p className="text-sm text-gray-500 mt-1">
              用于跨币种预算计算时的汇率转换。
            </p>
          </div>
          <DollarSign className="text-amber-500" size={24} />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {currencyRates.map((rate) => {
            const key = `${rate.from_currency}-${rate.to_currency}`;
            return (
              <div key={key} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {rate.from_currency} → {rate.to_currency}
                  </span>
                  {savingRate === key && (
                    <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">1 {rate.from_currency} =</span>
                  <Input
                    type="number"
                    step="0.0001"
                    className="w-28 text-sm"
                    defaultValue={rate.rate}
                    onBlur={(e) => {
                      const newRate = parseFloat(e.target.value);
                      if (!isNaN(newRate) && newRate > 0 && newRate !== rate.rate) {
                        handleUpdateRate(rate.from_currency, rate.to_currency, newRate);
                      }
                    }}
                  />
                  <span className="text-xs text-gray-500">{rate.to_currency}</span>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  更新于 {new Date(rate.updated_at).toLocaleDateString("zh-CN")}
                </p>
              </div>
            );
          })}
        </div>

        {currencyRates.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            暂无汇率数据。汇率会在创建预算计划时自动初始化。
          </div>
        )}

        <p className="text-xs text-gray-400">
          提示：汇率用于将不同币种的交易金额换算为预算约束币种。请定期更新以确保预算计算准确。
        </p>
      </section>

      {/* Tag Management Section */}
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-600 uppercase tracking-wider">Tag Library</p>
            <h2 className="text-xl font-bold text-gray-900 mt-1">标签管理</h2>
            <p className="text-sm text-gray-500 mt-1">
              标签仅用于归类与筛选，不再绑定特定颜色。
            </p>
          </div>
          <span className="text-xs font-mono text-gray-400">共 {tags.length} 个标签</span>
        </div>

        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreateTag}>
          <div className="space-y-2">
            <Label htmlFor="tag-kind">标签类型</Label>
            <select
              id="tag-kind"
              className="flex h-10 w-full rounded-md border border-gray-200 px-3 text-sm"
              value={tagForm.kind}
              onChange={(e) => setTagForm((prev) => ({ ...prev, kind: e.target.value as BookkeepingKind }))}
            >
              {Object.entries(KIND_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tag-name">标签名称</Label>
            <Input
              id="tag-name"
              placeholder="如：餐饮 / 工资 / 房租"
              value={tagForm.name}
              onChange={(e) => setTagForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="tag-description">描述（可选）</Label>
            <Textarea
              id="tag-description"
              placeholder="补充说明..."
              value={tagForm.description}
              onChange={(e) => setTagForm((prev) => ({ ...prev, description: e.target.value }))}
              className="min-h-[60px]"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input
                  id="tag-status"
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={tagForm.is_active}
                  onChange={(e) => setTagForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                />
                <Label htmlFor="tag-status" className="cursor-pointer">默认启用</Label>
              </div>
              <Button type="submit" disabled={creatingTag} className="min-w-[140px]">
                {creatingTag ? "保存中..." : "新增标签"}
              </Button>
            </div>
          </div>
        </form>

        <div className="grid gap-4">
          {["expense", "income"].map((kind) => (
            <div key={kind} className="rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-400">Kind</p>
                  <h3 className="text-lg font-semibold text-gray-900">{KIND_LABEL[kind]}</h3>
                </div>
                <span className="text-xs text-gray-400">{groupedTags[kind].length} 项</span>
              </div>
              <div className="space-y-2">
                {groupedTags[kind].length === 0 && (
                  <p className="text-xs text-gray-400">还没有标签，先添加一条吧。</p>
                )}
                {groupedTags[kind].map((tag) => (
                  <div
                    key={tag.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{tag.name}</p>
                        {tag.description && <p className="text-xs text-gray-500">{tag.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`rounded-full px-2 py-0.5 ${tag.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"
                          }`}
                      >
                        {tag.is_active ? "已启用" : "已停用"}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="px-2"
                        onClick={() => handleToggleTag(tag)}
                        disabled={updatingTagId === tag.id}
                      >
                        {updatingTagId === tag.id ? "更新中..." : tag.is_active ? "停用" : "启用"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="px-2 text-red-500"
                        onClick={() => handleDeleteTag(tag)}
                        disabled={deletingTagId === tag.id}
                      >
                        {deletingTagId === tag.id ? "删除中..." : "删除"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {loading && (
        <div className="fixed bottom-6 right-6 rounded-full bg-gray-900 text-white px-4 py-2 text-xs shadow-lg">
          设置数据加载中...
        </div>
      )}
    </div>
  );
}

// 辅助函数：转换为 CSV
function convertToCSV(data: Record<string, unknown>[], headers: string[]): string {
  const headerRow = headers.join(",");
  const rows = data.map(item =>
    headers.map(h => {
      const value = item[h];
      if (value === null || value === undefined) return "";
      if (typeof value === "string" && (value.includes(",") || value.includes('"') || value.includes("\n"))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return String(value);
    }).join(",")
  );
  return [headerRow, ...rows].join("\n");
}

// 辅助函数：转换为 TSV (Excel 兼容)
function convertToTSV(data: Record<string, unknown>[], headers: string[]): string {
  const headerRow = headers.join("\t");
  const rows = data.map(item =>
    headers.map(h => {
      const value = item[h];
      if (value === null || value === undefined) return "";
      return String(value).replace(/\t/g, " ");
    }).join("\t")
  );
  return [headerRow, ...rows].join("\n");
}

// 辅助函数：下载文件
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob(["\ufeff" + content], { type: mimeType + ";charset=utf-8" }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
