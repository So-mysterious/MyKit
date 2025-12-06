# 开发日志 (Development Log)

## 2025-12-06
- **安全账户删除功能增强**：
    - **后端改进** (`lib/bookkeeping/actions.ts`):
        - `deleteAccount(id)`: 重写删除逻辑，先查找所有相关划转流水，通过 `transfer_group_id` 删除配对的双侧记录，避免孤立划转数据。
        - 实现流程：
          1. 查询账户的所有划转流水
          2. 收集唯一的 `transfer_group_id`
          3. 删除整个划转组（两侧流水）
          4. 删除账户（ON DELETE CASCADE 自动清理其他数据）
        - 返回值包含删除的划转组数量，方便调试验证
    - **前端交互优化** (`app/(modules)/bookkeeping/accounts/page.tsx`):
        - 增强删除确认对话框，详细列出将被删除的数据类型
        - 添加 console.log 调试输出，显示删除进度
        - **修复 UI 刷新问题**: 删除成功后立即更新 React 状态（`setAccounts(prev => prev.filter(...))`），避免缓存时序导致的延迟刷新
        - 错误处理：删除失败时重新加载数据确保 UI 正确
        - 全面的缓存失效：包括 accounts、dashboardTransactions、heatmapAggregation、dashboardBudgetData

- **预算重算功能完整实现**：
    - **后端 API** (`lib/bookkeeping/actions.ts`):
      - `recalculateAllBudgetPeriods()`: 重算所有历史预算周期，生成差异报告但不修改数据库
        - 查询所有预算周期记录
        - 逐个重新计算 actual_amount、soft_limit、indicator_status
        - 对比新旧值，只返回有变化的记录
        - 复用 `updateBudgetPeriodRecord` 的核心计算逻辑
      - `commitBudgetRecalculations(recalculations)`: 批量提交用户确认的修正数据
        - 使用批量 UPDATE 操作
        - 正确类型转换 indicator_status（避免类型错误）
      - 新增 `BudgetRecalculationItem` 接口定义差异报告结构
    - **前端组件** (`components/BudgetRecalcDialog.tsx`):
        - 创建新对话框组件展示重算报告
        - 按预算计划分组显示修正项
        - 对比显示旧值 → 新值的变化
        - 状态图标：⭐ 优秀、✅ 达标、❌ 超支
        - 提供取消和确认按钮，用户确认后才提交
    - **页面集成** (`app/(modules)/bookkeeping/budget/page.tsx`):
        - 页面右上角添加"重算所有预算"按钮
        - 二次确认机制（提示耗时 5-10 秒）
        - Loading 状态显示
        - 成功后失效相关缓存（budgetPlans、dashboardBudgetData）并刷新
    - **设计原则**：
        - ✅ 前端计算，避免长时间数据库锁
        - ✅ 用户确认再提交，防止中断导致数据不一致
        - ✅ 透明的差异报告，用户可审核修正内容

- **划转显示逻辑健壮性增强**：
    - **数据库设计验证**：
        - 确认实际数据库使用 `transfer_group_id` 机制（无 `to_account_id` 字段）
        - 符合会计原理：一笔划转 = 2条流水 + 共享 `transfer_group_id`
        - 验证 UUID 格式限制（只能用 0-9, a-f）
    - **前端显示改进** (`components/TransactionItem.tsx`):
        - 添加健壮性检查，防止"A→A"自转账显示bug
        - 账户缺失检查：显示"A → [已删除账户]"（灰色提示）
        - 自转账异常检查：显示"A → [数据异常]"（红色警告）+ 控制台警告
        - 单独划转处理：显示"A → [未显示]"或"[未显示] → A"（灰色提示）
        - 颜色编码：深灰（正常）、浅灰（不完整）、红色（异常）
    - **根本原因分析**：
        - 问题不是数据库设计缺陷，而是前端未处理边界情况
        - 数据完整性检查：确认所有 transfer_group 都有2条记录
    - **测试数据脚本** (`complete_database_reset.sql`):
        - 创建完整的测试环境（3个账户、多种划转场景）
        - 数据完整性验证查询
        - 修复 UUID 格式问题（使用有效的十六进制字符）

