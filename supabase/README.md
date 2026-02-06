# MyKit 数据库文档

> 版本：2.1  
> 更新日期：2026-02-02  
> 核心理念：**校准优先**余额计算模式

## 概述

MyKit 采用**复式记账**体系，所有交易记录资金从一个账户流向另一个账户。账户分为**真实账户**（银行卡、信用卡等）和**虚账户**（费用/收入类别，前端展示为"标签"）。

**余额计算采用"校准优先"模式**：用户通过校准功能确认账户的真实余额，系统以校准值为锚点，通过正推/倒推流水影响计算任意日期的余额。

---

## 数据表清单

| 表名 | 类型 | 说明 |
|-----|------|------|
| accounts | 核心 | 统一账户表（含真实账户和虚账户/标签） |
| transactions | 核心 | 交易记录表（复式记账） |
| projects | 核心 | 项目管理（旅游、出差等） |
| calibrations | 核心 | **余额校准表（用户确认的真实余额锚点）** |
| periodic_tasks | 核心 | 周期性交易任务 |
| reconciliation_issues | 辅助 | 对账差异记录 |
| operation_logs | 辅助 | 操作日志（导入/导出/回滚） |
| daily_checkins | 辅助 | 每日打卡记录 |
| bookkeeping_settings | 配置 | 用户设置 |
| budget_plans | 预算 | 预算计划 |
| budget_period_records | 预算 | 预算执行记录 |
| currency_rates | 配置 | 汇率表 |
| statistics_cache | 缓存 | 统计数据缓存 |

---

## 表结构详解

### 1. accounts（账户表）

统一管理所有账户，包括真实账户和虚账户（标签）。

| 字段 | 类型 | 必填 | 说明 |
|-----|------|:---:|------|
| id | UUID | ✓ | 主键 |
| parent_id | UUID | | 父账户ID，用于层级结构 |
| name | TEXT | ✓ | 账户名称 |
| full_path | TEXT | | 完整路径，如 "资产:银行:招商银行"（自动生成） |
| account_class | TEXT | ✓ | 账户分类：`real`=真实账户，`nominal`=虚账户（标签） |
| type | TEXT | ✓ | 五大类型：`asset`/`liability`/`income`/`expense`/`equity` |
| subtype | TEXT | | 细分类型：`cash`/`checking`/`savings`/`investment`/`credit_card`/`loan` |
| is_group | BOOLEAN | ✓ | 是否为分组（分组不能直接记账） |
| is_system | BOOLEAN | ✓ | 是否为系统预设（不可删除） |
| is_active | BOOLEAN | ✓ | 是否启用 |
| currency | TEXT | | 币种（仅叶子账户的真实账户需要） |
| credit_limit | DECIMAL | | 信用额度（仅信用卡） |
| statement_day | INTEGER | | 账单日 1-31（仅信用卡） |
| due_day | INTEGER | | 还款日 1-31（仅信用卡） |
| sort_order | INTEGER | | 排序顺序 |
| created_at | TIMESTAMP | ✓ | 创建时间 |
| updated_at | TIMESTAMP | ✓ | 更新时间 |
| deactivated_at | TIMESTAMP | | 停用时间 |

**账户类型说明**

| type | account_class | 用途 | 示例 |
|------|--------------|------|------|
| asset | real | 资产账户 | 银行卡、现金、投资账户 |
| liability | real | 负债账户 | 信用卡、贷款 |
| income | nominal | 收入类别（标签） | 工资、投资收益 |
| expense | nominal | 费用类别（标签） | 餐饮、交通 |
| equity | nominal | 权益账户 | 期初余额 |

---

### 2. transactions（交易表）

复式记账核心，每笔交易记录资金从 from_account 流向 to_account。

