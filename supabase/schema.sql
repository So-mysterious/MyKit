-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Accounts Table (账户表)
-- 存储账户基础信息，不存储余额（余额通过计算获得）
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'Checking', 'Credit', 'Asset', 'Wallet'
    currency TEXT NOT NULL, -- 'CNY', 'HKD', 'USDT'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- 信用卡专属字段 (平铺)
    statement_date INTEGER, -- 账单日 (1-31)
    due_date INTEGER, -- 还款日 (1-31)
    credit_limit DECIMAL(20, 4) -- 信用额度
);

-- 2. Transactions Table (流水表)
-- 核心表：记录收入、支出、划转
-- 划转逻辑：一笔划转包含两条记录（一正一负），通过 transfer_group_id 关联
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'income', 'expense', 'transfer'
    amount DECIMAL(20, 4) NOT NULL, -- 支出为负，收入为正
    category TEXT NOT NULL, -- 硬编码分类字符串，如 '餐饮', '交通'
    description TEXT, -- 备注
    date TIMESTAMP WITH TIME ZONE NOT NULL, -- 交易发生时间
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- 跨币种/换汇扩展字段
    nominal_amount DECIMAL(20, 4), -- 名义金额 (e.g. 1000)
    nominal_currency TEXT, -- 名义币种 (e.g. 'HKD')
    
    -- 划转关联
    transfer_group_id UUID -- 同一笔划转的两条记录共享此ID
);

-- 3. Snapshots Table (时点价值表)
-- 余额计算基石：每月1号自动生成 + 用户手动校准
CREATE TABLE IF NOT EXISTS snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    balance DECIMAL(20, 4) NOT NULL, -- 该时刻的绝对余额
    date TIMESTAMP WITH TIME ZONE NOT NULL, -- 快照对应的实际时间
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    type TEXT DEFAULT 'Manual' -- 'Auto' (每月自动), 'Manual' (手动添加)
);

-- 4. Periodic Tasks Table (自动记账配置表)
-- 用于生成定期收支（如月费、工资、定期划转）
CREATE TABLE IF NOT EXISTS periodic_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'expense', -- 'income', 'expense', 'transfer'
    amount DECIMAL(20, 4) NOT NULL, -- 金额（正数）
    category TEXT NOT NULL,
    description TEXT,
    frequency TEXT NOT NULL DEFAULT 'monthly', -- daily, weekly, biweekly, monthly, quarterly, yearly, custom_N
    next_run_date DATE NOT NULL, -- 下一次执行日期
    is_active BOOLEAN NOT NULL DEFAULT TRUE, -- 是否启用（FALSE 表示暂停）
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- 划转专用字段
    to_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL, -- 划转目标账户
    to_amount DECIMAL(20, 4) -- 划转目标金额（跨币种时使用）
);

-- 5. Reconciliation Issues Table (查账提醒)
-- 用于记录任意两个快照之间流水不平的异常段
CREATE TABLE IF NOT EXISTS reconciliation_issues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    start_snapshot_id UUID REFERENCES snapshots(id),
    end_snapshot_id UUID REFERENCES snapshots(id),
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    expected_delta DECIMAL(20, 4) NOT NULL,
    actual_delta DECIMAL(20, 4) NOT NULL,
    diff DECIMAL(20, 4) NOT NULL,
    status TEXT NOT NULL DEFAULT 'open', -- open / resolved
    source TEXT NOT NULL DEFAULT 'manual', -- manual / snapshot
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reconciliation_unique_pair
    ON reconciliation_issues(account_id, start_snapshot_id, end_snapshot_id);

CREATE INDEX IF NOT EXISTS idx_reconciliation_status
    ON reconciliation_issues(status);