- **关键技术提示**：
    - **安全删除**: 必须先清理 `transfer_group`，再删除账户，避免孤立数据
    - **UI 刷新**: 关键操作后立即更新 React 状态，不依赖异步缓存刷新
    - **预算重算**: 采用"计算报告 → 用户确认 → 批量提交"模式，保证原子性
    - **划转显示**: 前端必须处理所有边界情况（账户缺失、数据不完整、自转账异常）
    - **会计原理**: 双向分录机制（transfer_group_id）优于单向引用（to_account_id）

---

## 2025-12-03
- **流水页面编辑和删除功能**:
    - **后端函数** (`lib/bookkeeping/actions.ts`):
        - `deleteTransaction(id)`: 删除交易,自动处理划转组(删除两条关联记录)。
    - **TransactionModal 扩展**:
        - 新增 `editMode` 和 `initialData` props 支持编辑模式。
        - 编辑模式下**隐藏类型切换器**,但允许修改所有其他字段(金额、账户、分类、备注、日期)。
        - 编辑采用"删除+重建"策略,确保数据一致性。
        - 自动打开对话框当 `editMode` 为 true。
        - **Bug 修复**: 修复了点击对话框外部关闭后滚动页面会导致对话框重新打开的问题。通过在 `handleOpenChange` 中检测对话框关闭时调用 `onClose()` 清除 `editingTransaction` 状态。
    - **TransactionItem 组件**:
        - 添加 `onEdit` 和 `onDelete` 回调 props。
        - 添加悬停激活的编辑(铅笔)和删除(红色垃圾桶)按钮。
        - 删除操作显示加载指示器。
        - 调整 grid 布局: 金额栏从 `200px` 缩小至 `160px`, 新增 `80px` 操作列。
    - **TransactionsPage 集成**:
        - 实现 `handleEdit` 和 `handleDelete` 处理器。
        - 删除前显示确认弹窗。
        - 编辑/删除操作成功后自动刷新流水列表。
        - 修复表头 grid 列定义以匹配新布局。
    - **用户体验**:
        - ✅ 悬停行时显示操作按钮 (opacity-0 → opacity-100)
        - ✅ 编辑允许修改所有字段(类型除外)
        - ✅ 删除划转时自动删除两条关联记录
        - ✅ 所有操作提供即时视觉反馈

---

## 2025-12-02
- **数据导入导出功能完整实现**：
    - **后端模块** (`lib/bookkeeping/importers/` & `lib/bookkeeping/exporters.ts`):
        - **智能解析器**：
            - `xlsParser.ts`：自动识别微信/支付宝账单表头，跳过元信息行，灵活解析日期和金额。
            - `nlParser.ts`：解析分号分隔的自然语言交易记录（未来支持 AI 截图转文本）。
        - **验证与检测**：
            - `validator.ts`：全或无原则验证，精确匹配账户名（无模糊匹配），验证所有必填字段。
            - `duplicateDetector.ts`：基于日期、账户、金额、类型、分类的多字段匹配（匹配度 >= 75% 视为疑似重复）。
            - `reportGenerator.ts`：生成详细导入报告（统计、账户/分类分布、新标签、疑似重复列表）。
        - **导出模块**：
            - `exporters.ts`：支持 CSV/XLSX 格式，智能合并划转记录（将同一 `transfer_group_id` 的两条记录合并为一条），添加币种符号（¥/$/<function_calls>等）。
            - `formatTransactionsForExport`：从 `tx.accounts.currency` 获取币种，为金额添加符号，支持跨币种划转显示不同币种。
        - **后端 Actions** (`lib/bookkeeping/actions.ts`):
            - `importTransactionsFromXLS(file)`：Excel 文件导入，返回 `ImportResult`（包含 success、errors、report）。
            - `importTransactionsFromText(text)`：文本格式批量导入。
            - `exportData(params)`：数据导出，支持流水/快照、账户筛选、时间范围、CSV/XLSX 格式。
    - **前端组件** (`app/(modules)/bookkeeping/settings/components/`):
        - `ImportSection.tsx`：Tab 切换（文件导入/文本导入），文件上传，格式说明。
        - `ExportSection.tsx`：数据类型选择（流水/快照），多账户筛选，时间范围，格式选择。
        - `ImportPreview.tsx`：成功报告展示、疑似重复警告、错误列表（带详细建议）。
    - **核心特性**：
        - ✅ 全或无原则（有任何错误立即停止，避免部分导入）
        - ✅ 自动创建新标签（标签不存在时自动创建，使用 Map 去重避免重复）
        - ✅ 精确账户匹配（必须完全匹配，防止误操作）
        - ✅ 重复检测提醒（疑似重复交易列表）
        - ✅ 详细导入报告（统计、分布、新标签）

