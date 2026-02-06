-- ============================================================================
-- MyKit 数据库结构定义
-- 版本: 2.1
-- 日期: 2026-02-02
-- 说明: 完整复式记账体系，采用"校准优先"余额计算模式
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 第一部分：核心业务表
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1 账户表 (accounts)
-- 统一管理真实账户（银行卡、信用卡）和虚账户（费用、收入类别）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 层级关系
    parent_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
    
    -- 基本信息
    name TEXT NOT NULL,
    full_path TEXT,  -- 缓存完整路径，如 "资产:银行账户:招商银行"
    
    -- 账户分类
    account_class TEXT NOT NULL CHECK (account_class IN ('real', 'nominal')),
    -- real: 真实账户（银行卡、信用卡、现金等）
    -- nominal: 虚账户（费用类别、收入类别，前端展示为"标签"）
    
    type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'income', 'expense', 'equity')),
    -- asset: 资产（银行卡、现金、投资）
    -- liability: 负债（信用卡、贷款）
    -- income: 收入（工资、投资收益等）
    -- expense: 费用（餐饮、交通等）
    -- equity: 权益（期初余额等系统账户）
    
    subtype TEXT,  -- 细分类型
    -- asset: 'cash', 'checking', 'savings', 'investment', 'receivable'
    -- liability: 'credit_card', 'loan', 'payable'
    -- income/expense: NULL（由名称区分）
    
    -- 账户属性
    is_group BOOLEAN NOT NULL DEFAULT FALSE,  -- 是否为分组（分组不能直接记账）
    is_system BOOLEAN NOT NULL DEFAULT FALSE, -- 系统预设（不可删除）
    is_active BOOLEAN NOT NULL DEFAULT TRUE,  -- 是否启用
    
    -- 币种（仅叶子账户，即 is_group=false 的 real 账户需要）
    currency TEXT,
    
    -- 信用卡专属字段
    credit_limit DECIMAL(20, 4),
    statement_day INTEGER CHECK (statement_day >= 1 AND statement_day <= 31),
    due_day INTEGER CHECK (due_day >= 1 AND due_day <= 31),
    
    -- 时间戳
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deactivated_at TIMESTAMP WITH TIME ZONE,
    
    -- 排序字段
    sort_order INTEGER DEFAULT 0,
    
    -- 统计缓存字段 (自动更新)
    transaction_count INTEGER DEFAULT 0,
    first_transaction_date TIMESTAMP WITH TIME ZONE,
    last_transaction_date TIMESTAMP WITH TIME ZONE,
    top_counterparties JSONB DEFAULT '[]'::JSONB,
    stats_updated_at TIMESTAMP WITH TIME ZONE,
    
    -- 约束
    CONSTRAINT chk_nominal_no_currency CHECK (account_class = 'real' OR currency IS NULL),
    CONSTRAINT chk_group_no_currency CHECK (is_group = false OR currency IS NULL)
);

-- 账户表索引
CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
CREATE INDEX IF NOT EXISTS idx_accounts_class ON accounts(account_class);
CREATE INDEX IF NOT EXISTS idx_accounts_active ON accounts(is_active) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_path ON accounts(full_path) WHERE full_path IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 1.2 项目表 (projects)
-- 用于将交易归类到特定项目（旅游、出差、装修等）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(is_active) WHERE is_active = true;

