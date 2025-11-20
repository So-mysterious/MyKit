export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">设置</h1>
      <div className="space-y-4">
        <div className="rounded-lg border bg-white p-4">
          <h2 className="font-semibold mb-2">分类管理</h2>
          <p className="text-sm text-gray-500">管理收入和支出分类</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <h2 className="font-semibold mb-2">标签管理</h2>
          <p className="text-sm text-gray-500">管理交易标签</p>
        </div>
      </div>
    </div>
  );
}