- **Bug 修复（第一轮）**：
    - **问题 1：导出账户列为空**
        - 原因：代码从 `tx.account_name` 获取，但数据实际在 `tx.accounts.name`
        - 修复：改为 `tx.accounts?.name || tx.account_name || ''`
    - **问题 2：划转记录未合并**
        - 原因：导出时没有识别和合并同一 `transfer_group_id` 的记录
        - 修复：按 `transfer_group_id` 分组，找出转出/转入记录合并为一条
    - **问题 3：标签重复错误**
        - 原因：使用 Set 对象去重失败（基于引用），且创建前未检查
        - 修复：改用 Map（以 name 为键），创建前查询并捕获唯一约束错误

- **Bug 修复（第二轮）**：
    - **问题 1：导入金额符号错误**
        - 原因：`createTransaction` 没有根据类型调整金额符号
        - 修复：在 `createTransaction` 中确保支出为负数，收入为正数：
          ```typescript
          let finalAmount = Math.abs(data.amount);
          if (data.type === 'expense') {
            finalAmount = -finalAmount;
          }
          ```
    - **问题 2：导出缺少币种符号**
        - 原因：导出时只显示数字，没有获取币种信息
        - 修复：添加 `CURRENCY_SYMBOLS` 映射和 `formatAmountWithCurrency` 函数，从 `tx.accounts.currency` 获取币种

- **自动快照功能验证**：
    - **已完整实现**（无需修改）：
        - 数据库字段：`auto_snapshot_enabled`, `snapshot_interval_days`, `snapshot_tolerance`
        - `autoSnapshotCheck()`：根据设置的间隔天数自动为账户创建快照
        - `runGlobalRefresh()`：执行周期任务 + 自动快照检查
        - `handleDailyCheckin()`：每日打卡触发全局刷新
        - 设置页面：可配置自动快照开关、间隔、容差阈值
        - 触发机制：每日打卡按钮 → 全局刷新 → 自动快照检查

- **设置页面保存按钮修复**：
    - **问题**：自动快照设置 section 缺少保存按钮，切换设置后只更新前端状态，未写入数据库
    - **修复**：为自动快照设置添加"保存设置"按钮，调用 `handleSettingsSave()`
    - **验证**：检查所有 section 的保存机制（金额显示规则、颜色配色、汇率、标签管理）均正常

- **关键技术提示**：
    - **导入验证**：使用 `Map` 而不是 `Set` 去重对象，创建前再次查询避免并发冲突
    - **划转合并**：按 `transfer_group_id` 分组，`amount < 0` 为转出，`amount > 0` 为转入
    - **币种处理**：从 `accounts.currency` 获取币种，使用 `CURRENCY_SYMBOLS` 映射添加符号
    - **金额符号**：数据库存储规则：支出为负数，收入为正数，`createTransaction` 强制转换
    - **全或无原则**：任何验证错误立即 `return { success: false, errors }`，不执行部分导入

---