| 字段 | 类型 | 必填 | 说明 |
|-----|------|:---:|------|
| id | UUID | ✓ | 主键 |
| date | TIMESTAMP | ✓ | 交易时间 |
| from_account_id | UUID | ✓ | 资金来源账户 |
| to_account_id | UUID | ✓ | 资金去向账户 |
| amount | DECIMAL | ✓ | 交易金额（始终正数） |
| from_amount | DECIMAL | | 来源账户扣除金额（跨币种时使用） |
| to_amount | DECIMAL | | 目标账户增加金额（跨币种时使用） |
| description | TEXT | | 备注 |
| linked_transaction_id | UUID | | 关联交易ID（代付回款等） |
| link_type | TEXT | | 关联类型：`reimbursement`/`refund`/`split`/`correction` |
| is_opening | BOOLEAN | ✓ | 是否为期初余额交易 |
| is_large_expense | BOOLEAN | ✓ | 是否大额支出（系统自动计算） |
| location | TEXT | | 发生地 |
| project_id | UUID | | 所属项目 |
| is_starred | BOOLEAN | ✓ | 重要标记 |
| needs_review | BOOLEAN | ✓ | 待核对标记 |
| nature | TEXT | ✓ | 性质：`regular`常规/`unexpected`意外/`periodic`周期 |
| created_at | TIMESTAMP | ✓ | 创建时间 |
| updated_at | TIMESTAMP | ✓ | 更新时间 |

**交易类型映射**

| 场景 | from_account | to_account |
|-----|--------------|------------|
| 支出 | 银行卡（asset） | 餐饮（expense） |
| 收入 | 工资（income） | 银行卡（asset） |
| 转账 | 银行卡A（asset） | 银行卡B（asset） |
| 还信用卡 | 银行卡（asset） | 信用卡（liability） |
| 信用卡消费 | 信用卡（liability） | 购物（expense） |
| 期初余额 | 期初余额（equity） | 银行卡（asset） |

---

### 3. projects（项目表）

用于将交易归类到特定项目。

| 字段 | 类型 | 必填 | 说明 |
|-----|------|:---:|------|
| id | UUID | ✓ | 主键 |
| name | TEXT | ✓ | 项目名称 |
| description | TEXT | | 项目描述 |
| start_date | DATE | | 开始日期 |
| end_date | DATE | | 结束日期 |
| is_active | BOOLEAN | ✓ | 是否活跃 |
| created_at | TIMESTAMP | ✓ | 创建时间 |
| updated_at | TIMESTAMP | ✓ | 更新时间 |

---

### 4. calibrations（校准表）

记录用户在某时刻确认的真实余额，作为余额计算的锚点。

> **核心理念**：校准值是用户确认的"绝对正确"余额。任意日期的余额 = 最近校准值 ± 期间流水影响。

| 字段 | 类型 | 必填 | 说明 |
|-----|------|:---:|------|
| id | UUID | ✓ | 主键 |
| account_id | UUID | ✓ | 账户ID |
| balance | DECIMAL | ✓ | 用户确认的实际余额 |
| date | TIMESTAMP | ✓ | 校准日期 |
| source | TEXT | ✓ | 来源：`manual`手动/`import`导入 |
| is_opening | BOOLEAN | ✓ | 是否为期初校准（账户创建时的首次校准） |
| note | TEXT | | 备注 |
| created_at | TIMESTAMP | ✓ | 创建时间 |

**余额计算规则**

| 场景 | 计算方法 |
|------|----------|
| 校准日在查询日之前 | 余额 = 校准值 + 期间流水影响（正推） |
| 校准日在查询日之后 | 余额 = 校准值 - 期间流水影响（倒推） |

---

### 5. periodic_tasks（周期任务表）

| 字段 | 类型 | 必填 | 说明 |
|-----|------|:---:|------|
| id | UUID | ✓ | 主键 |
| from_account_id | UUID | ✓ | 资金来源账户 |
| to_account_id | UUID | ✓ | 资金去向账户 |
| amount | DECIMAL | ✓ | 金额 |
| from_amount | DECIMAL | | 来源金额（跨币种） |
| to_amount | DECIMAL | | 目标金额（跨币种） |
| description | TEXT | | 描述 |
| frequency | TEXT | ✓ | 周期：`daily`/`weekly`/`biweekly`/`monthly`/`quarterly`/`yearly`/`custom_N` |
| next_run_date | DATE | ✓ | 下次执行日期 |
| is_active | BOOLEAN | ✓ | 是否启用 |
| created_at | TIMESTAMP | ✓ | 创建时间 |
| updated_at | TIMESTAMP | ✓ | 更新时间 |

