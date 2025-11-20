export default function BookkeepingDashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">仪表盘</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-white text-card-foreground shadow-sm p-6">
          <div className="text-sm font-medium text-muted-foreground">总资产 (CNY)</div>
          <div className="text-2xl font-bold">¥ 0.00</div>
        </div>
        {/* More placeholders... */}
      </div>
    </div>
  );
}