- **预算管理模块 (Budget Management)**：
    - **数据库支持**：新增 `budget_plans`（预算计划主表）、`budget_period_records`（周期执行记录表）、`currency_rates`（汇率表）。
    - **后端 Actions**：
        - `getBudgetPlans` / `createBudgetPlan` 等 CRUD 操作。
        - `calculateCategorySpending` / `calculateTotalSpending`：支持多币种汇率换算、账户筛选、标签筛选的消费统计。
        - `calculateSoftLimit`：基于**自然时间前3个周期**的消费均值计算柔性约束参考线。
        - `updateBudgetPeriodRecord`：周期性更新预算执行状态。
    - **预算管理页面 (`/bookkeeping/budget`)**：
        - **双模式管理**：总支出预算（全局唯一，必开）与标签预算（按需创建）。
        - **原位编辑**：点击编辑按钮直接在列表卡片位置切换为表单，避免弹窗遮挡上下文。
        - **高级配置**：支持刚性约束（红线）、柔性约束（智能参考线）、监控账户范围、纳入统计标签等细粒度控制。
    - **仪表盘预算追踪 (`BudgetTracker`)**：
        - **可视化进度条**：三色进度条（绿/黄/红）展示消费状态，直观对比刚性/柔性约束线。
        - **12周期指示灯**：使用 ⭐(优秀)/🟢(达标)/🔴(超支) 记录过去12个周期的执行表现。
        - **智能状态**：实时计算剩余天数、超支比例及当前状态评价。

- **设置页面功能补全 (`/bookkeeping/settings`)**：
    - **汇率设置**：新增汇率管理模块，支持手动更新各币种汇率，用于跨币种预算计算。
    - **数据导出**：实现 CSV/XLS 格式的流水与快照数据导出。
    - **标签管理**：支持标签的创建、停用与删除。

- **UI/UX 细节优化**：
    - **表单体验**：统一了所有选择框 (`Select`) 与输入框 (`Input`) 的高度与样式。
    - **柔性约束开关**：优化开关组件样式，增加颜色反馈与过渡动画。
    - **说明文案**：明确了柔性约束的计算逻辑（自然时间前3周期均值）。

---

## 2025-11-29
- **仪表盘图表组件优化**：
    - **交易探索组件 (TransactionExplorer)**：
        - **Tooltip 修复**：将 HTML Tooltip 改为 SVG 内部渲染（`<rect>` + `<text>`），避免被 `overflow-hidden` 裁剪。
        - **布局修复**：统计网格从 2×2 改为 1×4 单行布局，减小各部分间距防止溢出。
        - **时间范围选择**：新增 7天/30天/90天/全部 四档时间范围选择器，默认 30 天。
    - **生活配方组件 (LifeRecipe)**：
        - **环形图悬停修复**：将 `strokeDasharray` 圆环改为 `<path>` 扇形绘制，使用 `handleMouseMove` 计算鼠标位置对应的扇形，只在环形区域内触发悬停。
        - **单一分类修复**：当只有一个交易分类（100%）时，使用两个半圆拼接成完整圆环，解决 SVG 弧形起点终点重合导致无法显示的问题。
        - **时间范围选择**：同样新增 7天/30天/90天/全部 四档时间范围选择器，默认 30 天。
        - **悬停效果优化**：激活的扇形会稍微放大并增加亮度，下方标签同步高亮。

- **全局颜色主题系统**：
    - **`useBookkeepingColors` Hook** (`lib/bookkeeping/useColors.ts`)：
        - 提供统一的颜色获取接口，从 `bookkeeping_settings` 表读取配置。
        - 返回 `{ expense, income, transfer }` 三种颜色值。
        - 内置默认颜色作为 fallback。
    - **已适配组件**：
        - 流水页面：总收入/支出统计、每日收入/支出统计、交易图标和金额。
        - 周期交易页面：任务图标和金额显示。
        - 仪表盘：所有图表组件（Heatmap、TransactionExplorer、LifeRecipe）。
        - `TransactionItem` 组件：接收 `colors` prop 应用全局配色。

---

## 2025-11-28
- **每日打卡与周期性交易执行**：
    - **打卡表 (`daily_checkins`)**：记录每日打卡日期和时间，每天只能有一条记录。
    - **周期任务表扩展**：`periodic_tasks` 新增 `type`、`to_account_id`、`to_amount` 字段，支持划转类型。
    - **后端函数**：
        - `getTodayCheckin()`：获取今日是否已打卡。
        - `recordCheckin()`：记录打卡。
        - `calculateNextRunDate()`：根据周期计算下一次执行日期（支持 daily/weekly/biweekly/monthly/quarterly/yearly/custom_N）。
        - `executePeriodicTasks()`：核心执行逻辑，循环补偿多期未打卡的任务。
        - `runGlobalRefresh()`：全局刷新入口（周期交易 + 自动快照预留）。
        - `handleDailyCheckin()`：每日打卡入口。
    - **仪表盘打卡按钮**：
        - 未打卡：显示"每日打卡"（实心按钮），点击执行打卡 + 全局刷新。
        - 已打卡：显示"全局刷新"（描边按钮），点击仅执行全局刷新。
        - 执行后显示结果提示（执行了 N 笔周期交易）。
    - **周期交易执行逻辑**：
        - 检查所有 `is_active = true` 且 `next_run_date <= today` 的任务。
        - 循环执行直到 `next_run_date > today`（补偿多期）。
        - 划转类型创建两笔关联流水（转出 + 转入）。
        - 周期任务的 `description` 直接作为流水备注。