-- ----------------------------------------------------------------------------
-- 1.3 交易表 (transactions)
-- 复式记账核心：每笔交易记录资金从一个账户流向另一个账户
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 交易时间
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- 复式记账核心：资金流向
    from_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    to_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    
    -- 金额（期初余额可为负数，其他交易为正数，由应用层验证）
    amount DECIMAL(20, 4) NOT NULL CHECK (amount != 0),
    
    -- 跨币种支持（当 from 和 to 账户币种不同时使用）
    from_amount DECIMAL(20, 4),  -- from 账户的实际扣除金额
    to_amount DECIMAL(20, 4),    -- to 账户的实际增加金额
    
    -- 描述/备注
    description TEXT,
    
    -- 交易关联（用于代付回款、退款等场景）
    linked_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    link_type TEXT CHECK (link_type IN ('reimbursement', 'refund', 'split', 'correction')),
    -- reimbursement: 代付回款
    -- refund: 退款
    -- split: 分摊
    -- correction: 调账/更正
    
    -- 期初交易标记
    is_opening BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- 附加属性字段
    is_large_expense BOOLEAN NOT NULL DEFAULT FALSE,  -- 大额支出（系统自动计算）
    location TEXT,                                     -- 发生地
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,  -- 所属项目
    is_starred BOOLEAN NOT NULL DEFAULT FALSE,         -- 重要标记
    needs_review BOOLEAN NOT NULL DEFAULT FALSE,       -- 待核对标记
    nature TEXT NOT NULL DEFAULT 'regular' CHECK (nature IN ('regular', 'unexpected', 'periodic')),
    -- regular: 常规交易
    -- unexpected: 意外/非计划
    -- periodic: 周期性交易（由周期任务生成）
    
    -- 时间戳
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- 约束
    CONSTRAINT chk_different_accounts CHECK (from_account_id != to_account_id)
);

-- 交易表索引
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_project ON transactions(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_location ON transactions(location) WHERE location IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_linked ON transactions(linked_transaction_id) WHERE linked_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_opening ON transactions(is_opening) WHERE is_opening = true;
CREATE INDEX IF NOT EXISTS idx_transactions_starred ON transactions(is_starred) WHERE is_starred = true;
CREATE INDEX IF NOT EXISTS idx_transactions_review ON transactions(needs_review) WHERE needs_review = true;

-- ----------------------------------------------------------------------------
-- 1.4 校准表 (calibrations)
-- 用途：记录用户确认的真实余额，作为余额计算的锚点
-- 说明：
--   - 每次校准记录用户在特定日期确认的账户实际余额
--   - 余额计算时，从最近的校准点正推/倒推得出任意日期的余额
--   - 查账逻辑比对相邻两次校准差值与期间流水和
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calibrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    balance DECIMAL(20, 4) NOT NULL,  -- 用户确认的实际余额
    date TIMESTAMP WITH TIME ZONE NOT NULL,  -- 校准日期
    
    -- 校准来源
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import')),
    -- manual: 用户手动校准
    -- import: 数据导入时创建
    
    -- 是否为期初校准（账户创建时的首次校准）
    is_opening BOOLEAN NOT NULL DEFAULT FALSE,
    
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calibrations_account_date ON calibrations(account_id, date DESC);

-- ----------------------------------------------------------------------------
-- 1.5 周期任务表 (periodic_tasks)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS periodic_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 复式记账：资金流向
    from_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    to_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    
    -- 金额
    amount DECIMAL(20, 4) NOT NULL CHECK (amount > 0),
    
    -- 跨币种支持
    from_amount DECIMAL(20, 4),
    to_amount DECIMAL(20, 4),
    
    -- 描述
    description TEXT,
    
    -- 周期设置
    frequency TEXT NOT NULL DEFAULT 'monthly',
    next_run_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- 附加属性（对标 transactions 表）
    location TEXT,                                     -- 发生地
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,  -- 所属项目
    is_starred BOOLEAN NOT NULL DEFAULT FALSE,         -- 重要标记
    needs_review BOOLEAN NOT NULL DEFAULT FALSE,       -- 待核对标记
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- 约束
    CONSTRAINT chk_periodic_different_accounts CHECK (from_account_id != to_account_id)
);