CREATE TABLE IF NOT EXISTS bookkeeping_settings (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE, -- 只保留一行，id 恒为 true
    thousand_separator BOOLEAN NOT NULL DEFAULT TRUE,
    decimal_places INTEGER NOT NULL DEFAULT 2,
    default_currency TEXT NOT NULL DEFAULT 'CNY',
    auto_snapshot_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    snapshot_interval_days INTEGER NOT NULL DEFAULT 30,
    snapshot_tolerance DECIMAL(20, 4) NOT NULL DEFAULT 1.00,
    expense_color TEXT NOT NULL DEFAULT '#ef4444',
    income_color TEXT NOT NULL DEFAULT '#22c55e',
    transfer_color TEXT NOT NULL DEFAULT '#0ea5e9',
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. Tags
CREATE TABLE IF NOT EXISTS bookkeeping_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kind TEXT NOT NULL CHECK (kind IN ('expense', 'income', 'transfer')),
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_kind_name
    ON bookkeeping_tags(kind, name);

-- 8. Transaction ↔ Tag Links
CREATE TABLE IF NOT EXISTS transaction_tag_links (
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES bookkeeping_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (transaction_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_tag_links_tag
    ON transaction_tag_links(tag_id);

-- 9. Available Tags View
CREATE OR REPLACE VIEW bookkeeping_available_tags AS
SELECT
    t.id,
    t.kind,
    t.name,
    t.is_active,
    FALSE AS from_settings
FROM bookkeeping_tags t;

-- 10. Daily Check-ins Table (每日打卡表)
-- 记录用户每日打卡，用于触发全局刷新
CREATE TABLE IF NOT EXISTS daily_checkins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    check_date DATE NOT NULL UNIQUE, -- 打卡日期（每天只能有一条）
    checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()) -- 打卡时间
);

CREATE INDEX IF NOT EXISTS idx_checkins_date ON daily_checkins(check_date);

-- 11. Budget Plans Table (预算计划表)
-- 存储标签预算和总支出预算
CREATE TABLE IF NOT EXISTS budget_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- 计划类型: 'category' (标签预算) / 'total' (总支出预算)
    plan_type TEXT NOT NULL CHECK (plan_type IN ('category', 'total')),
    
    -- 关联标签名称（category 类型必填，total 类型为 NULL）
    category_name TEXT,
    
    -- 周期: weekly / monthly
    period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('weekly', 'monthly')),
    
    -- 刚性约束金额
    hard_limit DECIMAL(20, 4) NOT NULL,
    -- 约束币种
    limit_currency TEXT NOT NULL DEFAULT 'CNY',
    
    -- 是否启用柔性约束（自动计算前3周期均值）
    soft_limit_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- 计划状态: active / expired / paused
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'paused')),
    
    -- 账户筛选模式: 'all' / 'include' / 'exclude'
    account_filter_mode TEXT NOT NULL DEFAULT 'all' CHECK (account_filter_mode IN ('all', 'include', 'exclude')),
    -- 账户ID列表（include 或 exclude 模式时使用）
    account_filter_ids UUID[],
    
    -- 计划时效（12个周期）
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    -- 总支出计划专用：纳入统计的标签列表
    included_categories TEXT[],
    
    -- 轮次（用于历史记录，每次再启动+1）
    round_number SMALLINT NOT NULL DEFAULT 1,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 确保只有一个 total 类型的计划
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_plans_total_unique 
    ON budget_plans(plan_type) WHERE plan_type = 'total' AND status != 'expired';

-- 确保每个标签只有一个活跃计划
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_plans_category_unique 
    ON budget_plans(category_name) WHERE plan_type = 'category' AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_budget_plans_status ON budget_plans(status);

-- 12. Budget Period Records Table (预算周期执行记录表)
-- 记录每个周期的执行情况，用于 12 个指示灯
CREATE TABLE IF NOT EXISTS budget_period_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID NOT NULL REFERENCES budget_plans(id) ON DELETE CASCADE,
    
    -- 轮次（与 plan 的 round_number 对应）
    round_number SMALLINT NOT NULL,
    
    -- 周期序号（1-12）
    period_index SMALLINT NOT NULL CHECK (period_index >= 1 AND period_index <= 12),
    
    -- 周期时间范围
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- 实际消费金额（换算到约束币种后）
    actual_amount DECIMAL(20, 4),
    
    -- 约束线快照（记录当时的设置，因为可能被修改）
    hard_limit DECIMAL(20, 4) NOT NULL,
    soft_limit DECIMAL(20, 4), -- 前3个周期为 NULL
    
    -- 指示灯状态: star / green / red / pending
    indicator_status TEXT NOT NULL DEFAULT 'pending' CHECK (indicator_status IN ('star', 'green', 'red', 'pending')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_budget_period_records_plan ON budget_period_records(plan_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_period_records_unique 
    ON budget_period_records(plan_id, round_number, period_index);

-- 13. Currency Rates Table (汇率表)
-- 用于跨币种预算计算
CREATE TABLE IF NOT EXISTS currency_rates (
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    rate DECIMAL(20, 8) NOT NULL, -- 1 from_currency = rate to_currency
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (from_currency, to_currency)
);

-- 预设常用汇率
INSERT INTO currency_rates (from_currency, to_currency, rate) VALUES
    ('HKD', 'CNY', 0.92),
    ('USD', 'CNY', 7.25),
    ('CNY', 'HKD', 1.09),
    ('CNY', 'USD', 0.14),
    ('HKD', 'USD', 0.13),
    ('USD', 'HKD', 7.78)
ON CONFLICT (from_currency, to_currency) DO UPDATE SET rate = EXCLUDED.rate;

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, date);
CREATE INDEX IF NOT EXISTS idx_snapshots_account_date ON snapshots(account_id, date);
CREATE INDEX IF NOT EXISTS idx_periodic_tasks_next_run ON periodic_tasks(next_run_date);