- **页面布局与标题风格统一**：
    - **Layout 统一控制**：
        - 根容器：`flex h-[calc(100vh-3.5rem)]`
        - 内容区域：`flex-1 overflow-y-auto p-6`（统一 24px padding）
    - **页面根容器规范**：
        - 普通页面：`space-y-6`，不再设置 padding
        - 特殊页面（流水）：使用 `-m-6` 抵消 layout padding，顶部使用 `pt-6` 保持一致
    - **标题区域规范**：
        - 外层容器：`flex items-center justify-between`
        - 标题容器：`space-y-1`（统一间距）
        - 英文：`text-xs font-semibold text-gray-500 uppercase tracking-widest`
        - 中文标题：`text-2xl font-bold tracking-tight`
        - 说明文字：`text-sm text-gray-500`
    - 已统一的页面：仪表盘、流水明细、账户管理、周期交易、查账中心、设置
    - 流水页面统计指标样式简化：移除背景框，仅保留颜色区分

- **周期性交易模块 (Periodic Tasks)**：
    - **数据库字段**：使用 `is_active` 字段（默认 `TRUE`）控制任务启用状态，`FALSE` 表示暂停。
    - **后端 Actions**：在 `lib/bookkeeping/actions.ts` 中新增完整 CRUD 操作：
        - `getPeriodicTasks`：获取任务列表（含账户信息联查）。
        - `createPeriodicTask`：创建新任务。
        - `updatePeriodicTask`：更新任务信息。
        - `deletePeriodicTask`：删除任务。
        - `togglePeriodicTaskActive`：切换启用/暂停状态。
    - **侧边栏入口**：在记账模块侧边栏新增"周期交易"入口（`CalendarClock` 图标）。
    - **周期交易页面 (`/bookkeeping/periodic`)**：
        - **交易类型**：支持支出、收入、划转三种类型（划转可用于周期性充值等场景）。
        - **周期设计**：
            - 预设周期：每天、每周、每两周、每月（自然月）、每季度、每年
            - 自定义天数：支持任意 1-365 天的自定义周期
            - 自然月逻辑：1月31日 → 2月28/29日 → 3月31日（与主流订阅服务一致）
        - **首次执行日期**：用户设置首次执行日期，系统自动计算下一次执行时间。
        - **按钮布局优化**：点击"新建任务"后，按钮变为"取消"和"完成"并排显示在标题栏。
        - **任务列表**：简洁无边框风格，悬停显示操作按钮。
        - **行内编辑**：点击编辑按钮后直接在列表行内展开编辑表单。
        - **暂停/恢复**：一键切换任务状态，暂停任务显示"已暂停"标签并降低透明度。
        - **统计摘要**：底部显示任务总数、启用数及月预计支出。

- **侧边栏 Tooltip 修复（使用 React Portal）**：
    - 修复侧边栏 tooltip 被页面内容遮挡的问题。
    - **根本原因**：CSS z-index 只在同一层叠上下文内生效。tooltip 的 `z-30` 相对于侧边栏内部，无法穿透到内容区域之上。
    - **最终方案**：使用 `createPortal` 将 tooltip 渲染到 `document.body`，完全脱离 DOM 层级限制。
    - **实现细节**：
        - 将 `<Link>` 抽取为 `SidebarLink` 子组件，管理独立的 hover 状态
        - 使用 `useRef` 获取链接元素位置，计算 tooltip 的 `top/left`
        - Portal 渲染的 tooltip 使用 `z-[9999]` 确保始终在最上层
    - **架构说明**：侧边栏是独立组件 `components/Sidebar.tsx`，在 `layout.tsx` 中统一调用，所有页面共用。