CREATE INDEX IF NOT EXISTS idx_periodic_tasks_next_run ON periodic_tasks(next_run_date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_periodic_tasks_project ON periodic_tasks(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_periodic_tasks_starred ON periodic_tasks(is_starred) WHERE is_starred = true;

-- ----------------------------------------------------------------------------
-- 1.6 对账问题表 (reconciliation_issues)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reconciliation_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    start_calibration_id UUID REFERENCES calibrations(id) ON DELETE SET NULL,
    end_calibration_id UUID REFERENCES calibrations(id) ON DELETE SET NULL,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    expected_delta DECIMAL(20, 4) NOT NULL,  -- 校准差值 (end - start)
    actual_delta DECIMAL(20, 4) NOT NULL,    -- 流水和
    diff DECIMAL(20, 4) NOT NULL,            -- 差异 (actual - expected)
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'calibration', 'auto')),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_account ON reconciliation_issues(account_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_status ON reconciliation_issues(status);

-- ============================================================================
-- 第二部分：缓存和配置表
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2.1 统计缓存表 (statistics_cache)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS statistics_cache (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    period_start DATE,
    period_end DATE,
    computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE,
    cache_type TEXT NOT NULL DEFAULT 'general'
);

CREATE INDEX IF NOT EXISTS idx_stats_cache_account ON statistics_cache(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stats_cache_type ON statistics_cache(cache_type);
CREATE INDEX IF NOT EXISTS idx_stats_cache_valid ON statistics_cache(valid_until) WHERE valid_until IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2.2 记账设置表 (bookkeeping_settings)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookkeeping_settings (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE,
    thousand_separator BOOLEAN NOT NULL DEFAULT TRUE,
    decimal_places INTEGER NOT NULL DEFAULT 2,
    default_currency TEXT NOT NULL DEFAULT 'CNY',
    
    -- 强制校准设置
    calibration_reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,  -- 是否启用强制校准提醒
    calibration_interval_days INTEGER NOT NULL DEFAULT 30,       -- 校准间隔天数
    
    -- 颜色配置
    expense_color TEXT NOT NULL DEFAULT '#ef4444',
    income_color TEXT NOT NULL DEFAULT '#22c55e',
    transfer_color TEXT NOT NULL DEFAULT '#0ea5e9',
    
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2.3 汇率表 (currency_rates)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS currency_rates (
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    rate DECIMAL(20, 8) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
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

-- ============================================================================
-- 第三部分：辅助功能表
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 操作日志表 (operation_logs)
-- 用途：记录导入/导出/回滚等操作历史
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    type TEXT NOT NULL CHECK (type IN ('import', 'export', 'rollback')),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'rolled_back')),
    
    filename TEXT,
    total_rows INTEGER,
    
    -- JSONB 详情字段
    rows_valid_uploaded JSONB,
    rows_valid_skipped JSONB,
    rows_duplicate_uploaded JSONB,
    rows_duplicate_skipped JSONB,
    rows_error JSONB,
    
    -- 回滚状态
    is_rolled_back BOOLEAN DEFAULT FALSE,
    rolled_back_at TIMESTAMP WITH TIME ZONE,
    
    -- 关联数据
    transaction_ids UUID[],
    
    -- 导出配置 (Export specific)
    export_config JSONB,
    
    -- 关联日志 (e.g. Rollback log pointing to Import log)
    target_log_id UUID REFERENCES operation_logs(id)
);

CREATE INDEX IF NOT EXISTS idx_logs_created_at ON operation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_type ON operation_logs(type);


-- ----------------------------------------------------------------------------
-- 3.2 每日打卡表 (daily_checkins)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_date DATE NOT NULL UNIQUE,
    checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkins_date ON daily_checkins(check_date);

-- ============================================================================
-- 第四部分：预算系统表
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4.1 预算计划表 (budget_plans)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budget_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_type TEXT NOT NULL CHECK (plan_type IN ('category', 'total')),
    category_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,  -- 关联费用账户（标签）
    period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('weekly', 'monthly')),
    hard_limit DECIMAL(20, 4) NOT NULL,
    limit_currency TEXT NOT NULL DEFAULT 'CNY',
    soft_limit_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'paused')),
    account_filter_mode TEXT NOT NULL DEFAULT 'all' CHECK (account_filter_mode IN ('all', 'include', 'exclude')),
    account_filter_ids UUID[],
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    included_category_ids UUID[],  -- 纳入统计的费用账户ID列表（total类型时使用）
    round_number SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_plans_total_unique 
    ON budget_plans(plan_type) WHERE plan_type = 'total' AND status != 'expired';
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_plans_category_unique 
    ON budget_plans(category_account_id) WHERE plan_type = 'category' AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_budget_plans_status ON budget_plans(status);
