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
-- 用于生成定期收支（如月费、工资）
CREATE TABLE IF NOT EXISTS periodic_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    amount DECIMAL(20, 4) NOT NULL, -- 正数为收入，负数为支出
    category TEXT NOT NULL,
    description TEXT,
    frequency TEXT NOT NULL DEFAULT 'monthly', -- 目前主要支持 monthly
    next_run_date DATE NOT NULL, -- 下一次执行日期
    is_active BOOLEAN NOT NULL DEFAULT TRUE, -- 是否启用（FALSE 表示暂停）
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
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

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, date);
CREATE INDEX IF NOT EXISTS idx_snapshots_account_date ON snapshots(account_id, date);
CREATE INDEX IF NOT EXISTS idx_periodic_tasks_next_run ON periodic_tasks(next_run_date);