- **UI/UX 细节优化与修复**：
    - **流水列表布局 (`TransactionsPage`)**：
        - **视觉统一**：移除收入图标的绿色背景圈，统一收/支/转三种类型的图标风格（仅保留颜色区分）。
        - **对齐校准**：调整 Grid 列宽比例，确保标签、备注、时间、账户、金额各列严格垂直对齐。
        - **金额格式化**：统一所有交易类型（含划转）的金额显示格式为 `符号 + 币种 + 金额` (e.g. `¥100.00 ➔ $15.00`)。
    - **备注栏高级交互**：
        - **智能截断**：实施严格的 10 字符限制，超出部分显示浅色省略号，并强制不换行。
        - **悬停浮窗**：引入 `React Portal` 实现悬停浮窗，将完整备注渲染至 `body` 层级，解决在滚动容器中被裁剪的问题。
    - **划转逻辑修复**：
        - 修复了添加划转时目标账户显示错误的 Bug（防止自转）。
        - 记账弹窗中划转类型现在也强制要求选择标签（Category），不再默认为“内部划转”。

- **标签 & 全局配色系统实装**：
    - **核心改造**：移除代码中所有写死的标签常量（如“餐饮”、“工资”等），全面对接数据库 `bookkeeping_tags` 表。
    - **记账弹窗 (`TransactionModal`)**：动态拉取数据库中的启用标签，根据交易类型（支出/收入/划转）实时筛选展示。
    - **流水列表 (`TransactionsPage`)**：
        - 筛选器不再使用预设列表，而是基于“当前页面已有流水的标签”与“数据库启用标签”的并集生成筛选选项。
        - 确保历史数据中的废弃标签依然可以被筛选和正常显示。
    - **图表组件适配**：
        - `LifeRecipe` (甜甜圈图)、`Heatmap` (热力图)、`TransactionExplorer` (趋势图) 均已接入 `bookkeeping_settings` 中的全局配色配置。
        - 移除了图表中对具体分类颜色的硬编码，统一使用“支出/收入/划转”三大类主色，并利用透明度/色阶区分细节。
    - **数据一致性**：更新了 `constants.ts`，标记旧的常量为废弃，确保新逻辑不再依赖它们。

## 2025-11-21
- **流水筛选体验优化 (v2)**：
    - **交互样式升级**：自定义 `FilterChip` 按钮，增加圆角、阴影与 hover 动效，统一应用于交易类型、金额、时间与账户等筛选项。
    - **时间&金额预设**：新增“全部”时间选项，同时保留四个快捷区间；金额与时间继续与交易类型同排展示，减少折行。
    - **标签筛选重构**：改为分组网格展示（支出/收入/划转），直接点击即可多选，并实时显示已选标签摘要。
    - **快捷操作**：新增“清空筛选”按钮，一键还原所有条件。
    - **后端过滤完善**：`getTransactions` 新增最小/最大金额过滤逻辑，按绝对值区间查询正负金额，确保金额筛选真正生效。

- **流水筛选体验优化 (v3)**：
    - **统一按钮组件**：引入新的 `TimeRangeSelector` 分段按钮，承载交易类型、金额、时间、账户及标签筛选，按钮视觉与动效统一。
    - **操作栏布局**：`清空筛选` 与 `筛选` 并排放置在标题栏右侧，保持一致的描边样式，筛选展开时自动高亮。
    - **标签行重写**：支出/收入/划转三类标签各占一行，左侧标签标题与右侧选项保持同一水平方向，支持横向滚动且默认不换行。
    - **业务逻辑调整**：将筛选状态集中映射到新组件，完善账户/标签多选与“全部”选项的清空逻辑，体验与后端过滤保持一致。
    - **宽度 & 视觉修复**：去掉“近半年”选项并压缩筛选结构，避免打开筛选时页面横向拉伸；修正分段按钮的选中背景样式，确保文字与底色同步高亮。
    - **滚动边界**：去除顶部模糊 `sticky` 区块，让滚动仅发生在流水列表容器内部，表头不再遮挡筛选区。

