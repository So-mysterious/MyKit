export default function AccountsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">账户管理</h1>
      <div className="grid gap-4 md:grid-cols-3">
        {/* Placeholder Account Card */}
        <div className="rounded-xl border bg-white text-card-foreground shadow-sm p-6">
          <div className="flex flex-col space-y-1.5">
            <h3 className="font-semibold leading-none tracking-tight">招商银行</h3>
            <p className="text-sm text-muted-foreground">储蓄卡</p>
          </div>
          <div className="p-6 pt-4 pl-0">
            <div className="text-2xl font-bold">¥ 0.00</div>
          </div>
        </div>
      </div>
    </div>
  );
}

