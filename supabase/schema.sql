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
    credit_card_details JSONB -- Optional: { "statement_date": 1, "due_date": 20 }
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, date);
CREATE INDEX IF NOT EXISTS idx_snapshots_account_date ON snapshots(account_id, date);
CREATE INDEX IF NOT EXISTS idx_periodic_tasks_next_run ON periodic_tasks(next_run_date);