- **流水页面 (Transactions) 重构**：
    - **筛选区域布局优化**：
        - 将“金额范围”和“时间范围”移动到与“交易类型”同一行，节省纵向空间。
        - 移除了时间范围的自定义日期选择器，仅保留“近3天”、“近一周”、“近一月”、“近半年”四个快捷选项。
        - 将“标签筛选”改为下拉菜单 (Dropdown Menu) 形式，支持多选，并独占一行以容纳更多内容。
    - **组件库应用**：引入 `DropdownMenu` 组件处理标签筛选。

- **记账模块仪表盘优化**：
    - **图表重构**：移除 `recharts` 依赖，将所有图表组件替换为原生 SVG/CSS 实现，提高性能并确保存粹的视觉控制。
    - **Heatmap 组件**：
        - 重写逻辑以完全复刻 GitHub 贡献图风格。
        - 年度视图：改为以周为列（约53列），以日为行（7行）的布局，确保正确显示过去一年的数据。
        - 月度视图：保持标准日历网格布局。
        - 优化颜色层级，收入使用绿色系，支出使用红色系。
    - **TransactionExplorer 组件**：
        - 使用 SVG `<polyline>` 实现折线图。
        - 实现自定义坐标轴计算和交互（Hover 显示数值）。
    - **LifeRecipe 组件**：
        - 使用 SVG `<circle>` 和 `stroke-dasharray` 实现甜甜圈图（Donut Chart）。
        - 优化图例交互和中心文字显示。

## 2025-11-19
- **项目初始化**：
    - 阅读并分析项目规划文档 `1.txt`。
    - 建立项目文档 `README.md`。
    - 确认核心架构：Next.js App Router + 嵌套布局 + Supabase。
    - 确认设计理念：逻辑内聚于前端，模块化设计。

## 2025-11-20
- **架构搭建**：
    - 初始化 Next.js 项目 (TypeScript, Tailwind)。
    - 实现 TopNavBar 和 Sidebar 布局。
    - 搭建 Supabase 数据库 Schema (4张核心表：accounts, transactions, snapshots, periodic_tasks)。
    - 定义 TypeScript 类型 (`types/database.ts`) 和常量 (`lib/constants.ts`)。
- **开发规划调整**：
    - **数据模型优化**：放弃 JSON 字段，改为平铺字段（如信用卡信息）。
    - **开发模式**：采用“前端优先”策略。先完成所有 UI 组件和页面的交互（使用 Mock 数据），确认样式和体验无误后，再接入后端逻辑。
- **记账模块 UI 开发计划**：
    1.  **组件开发**：
        - `TransactionModal`: 记账弹窗 (核心交互)。
        - `AccountCard`: 账户卡片 (展示余额)。
        - `SnapshotDialog`: 余额校准弹窗。
    2.  **页面组装**：
        - `accounts/page.tsx`: 账户列表。
        - `transactions/page.tsx`: 流水列表 + 筛选。
        - `dashboard/page.tsx`: 概览 + 入口。

## 2025-11-24
- **查账提醒与一键查账**：
    - 新增 `reconciliation_issues` 表（schema + TS 类型），专门记录任意两个快照之间的差额异常，并为后续处理提供状态字段。
    - 在 `lib/bookkeeping/actions.ts` 中实现 `runReconciliationCheck`、`getReconciliationIssues`、`resolveReconciliationIssue` 以及 `getAccountsMeta`，复用统一逻辑生成/查询提醒。
    - `SnapshotDialog` 的“校正余额”流程在检测到差额时自动触发查账逻辑，确保手动校正与一键查账共用同一套提醒机制。
    - `bookkeeping/settings` 页面重写为客户端组件，提供“一键查账”弹窗（可选择账户+时间范围）、提醒列表渲染、手动刷新与“标记已处理”操作。
- **查账逻辑强化 (v2)**：
    - `runReconciliationCheck` 现会在每次执行前清空对应账户的全部提醒并重新扫描完整快照区间，避免重复/冲突的警告。
    - 新增 `getSnapshotsByIds` 与 `regenerateIssuesForAccounts`，支持 UI 批量拉取快照详情以及补流水后的全量重算。
    - 设置页提醒卡片改为展示起/终点快照详情（余额、录入时间、来源），并以“流水总和 / 后一次-前一次 / 差额”三段式输出差异。
    - “去查账”动作升级为“补流水”流程：在提醒卡片内直接唤起 `TransactionModal`，流水记账成功后自动对相关账户（含划转双侧）重跑查账检查。
