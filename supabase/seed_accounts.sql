-- ============================================================================
-- 实账户结构导入脚本
-- 版本: 2.1
-- 日期: 2026-02-02
-- 用途: 在 reset.sql 后运行，添加默认的实账户结构用于测试
-- ============================================================================

DO $$ 
DECLARE
    asset_id UUID := '00000000-0000-0000-0000-000000000001';
    liability_id UUID := '00000000-0000-0000-0000-000000000002';
    
    -- Level 2 Variables
    l2_inner_bank UUID;
    l2_outer_bank UUID;
    l2_octopus UUID;
    l2_cash UUID;
    l2_invest UUID;
    
    l2_inner_card UUID;
    l2_outer_card UUID;
    
    -- Level 3 Variables (For groups)
    l3_icbc_5738 UUID;
    l3_icbc_2032 UUID;
    l3_ccb_2027 UUID;
    l3_boc_7603 UUID;
    l3_bochk_071560 UUID;
    l3_hsbc_799964 UUID;
    
    -- Level 3 Variables (Liabilities)
    l3_boc_union UUID;
    
BEGIN
    -- ==========================================
    -- 1. 资产 (Assets)
    -- ==========================================
    
    -- 1.1 内地银行账户
    INSERT INTO accounts (parent_id, name, account_class, type, is_group, sort_order) 
    VALUES (asset_id, '内地银行账户', 'real', 'asset', true, 10) RETURNING id INTO l2_inner_bank;
    
        -- 工银（5738）[Group] -> CNY, HKD
        INSERT INTO accounts (parent_id, name, account_class, type, is_group) 
        VALUES (l2_inner_bank, '工银（5738）', 'real', 'asset', true) RETURNING id INTO l3_icbc_5738;
            INSERT INTO accounts (parent_id, name, account_class, type, is_group, currency) VALUES
                (l3_icbc_5738, 'CNY', 'real', 'asset', false, 'CNY'),
                (l3_icbc_5738, 'HKD', 'real', 'asset', false, 'HKD');

        -- 工银（2032）[Group] -> CNY, HKD
        INSERT INTO accounts (parent_id, name, account_class, type, is_group) 
        VALUES (l2_inner_bank, '工银（2032）', 'real', 'asset', true) RETURNING id INTO l3_icbc_2032;
            INSERT INTO accounts (parent_id, name, account_class, type, is_group, currency) VALUES
                (l3_icbc_2032, 'CNY', 'real', 'asset', false, 'CNY'),
                (l3_icbc_2032, 'HKD', 'real', 'asset', false, 'HKD');

        -- 建行（2027）[Group] -> CNY, HKD
        INSERT INTO accounts (parent_id, name, account_class, type, is_group) 
        VALUES (l2_inner_bank, '建行（2027）', 'real', 'asset', true) RETURNING id INTO l3_ccb_2027;
            INSERT INTO accounts (parent_id, name, account_class, type, is_group, currency) VALUES
                (l3_ccb_2027, 'CNY', 'real', 'asset', false, 'CNY'),
                (l3_ccb_2027, 'HKD', 'real', 'asset', false, 'HKD');

        -- 中银（7603）[Group] -> CNY, HKD, USD
        INSERT INTO accounts (parent_id, name, account_class, type, is_group) 
        VALUES (l2_inner_bank, '中银（7603）', 'real', 'asset', true) RETURNING id INTO l3_boc_7603;
            INSERT INTO accounts (parent_id, name, account_class, type, is_group, currency) VALUES
                (l3_boc_7603, 'CNY', 'real', 'asset', false, 'CNY'),
                (l3_boc_7603, 'HKD', 'real', 'asset', false, 'HKD'),
                (l3_boc_7603, 'USD', 'real', 'asset', false, 'USD');

    -- 1.2 境外银行账户
    INSERT INTO accounts (parent_id, name, account_class, type, is_group, sort_order) 
    VALUES (asset_id, '境外银行账户', 'real', 'asset', true, 20) RETURNING id INTO l2_outer_bank;
    
        -- 中银香港（071560）[Group]
        INSERT INTO accounts (parent_id, name, account_class, type, is_group) 
        VALUES (l2_outer_bank, '中银香港（071560）', 'real', 'asset', true) RETURNING id INTO l3_bochk_071560;
            INSERT INTO accounts (parent_id, name, account_class, type, is_group, currency) VALUES
                (l3_bochk_071560, 'CNY', 'real', 'asset', false, 'CNY'),
                (l3_bochk_071560, 'HKD', 'real', 'asset', false, 'HKD'),
                (l3_bochk_071560, 'USD', 'real', 'asset', false, 'USD');

        -- 汇丰One（799964）[Group]
        INSERT INTO accounts (parent_id, name, account_class, type, is_group) 
        VALUES (l2_outer_bank, '汇丰One（799964）', 'real', 'asset', true) RETURNING id INTO l3_hsbc_799964;
            INSERT INTO accounts (parent_id, name, account_class, type, is_group, currency) VALUES
                (l3_hsbc_799964, 'CNY', 'real', 'asset', false, 'CNY'),
                (l3_hsbc_799964, 'HKD', 'real', 'asset', false, 'HKD'),
                (l3_hsbc_799964, 'USD', 'real', 'asset', false, 'USD');

    -- 1.3 八达通卡
    INSERT INTO accounts (parent_id, name, account_class, type, is_group, sort_order) 
    VALUES (asset_id, '八达通卡', 'real', 'asset', true, 30) RETURNING id INTO l2_octopus;
    
        -- 八达通Apple (Real HKD)
        INSERT INTO accounts (parent_id, name, account_class, type, is_group, currency) 
        VALUES (l2_octopus, '八达通Apple', 'real', 'asset', false, 'HKD');
        
        -- 学生八达通（58659）
        INSERT INTO accounts (parent_id, name, account_class, type, is_group, currency) 
        VALUES (l2_octopus, '学生八达通（58659）', 'real', 'asset', false, 'HKD');
        
        -- 学生八达通（31993）
        INSERT INTO accounts (parent_id, name, account_class, type, is_group, currency) 
        VALUES (l2_octopus, '学生八达通（31993）', 'real', 'asset', false, 'HKD');
        
        -- 实体八达通（16609）
        INSERT INTO accounts (parent_id, name, account_class, type, is_group, currency) 
        VALUES (l2_octopus, '实体八达通（16609）', 'real', 'asset', false, 'HKD');

    -- 1.4 现金账户
    INSERT INTO accounts (parent_id, name, account_class, type, is_group, sort_order) 
    VALUES (asset_id, '现金账户', 'real', 'asset', true, 40) RETURNING id INTO l2_cash;
    
        INSERT INTO accounts (parent_id, name, account_class, type, is_group, currency) VALUES
            (l2_cash, 'BocPay', 'real', 'asset', false, 'HKD'),
            (l2_cash, '微信零钱', 'real', 'asset', false, 'CNY'),
            (l2_cash, '支付宝余额', 'real', 'asset', false, 'CNY'),
            (l2_cash, '人民币现金', 'real', 'asset', false, 'CNY'),
            (l2_cash, '港币现金', 'real', 'asset', false, 'HKD'),
            (l2_cash, '美元现金', 'real', 'asset', false, 'USD');

    -- 1.5 投资账户
    INSERT INTO accounts (parent_id, name, account_class, type, is_group, sort_order) 
    VALUES (asset_id, '投资账户', 'real', 'asset', true, 50) RETURNING id INTO l2_invest;
    
        INSERT INTO accounts (parent_id, name, account_class, type, is_group, currency) VALUES
            (l2_invest, '同花顺基金', 'real', 'asset', false, 'CNY'),
            (l2_invest, '银河证券（5498）', 'real', 'asset', false, 'CNY'),
            (l2_invest, '币安（4498）', 'real', 'asset', false, 'CNY');

    -- ==========================================
    -- 2. 负债 (Liabilities)
    -- ==========================================
    
    -- 2.1 内地银行信用卡
    INSERT INTO accounts (parent_id, name, account_class, type, is_group, sort_order) 
    VALUES (liability_id, '内地银行信用卡', 'real', 'liability', true, 10) RETURNING id INTO l2_inner_card;
        
        INSERT INTO accounts (parent_id, name, account_class, type, is_group, currency) 
        VALUES (l2_inner_card, '中银（4978）', 'real', 'liability', false, 'CNY');

    -- 2.2 境外银行信用卡
    INSERT INTO accounts (parent_id, name, account_class, type, is_group, sort_order) 
    VALUES (liability_id, '境外银行信用卡', 'real', 'liability', true, 20) RETURNING id INTO l2_outer_card;
        
        -- 中银科大Visa (HKD)
        INSERT INTO accounts (parent_id, name, account_class, type, is_group, currency) 
        VALUES (l2_outer_card, '中银科大Visa', 'real', 'liability', false, 'HKD');
        
        -- 中银ChillMa (HKD)
        INSERT INTO accounts (parent_id, name, account_class, type, is_group, currency) 
        VALUES (l2_outer_card, '中银ChillMa', 'real', 'liability', false, 'HKD');
        
        -- 中银科大Union [Group] -> CNY, HKD
        INSERT INTO accounts (parent_id, name, account_class, type, is_group) 
        VALUES (l2_outer_card, '中银科大Union', 'real', 'liability', true) RETURNING id INTO l3_boc_union;
            INSERT INTO accounts (parent_id, name, account_class, type, is_group, currency) VALUES
                (l3_boc_union, 'CNY', 'real', 'liability', false, 'CNY'),
                (l3_boc_union, 'HKD', 'real', 'liability', false, 'HKD');
        
        -- 汇财Visa (HKD)
        INSERT INTO accounts (parent_id, name, account_class, type, is_group, currency) 
        VALUES (l2_outer_card, '汇财Visa', 'real', 'liability', false, 'HKD');
        
        -- 汇财Ma (HKD)
        INSERT INTO accounts (parent_id, name, account_class, type, is_group, currency) 
        VALUES (l2_outer_card, '汇财Ma', 'real', 'liability', false, 'HKD');

    -- ==========================================
    -- 3. 自动生成初始校准 (Initial Calibration)
    -- ==========================================
    -- 为每个新创建的实账户(叶子节点) 插入一条余额为0的校准记录，标记为期初校准
    
    INSERT INTO calibrations (account_id, balance, date, source, is_opening, created_at)
    SELECT id, 0, created_at, 'manual', true, created_at
    FROM accounts
    WHERE account_class = 'real' 
      AND is_group = false
      AND NOT EXISTS (SELECT 1 FROM calibrations WHERE calibrations.account_id = accounts.id);

END $$;

-- ============================================================================
-- 验证结果
-- ============================================================================

SELECT '资产账户（叶子）' as category, COUNT(*) as count 
FROM accounts WHERE account_class = 'real' AND type = 'asset' AND is_group = false
UNION ALL
SELECT '负债账户（叶子）', COUNT(*) 
FROM accounts WHERE account_class = 'real' AND type = 'liability' AND is_group = false
UNION ALL
SELECT '初始校准记录', COUNT(*) 
FROM calibrations WHERE is_opening = true;