CREATE INDEX IF NOT EXISTS idx_budget_plans_category ON budget_plans(category_account_id) WHERE category_account_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4.2 预算周期记录表 (budget_period_records)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS budget_period_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES budget_plans(id) ON DELETE CASCADE,
    round_number SMALLINT NOT NULL,
    period_index SMALLINT NOT NULL CHECK (period_index >= 1 AND period_index <= 12),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    actual_amount DECIMAL(20, 4),
    hard_limit DECIMAL(20, 4) NOT NULL,
    soft_limit DECIMAL(20, 4),
    indicator_status TEXT NOT NULL DEFAULT 'pending' CHECK (indicator_status IN ('star', 'green', 'red', 'pending')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_period_records_plan ON budget_period_records(plan_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_period_records_unique 
    ON budget_period_records(plan_id, round_number, period_index);

-- ============================================================================
-- 第五部分：视图
-- ============================================================================

-- 标签视图（用于前端兼容，将虚账户展示为"标签"）
CREATE OR REPLACE VIEW tags_view AS
SELECT 
    id,
    name,
    CASE type
        WHEN 'expense' THEN 'expense'
        WHEN 'income' THEN 'income'
        ELSE 'transfer'
    END AS kind,
    is_active,
    parent_id,
    full_path,
    sort_order
FROM accounts
WHERE account_class = 'nominal' 
  AND type IN ('expense', 'income')
  AND is_group = false;

-- 真实账户视图（用于账户选择器）
CREATE OR REPLACE VIEW real_accounts_view AS
SELECT 
    id,
    parent_id,
    name,
    type,
    subtype,
    currency,
    is_group,
    is_active,
    full_path,
    credit_limit,
    statement_day,
    due_day,
    sort_order
FROM accounts
WHERE account_class = 'real'
  AND is_group = false;

-- 账户余额视图（基于复式记账计算）
CREATE OR REPLACE VIEW account_balances_view AS
SELECT 
    a.id AS account_id,
    a.name,
    a.type,
    a.currency,
    COALESCE(
        (SELECT SUM(COALESCE(t.to_amount, t.amount)) 
         FROM transactions t 
         WHERE t.to_account_id = a.id),
        0
    ) - COALESCE(
        (SELECT SUM(COALESCE(t.from_amount, t.amount)) 
         FROM transactions t 
         WHERE t.from_account_id = a.id),
        0
    ) AS balance
FROM accounts a
WHERE a.account_class = 'real'
  AND a.is_group = false;

-- ============================================================================
-- 第六部分：触发器
-- ============================================================================

-- 更新 updated_at 时间戳
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_accounts_updated_at ON accounts;
CREATE TRIGGER tr_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS tr_transactions_updated_at ON transactions;
CREATE TRIGGER tr_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS tr_projects_updated_at ON projects;
CREATE TRIGGER tr_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS tr_periodic_tasks_updated_at ON periodic_tasks;
CREATE TRIGGER tr_periodic_tasks_updated_at
    BEFORE UPDATE ON periodic_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 缓存失效触发器
CREATE OR REPLACE FUNCTION invalidate_statistics_cache()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE statistics_cache 
    SET valid_until = NOW()
    WHERE account_id IN (
        COALESCE(NEW.from_account_id, OLD.from_account_id),
        COALESCE(NEW.to_account_id, OLD.to_account_id)
    ) OR account_id IS NULL;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_transactions_cache_invalidate ON transactions;
CREATE TRIGGER tr_transactions_cache_invalidate
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION invalidate_statistics_cache();

-- 自动更新 full_path
CREATE OR REPLACE FUNCTION update_account_full_path()
RETURNS TRIGGER AS $$
DECLARE
    parent_path TEXT;
BEGIN
    IF NEW.parent_id IS NULL THEN
        NEW.full_path = NEW.name;
    ELSE
        SELECT full_path INTO parent_path FROM accounts WHERE id = NEW.parent_id;
        NEW.full_path = parent_path || ':' || NEW.name;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_accounts_full_path ON accounts;
CREATE TRIGGER tr_accounts_full_path
    BEFORE INSERT OR UPDATE OF name, parent_id ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_account_full_path();

-- ============================================================================
-- 第七部分：系统账户初始化
-- ============================================================================

-- 顶层系统账户（5大类）
INSERT INTO accounts (id, name, account_class, type, is_group, is_system, full_path, sort_order) VALUES
    ('00000000-0000-0000-0000-000000000001', '资产', 'real', 'asset', true, true, '资产', 1),
    ('00000000-0000-0000-0000-000000000002', '负债', 'real', 'liability', true, true, '负债', 2),
    ('00000000-0000-0000-0000-000000000003', '收入', 'nominal', 'income', true, true, '收入', 3),
    ('00000000-0000-0000-0000-000000000004', '费用', 'nominal', 'expense', true, true, '费用', 4),
    ('00000000-0000-0000-0000-000000000005', '权益', 'nominal', 'equity', true, true, '权益', 5)
ON CONFLICT (id) DO NOTHING;

-- 权益下的系统账户：期初余额
INSERT INTO accounts (id, parent_id, name, account_class, type, is_group, is_system, full_path, sort_order) VALUES
    ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000005', '期初余额', 'nominal', 'equity', false, true, '权益:期初余额', 1)
ON CONFLICT (id) DO NOTHING;

-- 常用费用类别
INSERT INTO accounts (parent_id, name, account_class, type, is_group, is_system, full_path, sort_order) 
SELECT '00000000-0000-0000-0000-000000000004', name, 'nominal', 'expense', false, false, '费用:' || name, sort_order
FROM (VALUES 
    ('餐饮', 1), ('交通', 2), ('购物', 3), ('娱乐', 4), ('居住', 5),
    ('医疗', 6), ('教育', 7), ('通讯', 8), ('人情', 9), ('其他支出', 99)
) AS t(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE full_path = '费用:' || t.name);

-- 常用收入类别
INSERT INTO accounts (parent_id, name, account_class, type, is_group, is_system, full_path, sort_order) 
SELECT '00000000-0000-0000-0000-000000000003', name, 'nominal', 'income', false, false, '收入:' || name, sort_order
FROM (VALUES 
    ('工资', 1), ('奖金', 2), ('投资收益', 3), ('报销', 4), ('代付回款', 5), ('其他收入', 99)
) AS t(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE full_path = '收入:' || t.name);

-- ============================================================================
-- 第八部分：RLS 策略
-- ============================================================================

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodic_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE statistics_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for accounts" ON accounts;
DROP POLICY IF EXISTS "Allow all for transactions" ON transactions;
DROP POLICY IF EXISTS "Allow all for calibrations" ON calibrations;
DROP POLICY IF EXISTS "Allow all for periodic_tasks" ON periodic_tasks;
DROP POLICY IF EXISTS "Allow all for reconciliation_issues" ON reconciliation_issues;
DROP POLICY IF EXISTS "Allow all for projects" ON projects;
DROP POLICY IF EXISTS "Allow all for statistics_cache" ON statistics_cache;

CREATE POLICY "Allow all for accounts" ON accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for transactions" ON transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for calibrations" ON calibrations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for periodic_tasks" ON periodic_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for reconciliation_issues" ON reconciliation_issues FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for projects" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for statistics_cache" ON statistics_cache FOR ALL USING (true) WITH CHECK (true);

