"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  listTags,
  createTag,
  updateTag,
  deleteTag,
  getBookkeepingSettings,
  updateBookkeepingColors,
  BookkeepingKind,
} from "@/lib/bookkeeping/actions";
import { Database } from "@/types/database";

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

export default function SettingsPage() {
  const [loading, setLoading] = React.useState(true);
  
  // Color Settings State
  const [settings, setSettings] = React.useState<BookkeepingSettingsRow | null>(null);
  const [savingColor, setSavingColor] = React.useState(false);
  const [tempColors, setTempColors] = React.useState({
    expense_color: "#ef4444",
    income_color: "#22c55e",
    transfer_color: "#0ea5e9",
  });

  // Tags State
  const [tags, setTags] = React.useState<TagRow[]>([]);
  const [tagForm, setTagForm] = React.useState(DEFAULT_TAG_FORM);
  const [creatingTag, setCreatingTag] = React.useState(false);
  const [updatingTagId, setUpdatingTagId] = React.useState<string | null>(null);
  const [deletingTagId, setDeletingTagId] = React.useState<string | null>(null);

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
  }, [fetchData]);

  const handleColorChange = (key: keyof typeof tempColors, value: string) => {
    setTempColors(prev => ({ ...prev, [key]: value }));
  };

  const handleColorSave = async () => {
    setSavingColor(true);
    try {
      await updateBookkeepingColors(tempColors);
      alert("颜色配置已保存");
      await fetchData(); // refresh to sync
    } catch (error) {
      console.error(error);
      alert("保存失败");
    } finally {
      setSavingColor(false);
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

  const groupedTags = React.useMemo(() => {
    return tags.reduce<Record<BookkeepingKind, TagRow[]>>(
      (acc, row) => {
        acc[row.kind as BookkeepingKind].push(row);
        return acc;
      },
      { expense: [], income: [], transfer: [] }
    );
  }, [tags]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Settings</p>
        <h1 className="text-2xl font-bold tracking-tight">记账设置中心</h1>
          <p className="text-sm text-gray-500">在这里配置全局颜色主题与标签库。</p>
        </div>
      </div>

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