- **即将开展的记账模块迭代**：
    - **路由调整**：侧边栏新增“查账”独立入口（迁移现有查账页面）以及“周期性交易”入口（管理月费/固定收入等任务）。
    - **周期性交易页**：展示 `periodic_tasks` 列表，支持新建/编辑/暂停/手动执行，后续与 `runPeriodicChecks` 联动。
    - **设置模块**（记账局部配置）：
        1. 金额显示规则（千分位、保留小数、默认币种）。
        2. 自动快照开关、周期（天数）、容差阈值。
        3. 数据导入/导出（CSV/XLS），直接在前端生成或解析文件。
    - **数据库新增**：
        - `bookkeeping_settings`、`bookkeeping_tags`、`transaction_tag_links`、`bookkeeping_available_tags` 视图。
    - **类型同步**：`types/database.ts` 已加入上述表定义，后续代码改造可直接使用类型提示。

---

## 关键技术提醒

### Supabase 类型定义规范
- `types/database.ts` 中的 `Database` 接口必须包含完整结构：
  ```typescript
  Tables: { [tableName]: { Row, Insert, Update, Relationships: [] } }
  Functions: Record<string, never>
  Enums: Record<string, never>
  ```
- 缺少 `Relationships`、`Functions`、`Enums` 会导致 Supabase 客户端类型推断失败，返回 `never` 类型。
- 如遇 `Property 'xxx' does not exist on type 'never'` 错误，优先检查类型定义完整性。

### SVG 图表绘制要点
- **完整圆环**：当弧形角度为 360° 时，起点终点重合导致路径无效。解决方案：使用两个 180° 半圆拼接。
- **悬停检测**：`strokeDasharray` 圆环的可点击区域仅为描边部分，建议改用 `<path>` 绘制扇形。
- **Tooltip 定位**：避免使用 `overflow-hidden` 容器内的绝对定位 Tooltip，改用 SVG 内部元素或 Portal。

### React Portal 使用场景
- 侧边栏 Tooltip、备注浮窗等需要突破父容器 z-index 限制的场景。
- 使用 `createPortal(element, document.body)` 渲染到 body 层级。
- 需要在客户端组件中使用，并检查 `typeof document !== 'undefined'`。

### 页面布局统一规范
- **Layout 层**：`flex-1 h-[calc(100vh-3.5rem)] overflow-y-auto p-6`
- **页面根容器**：`space-y-6`（不设置 padding）
- **标题区域**：`space-y-1` 内含英文/中文标题/说明文字
- **特殊页面（如流水）**：使用 `-m-6` 抵消 layout padding

---

## 待开发规划

### 高优先级
1. **自动快照功能** (`autoSnapshotCheck`)：
   - 在 `runGlobalRefresh` 中预留了接口，需实现定期自动记录账户余额快照。
   - 配置项：开关、周期（天数）、容差阈值（设置页面已有 UI 占位）。

2. **数据导入**：
   - 实现 CSV/XLS 格式的数据导入逻辑，支持批量导入流水和快照。

3. **周期交易手动执行**：
   - 周期交易列表增加"立即执行"按钮，手动触发一次交易。

### 中优先级
4. **金额显示规则设置**：
   - 千分位分隔符、小数位数、默认币种。
   - 设置页面 UI 已有占位，需实现逻辑。

5. **账户分组与排序**：
   - 账户页面支持自定义分组和拖拽排序。

6. **流水批量操作**：
   - 多选删除、批量修改标签。

### 低优先级
7. **日历模块开发**：
   - 日历页面 (`/calendar`) 已有路由占位。
   - 任务管理 (`/calendar/tasks`) 已有路由占位。

8. **移动端适配**：
   - 响应式布局优化。
   - 触摸交互适配。

9. **数据统计报表**：
   - 月度/年度收支报表。
   - 分类趋势分析。
