-- ============================================================================
-- MyKit 全局重置脚本
-- 版本: 2.1
-- 日期: 2026-02-02
-- 功能：清空所有业务数据，重置设置，初始化系统账户和默认标签
-- 用途：测试环境初始化、开发调试
-- 警告：此脚本会删除所有数据！生产环境慎用！
-- ============================================================================

BEGIN;

-- ============================================================================
-- 第一部分：清空数据（按依赖顺序，先子表后父表）
-- ============================================================================

TRUNCATE TABLE 
    budget_period_records,
    budget_plans,
    periodic_tasks,
    reconciliation_issues,
    calibrations,
    transactions,
    operation_logs,
    projects,
    accounts,
    daily_checkins,
    statistics_cache
    RESTART IDENTITY CASCADE;

-- ============================================================================
-- 第二部分：重置设置（保留一行记录，重置为默认值）
-- ============================================================================

DELETE FROM bookkeeping_settings;
INSERT INTO bookkeeping_settings (
    id, 
    thousand_separator, 
    decimal_places, 
    default_currency, 
    calibration_reminder_enabled,
    calibration_interval_days,
    expense_color,
    income_color,
    transfer_color
) VALUES (
    true,              -- 主键
    true,              -- 显示千分位
    2,                 -- 小数位数
    'CNY',             -- 默认币种
    true,              -- 启用强制校准提醒
    30,                -- 校准间隔天数
    '#ef4444',         -- 支出颜色（红）
    '#22c55e',         -- 收入颜色（绿）
    '#0ea5e9'          -- 转账颜色（蓝）
);

-- ============================================================================
-- 第三部分：初始化系统账户（固定 ID 以便代码引用）
-- ============================================================================

-- 3.1 顶级系统账户
INSERT INTO accounts (id, name, account_class, type, is_group, is_system, full_path, sort_order) VALUES
    ('00000000-0000-0000-0000-000000000001', '资产', 'real', 'asset', true, true, '资产', 1),
    ('00000000-0000-0000-0000-000000000002', '负债', 'real', 'liability', true, true, '负债', 2),
    ('00000000-0000-0000-0000-000000000003', '收入', 'nominal', 'income', true, true, '收入', 3),
    ('00000000-0000-0000-0000-000000000004', '费用', 'nominal', 'expense', true, true, '费用', 4),
    ('00000000-0000-0000-0000-000000000005', '权益', 'nominal', 'equity', true, true, '权益', 5);

-- 3.2 权益子账户：期初余额（用于期初交易的对手方）
INSERT INTO accounts (id, parent_id, name, account_class, type, is_group, is_system, full_path, sort_order) VALUES
    ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000005', '期初余额', 'nominal', 'equity', false, true, '权益:期初余额', 1);

-- ============================================================================
-- 第四部分：初始化默认标签（虚账户）
-- ============================================================================

-- 4.1 收入标签
INSERT INTO accounts (parent_id, name, account_class, type, is_group, is_system, full_path, sort_order) 
VALUES 
    ('00000000-0000-0000-0000-000000000003', '工资', 'nominal', 'income', false, false, '收入:工资', 1),
    ('00000000-0000-0000-0000-000000000003', '红包', 'nominal', 'income', false, false, '收入:红包', 2),
    ('00000000-0000-0000-0000-000000000003', '退款', 'nominal', 'income', false, false, '收入:退款', 3),
    ('00000000-0000-0000-0000-000000000003', '代付回款', 'nominal', 'income', false, false, '收入:代付回款', 4),
    ('00000000-0000-0000-0000-000000000003', '利息', 'nominal', 'income', false, false, '收入:利息', 5),
    ('00000000-0000-0000-0000-000000000003', '现金回赠', 'nominal', 'income', false, false, '收入:现金回赠', 6),
    ('00000000-0000-0000-0000-000000000003', '业余收入', 'nominal', 'income', false, false, '收入:业余收入', 7);

-- 4.2 支出标签
INSERT INTO accounts (parent_id, name, account_class, type, is_group, is_system, full_path, sort_order) 
VALUES 
    ('00000000-0000-0000-0000-000000000004', '餐饮', 'nominal', 'expense', false, false, '费用:餐饮', 1),
    ('00000000-0000-0000-0000-000000000004', '零食饮料', 'nominal', 'expense', false, false, '费用:零食饮料', 2),
    ('00000000-0000-0000-0000-000000000004', '交通', 'nominal', 'expense', false, false, '费用:交通', 3),
    ('00000000-0000-0000-0000-000000000004', '线下购物', 'nominal', 'expense', false, false, '费用:线下购物', 4),
    ('00000000-0000-0000-0000-000000000004', '线上购物', 'nominal', 'expense', false, false, '费用:线上购物', 5),
    ('00000000-0000-0000-0000-000000000004', '生活服务', 'nominal', 'expense', false, false, '费用:生活服务', 6),
    ('00000000-0000-0000-0000-000000000004', '软件', 'nominal', 'expense', false, false, '费用:软件', 7),
    ('00000000-0000-0000-0000-000000000004', '游戏', 'nominal', 'expense', false, false, '费用:游戏', 8),
    ('00000000-0000-0000-0000-000000000004', '话费', 'nominal', 'expense', false, false, '费用:话费', 9),
    ('00000000-0000-0000-0000-000000000004', '酒店', 'nominal', 'expense', false, false, '费用:酒店', 10),
    ('00000000-0000-0000-0000-000000000004', '房租', 'nominal', 'expense', false, false, '费用:房租', 11),
    ('00000000-0000-0000-0000-000000000004', '学费', 'nominal', 'expense', false, false, '费用:学费', 12),
    ('00000000-0000-0000-0000-000000000004', '医药', 'nominal', 'expense', false, false, '费用:医药', 13),
    ('00000000-0000-0000-0000-000000000004', '其他支出', 'nominal', 'expense', false, false, '费用:其他支出', 99);

COMMIT;

-- ============================================================================
-- 验证重置结果
-- ============================================================================

SELECT '系统账户' as category, COUNT(*) as count FROM accounts WHERE is_system = true
UNION ALL
SELECT '收入标签', COUNT(*) FROM accounts WHERE type = 'income' AND is_system = false
UNION ALL
SELECT '支出标签', COUNT(*) FROM accounts WHERE type = 'expense' AND is_system = false
UNION ALL
SELECT '设置记录', COUNT(*) FROM bookkeeping_settings;
