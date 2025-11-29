"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  listTags,
  createTag,
  updateTag,
  deleteTag,
  getBookkeepingSettings,
  updateBookkeepingColors,
  updateBookkeepingSettings,
  createManualSnapshotsForAllAccounts,
  getExportData,
  BookkeepingKind,
} from "@/lib/bookkeeping/actions";
import { Database } from "@/types/database";
import { Camera, Download, Upload, FileSpreadsheet, FileText } from "lucide-react";
import { formatAmount } from "@/lib/bookkeeping/useSettings";

type TagRow = Database["public"]["Tables"]["bookkeeping_tags"]["Row"];
type BookkeepingSettingsRow = Database["public"]["Tables"]["bookkeeping_settings"]["Row"];

const KIND_LABEL: Record<BookkeepingKind, string> = {
  expense: "支出",
  income: "收入",
  transfer: "划转",
};

const DEFAULT_TAG_FORM = {
  kind: "expense" as BookkeepingKind,
  name: "",
  description: "",
  is_active: true,
};

const SNAPSHOT_INTERVAL_OPTIONS = [
  { value: 1, label: "每天" },
  { value: 7, label: "每周" },
  { value: 14, label: "每两周" },
  { value: 30, label: "每月" },
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
    auto_snapshot_enabled: true,
    snapshot_interval_days: 30,
    snapshot_tolerance: 0.01,
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

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [settingsData, tagRows] = await Promise.all([getBookkeepingSettings(), listTags()]);
      setSettings(settingsData);
      setTempColors({
        expense_color: settingsData.expense_color,
        income_color: settingsData.income_color,
        transfer_color: settingsData.transfer_color,
      });
      setTempSettings({
        decimal_places: settingsData.decimal_places,
        thousand_separator: settingsData.thousand_separator,
        auto_snapshot_enabled: settingsData.auto_snapshot_enabled,
        snapshot_interval_days: settingsData.snapshot_interval_days,
        snapshot_tolerance: settingsData.snapshot_tolerance,
      });
      setTags(tagRows);
    } catch (error) {
      console.error(error);
      alert("加载设置数据失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, []);

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
      alert("颜色配置已保存");
      await fetchData();
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
      alert("显示设置已保存");
      await fetchData();
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
      await fetchData();
    } catch (error) {
      console.error(error);
      alert("新增标签失败");
    } finally {
      setCreatingTag(false);
    }
  };

  const handleToggleTag = async (tag: TagRow) => {
    setUpdatingTagId(tag.id);
    try {
      await updateTag(tag.id, { is_active: !tag.is_active });
      await fetchData();
    } catch (error) {
      console.error(error);
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
      await fetchData();
    } catch (error) {
      console.error(error);
      alert("删除标签失败");
    } finally {
      setDeletingTagId(null);
    }
  };

  const handleManualSnapshot = async () => {
    if (!confirm("确定要为所有账户创建快照吗？")) return;
    setCreatingSnapshot(true);
    setSnapshotResult(null);
    try {
      const result = await createManualSnapshotsForAllAccounts();
      setSnapshotResult(`成功创建 ${result.created} 个快照`);
    } catch (error) {
      console.error(error);
      alert("创建快照失败");
    } finally {
      setCreatingSnapshot(false);
    }
  };

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
    return tags.reduce<Record<BookkeepingKind, TagRow[]>>(
      (acc, row) => {
        acc[row.kind as BookkeepingKind].push(row);
        return acc;
      },
      { expense: [], income: [], transfer: [] }
    );
  }, [tags]);

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
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Auto Snapshot Toggle */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">自动快照</Label>
            <div className="flex gap-2">
              <button
                onClick={() => setTempSettings(prev => ({ ...prev, auto_snapshot_enabled: true }))}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  tempSettings.auto_snapshot_enabled
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                启用
              </button>
              <button
                onClick={() => setTempSettings(prev => ({ ...prev, auto_snapshot_enabled: false }))}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  !tempSettings.auto_snapshot_enabled
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                禁用
              </button>
            </div>
          </div>

          {/* Snapshot Interval */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">快照间隔</Label>
            <div className="flex gap-2">
              {SNAPSHOT_INTERVAL_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTempSettings(prev => ({ ...prev, snapshot_interval_days: opt.value }))}
                  disabled={!tempSettings.auto_snapshot_enabled}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    tempSettings.snapshot_interval_days === opt.value
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                    !tempSettings.auto_snapshot_enabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Snapshot Tolerance */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">查账容差阈值</Label>
          <p className="text-xs text-gray-500">
            当流水与快照的差额小于此值时，不会触发查账提醒。用于忽略微小的精度误差。
          </p>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={tempSettings.snapshot_tolerance}
              onChange={(e) => setTempSettings(prev => ({ ...prev, snapshot_tolerance: parseFloat(e.target.value) || 0 }))}
              className="w-32 font-mono"
            />
            <span className="text-sm text-gray-500">元</span>
            <div className="flex gap-2 ml-4">
              {[0.01, 0.1, 1, 10].map(val => (
                <button
                  key={val}
                  onClick={() => setTempSettings(prev => ({ ...prev, snapshot_tolerance: val }))}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-all",
                    tempSettings.snapshot_tolerance === val
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Manual Snapshot */}
        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4 border border-gray-100">
          <div>
            <p className="font-medium text-gray-900">立即创建快照</p>
            <p className="text-sm text-gray-500">为所有账户创建一个手动快照，记录当前余额。</p>
          </div>
          <Button 
            onClick={handleManualSnapshot} 
            disabled={creatingSnapshot}
            variant="outline"
            className="gap-2"
          >
            <Camera size={16} />
            {creatingSnapshot ? "创建中..." : "创建快照"}
          </Button>
        </div>
        {snapshotResult && (
          <p className="text-sm text-green-600 bg-green-50 px-4 py-2 rounded-lg">{snapshotResult}</p>
        )}
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

      {/* Data Export/Import Section */}
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-purple-600 uppercase tracking-wider">Data Management</p>
            <h2 className="text-xl font-bold text-gray-900 mt-1">数据导入导出</h2>
            <p className="text-sm text-gray-500 mt-1">
              导出选定时间范围内的流水和快照数据，或导入外部数据。
            </p>
          </div>
        </div>

        {/* Export Section */}
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Download size={18} />
            数据导出
          </h3>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>开始日期</Label>
              <Input
                type="date"
                value={exportStartDate}
                onChange={(e) => setExportStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>结束日期</Label>
              <Input
                type="date"
                value={exportEndDate}
                onChange={(e) => setExportEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button 
              onClick={() => handleExport("csv")} 
              disabled={exporting}
              variant="outline"
              className="gap-2"
            >
              <FileText size={16} />
              导出 CSV
            </Button>
            <Button 
              onClick={() => handleExport("xlsx")} 
              disabled={exporting}
              variant="outline"
              className="gap-2"
            >
              <FileSpreadsheet size={16} />
              导出 XLS
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowExportPreview(!showExportPreview)}
              className="text-gray-500"
            >
              {showExportPreview ? "隐藏格式预览" : "查看格式预览"}
            </Button>
          </div>

          {/* Export Format Preview */}
          {showExportPreview && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl bg-gray-50 p-4 border border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">流水数据表头</p>
                <div className="flex flex-wrap gap-1">
                  {TRANSACTION_CSV_HEADERS.map(header => (
                    <span key={header} className="px-2 py-1 bg-white rounded text-xs font-mono text-gray-700 border border-gray-200">
                      {header}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 p-4 border border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">快照数据表头</p>
                <div className="flex flex-wrap gap-1">
                  {SNAPSHOT_CSV_HEADERS.map(header => (
                    <span key={header} className="px-2 py-1 bg-white rounded text-xs font-mono text-gray-700 border border-gray-200">
                      {header}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Import Section */}
        <div className="space-y-4 pt-4 border-t border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Upload size={18} />
            数据导入
          </h3>
          
          <div className="rounded-xl bg-gray-50 p-6 border-2 border-dashed border-gray-200 text-center">
            <Upload className="mx-auto text-gray-400 mb-3" size={32} />
            <p className="text-sm text-gray-600 mb-2">拖拽文件到此处，或点击选择文件</p>
            <p className="text-xs text-gray-400 mb-4">支持 CSV、XLS 格式</p>
            <input
              type="file"
              accept=".csv,.xls,.xlsx"
              className="hidden"
              id="import-file"
              onChange={() => alert("导入功能开发中...")}
            />
            <label htmlFor="import-file">
              <Button variant="outline" className="cursor-pointer" asChild>
                <span>选择文件</span>
              </Button>
            </label>
          </div>
          <p className="text-xs text-gray-400">
            注意：导入功能正在开发中，目前仅支持导出。
          </p>
        </div>
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
          {(Object.keys(KIND_LABEL) as BookkeepingKind[]).map((kind) => (
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
                        className={`rounded-full px-2 py-0.5 ${
                          tag.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"
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