---

### 6. reconciliation_issues（对账问题表）

| 字段 | 类型 | 必填 | 说明 |
|-----|------|:---:|------|
| id | UUID | ✓ | 主键 |
| account_id | UUID | ✓ | 账户ID |
| start_calibration_id | UUID | | 起始校准ID |
| end_calibration_id | UUID | | 结束校准ID |
| period_start | TIMESTAMP | ✓ | 期间开始 |
| period_end | TIMESTAMP | ✓ | 期间结束 |
| expected_delta | DECIMAL | ✓ | 预期变动（校准差值） |
| actual_delta | DECIMAL | ✓ | 实际变动（流水总和） |
| diff | DECIMAL | ✓ | 差异 |
| status | TEXT | ✓ | 状态：`open`/`resolved`/`ignored` |
| source | TEXT | ✓ | 来源：`manual`/`calibration`/`auto` |
| metadata | JSONB | | 附加信息 |
| created_at | TIMESTAMP | ✓ | 创建时间 |
| resolved_at | TIMESTAMP | | 解决时间 |

---

### 7. operation_logs（操作日志表）

| 字段 | 类型 | 必填 | 说明 |
|-----|------|:---:|------|
| id | UUID | ✓ | 主键 |
| type | TEXT | ✓ | 操作类型：`import`/`export`/`rollback` |
| status | TEXT | ✓ | 状态：`completed`/`failed`/`rolled_back` |
| filename | TEXT | | 文件名 |
| total_rows | INT | | 总行数 |
| rows_valid_uploaded | JSONB | | 有效且已上传的行 |
| rows_valid_skipped | JSONB | | 有效但跳过的行 |
| rows_duplicate_uploaded | JSONB | | 重复且已上传的行 |
| rows_duplicate_skipped | JSONB | | 重复且跳过的行 |
| rows_error | JSONB | | 错误行 |
| is_rolled_back | BOOLEAN | | 是否已回滚 |
| rolled_back_at | TIMESTAMP | | 回滚时间 |
| transaction_ids | UUID[] | | 创建的交易ID列表 |
| export_config | JSONB | | 导出配置 |
| target_log_id | UUID | | 关联的日志ID（回滚时指向原导入日志） |
| created_at | TIMESTAMP | ✓ | 创建时间 |

---

### 8. daily_checkins（每日打卡表）

| 字段 | 类型 | 必填 | 说明 |
|-----|------|:---:|------|
| id | UUID | ✓ | 主键 |
| check_date | DATE | ✓ | 打卡日期（唯一） |
| checked_at | TIMESTAMP | ✓ | 打卡时间 |

---

### 9. bookkeeping_settings（记账设置表）

单行配置表。

| 字段 | 类型 | 必填 | 说明 |
|-----|------|:---:|------|
| id | BOOLEAN | ✓ | 主键（恒为 true） |
| thousand_separator | BOOLEAN | ✓ | 是否显示千分位 |
| decimal_places | INTEGER | ✓ | 小数位数 |
| default_currency | TEXT | ✓ | 默认币种 |
| calibration_reminder_enabled | BOOLEAN | ✓ | 是否启用强制校准提醒 |
| calibration_interval_days | INTEGER | ✓ | 校准间隔天数 |
| expense_color | TEXT | ✓ | 支出颜色 |
| income_color | TEXT | ✓ | 收入颜色 |
| transfer_color | TEXT | ✓ | 转账颜色 |
| updated_at | TIMESTAMP | ✓ | 更新时间 |

---

### 10. budget_plans（预算计划表）

