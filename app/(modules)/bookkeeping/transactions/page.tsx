export default function TransactionsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">流水明细</h1>
        <button className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-black text-white hover:bg-black/90 h-10 px-4 py-2">
          记一笔
        </button>
      </div>
      <div className="rounded-md border bg-white">
        <div className="p-4 text-center text-sm text-gray-500">
          暂无数据
        </div>
      </div>
    </div>
  );
}