| 字段 | 类型 | 必填 | 说明 |
|-----|------|:---:|------|
| id | UUID | ✓ | 主键 |
| plan_type | TEXT | ✓ | 类型：`category`标签预算/`total`总支出预算 |
| category_account_id | UUID | | 费用账户ID，即标签（category类型时） |
| period | TEXT | ✓ | 周期：`weekly`/`monthly` |
| hard_limit | DECIMAL | ✓ | 刚性约束金额 |
| limit_currency | TEXT | ✓ | 约束币种 |
| soft_limit_enabled | BOOLEAN | ✓ | 是否启用柔性约束 |
| status | TEXT | ✓ | 状态：`active`/`expired`/`paused` |
| account_filter_mode | TEXT | ✓ | 账户筛选模式：`all`/`include`/`exclude` |
| account_filter_ids | UUID[] | | 筛选的账户ID列表 |
| start_date | DATE | ✓ | 开始日期 |
| end_date | DATE | ✓ | 结束日期 |
| included_category_ids | UUID[] | | 纳入统计的费用账户ID列表（total类型时） |
| round_number | SMALLINT | ✓ | 轮次 |
| created_at | TIMESTAMP | | 创建时间 |
| updated_at | TIMESTAMP | | 更新时间 |

---

### 11. budget_period_records（预算周期记录表）

| 字段 | 类型 | 必填 | 说明 |
|-----|------|:---:|------|
| id | UUID | ✓ | 主键 |
| plan_id | UUID | ✓ | 预算计划ID |
| round_number | SMALLINT | ✓ | 轮次 |
| period_index | SMALLINT | ✓ | 周期序号（1-12） |
| period_start | DATE | ✓ | 周期开始 |
| period_end | DATE | ✓ | 周期结束 |
| actual_amount | DECIMAL | | 实际消费 |
| hard_limit | DECIMAL | ✓ | 当时的刚性约束 |
| soft_limit | DECIMAL | | 当时的柔性约束 |
| indicator_status | TEXT | ✓ | 状态：`star`⭐/`green`🟢/`red`🔴/`pending`⏳ |
| created_at | TIMESTAMP | | 创建时间 |

---

### 12. currency_rates（汇率表）

| 字段 | 类型 | 必填 | 说明 |
|-----|------|:---:|------|
| from_currency | TEXT | ✓ | 源币种（联合主键） |
| to_currency | TEXT | ✓ | 目标币种（联合主键） |
| rate | DECIMAL | ✓ | 汇率（1 from = rate to） |
| updated_at | TIMESTAMP | | 更新时间 |

---

### 13. statistics_cache（统计缓存表）

| 字段 | 类型 | 必填 | 说明 |
|-----|------|:---:|------|
| id | TEXT | ✓ | 缓存键 |
| data | JSONB | ✓ | 缓存数据 |
| account_id | UUID | | 账户ID（账户级别缓存） |
| period_start | DATE | | 统计周期开始 |
| period_end | DATE | | 统计周期结束 |
| computed_at | TIMESTAMP | ✓ | 计算时间 |
| valid_until | TIMESTAMP | | 失效时间 |
| cache_type | TEXT | ✓ | 缓存类型 |

---

## 视图

| 视图名 | 说明 |
|-------|------|
| tags_view | 将虚账户以"标签"形式呈现，兼容前端逻辑 |
| real_accounts_view | 真实账户列表（可记账的账户） |
| account_balances_view | 账户余额（基于复式记账计算） |

---

## 触发器

| 触发器 | 表 | 说明 |
|-------|-----|------|
| tr_*_updated_at | 多表 | 自动更新 updated_at 字段 |
| tr_accounts_full_path | accounts | 自动维护账户完整路径 |
| tr_transactions_cache_invalidate | transactions | 交易变更时失效相关缓存 |

---

## 系统预设账户

| ID | 名称 | 类型 | 说明 |
|----|-----|------|------|
| 00000000-...-000001 | 资产 | asset | 顶层分组 |
| 00000000-...-000002 | 负债 | liability | 顶层分组 |
| 00000000-...-000003 | 收入 | income | 顶层分组 |
| 00000000-...-000004 | 费用 | expense | 顶层分组 |
| 00000000-...-000005 | 权益 | equity | 顶层分组 |
| 00000000-...-000006 | 期初余额 | equity | 期初交易对手方 |
