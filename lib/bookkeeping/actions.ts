import { supabase } from '@/lib/supabase';
import { calculateBalance } from './logic';
import { AccountType, Currency } from '@/lib/constants';
import { Database, Json, SnapshotRow, TransactionRow, ReconciliationIssueRow, PeriodicTaskRow, DailyCheckinRow, BudgetPlanRow, BudgetPeriodRecordRow, CurrencyRateRow } from '@/types/database';

// --- Accounts ---
type AccountRowDB = Database['public']['Tables']['accounts']['Row'];

export async function getAccountsWithBalance() {
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!accounts) return [];

  const accountsWithBalance = await Promise.all(
    (accounts as AccountRowDB[]).map(async (acc) => {
      const balance = await calculateBalance(supabase, acc.id, new Date());
      return {
        ...acc,
        balance,
      };
    })
  );

  return accountsWithBalance;
}

export async function createAccount(data: { name: string; type: AccountType; currency: Currency }) {
  const { error } = await supabase.from('accounts').insert(data);
  if (error) throw error;
}

export async function updateAccount(id: string, data: { name?: string; type?: AccountType }) {
  const { error } = await supabase.from('accounts').update(data).eq('id', id);
  if (error) throw error;
}

export async function deleteAccount(id: string) {
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) throw error;
}

export async function getAccountsMeta(): Promise<{ id: string; name: string; currency: string }[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, name, currency')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as { id: string; name: string; currency: string }[];
}

// --- Transactions ---

export interface TransactionData {
  account_id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  category: string;
  date: string;
  description?: string;
  to_account_id?: string;
  to_amount?: number;
}

export async function createTransaction(data: TransactionData) {
  if (data.type === 'transfer') {
    return createTransfer(data);
  }

  const { error } = await supabase.from('transactions').insert({
    account_id: data.account_id,
    type: data.type,
    amount: data.amount,
    category: data.category,
    date: data.date,
    description: data.description,
  });

  if (error) throw error;
}

async function createTransfer(data: TransactionData) {
  if (!data.to_account_id) throw new Error("Missing target account for transfer");

  const transferGroupId = crypto.randomUUID();
  const fromAmount = data.amount;
  const toAmount = Math.abs(data.to_amount || data.amount);

  const { error } = await supabase.from('transactions').insert([
    {
      account_id: data.account_id,
      type: 'transfer',
      amount: fromAmount,
      category: data.category || '内部转账',
      date: data.date,
      description: data.description || '',
      transfer_group_id: transferGroupId,
    },
    {
      account_id: data.to_account_id,
      type: 'transfer',
      amount: toAmount,
      category: data.category || '内部转账',
      date: data.date,
      description: data.description || '',
      transfer_group_id: transferGroupId,
    }
  ]);

  if (error) throw error;
}

export async function getAvailableTags() {
  const { data, error } = await supabase
    .from('bookkeeping_tags')
    .select('kind, name')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data || []) as Pick<TagRow, 'kind' | 'name'>[];
}

// --- Transaction Query ---

export interface TransactionFilter {
  type?: string;
  accountId?: string | string[];
  startDate?: string;
  endDate?: string;
  category?: string | string[];
  minAmount?: number;
  maxAmount?: number;
}

const PAGE_SIZE = 20;

export async function getTransactions({ page = 0, filters = {} }: { page?: number; filters?: TransactionFilter }) {
  let query = supabase
    .from('transactions')
    .select(`
      *,
      accounts (
        name,
        currency
      )
    `)
    .order('date', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (filters.type && filters.type !== 'all') {
    query = query.eq('type', filters.type as 'income' | 'expense' | 'transfer');
  }
  if (filters.accountId) {
    if (Array.isArray(filters.accountId)) {
      if (filters.accountId.length > 0) {
        query = query.in('account_id', filters.accountId);
      }
    } else {
      query = query.eq('account_id', filters.accountId);
    }
  }
  // Filter by tags? 
  // NOTE: Current implementation does exact match on 'category' column which stores tag name.
  // If user wants to filter by active tags vs disabled tags, this logic relies on what frontend passes.
  if (filters.category) {
    if (Array.isArray(filters.category)) {
      if (filters.category.length > 0) {
        query = query.in('category', filters.category);
      }
    } else {
      query = query.eq('category', filters.category);
    }
  }
  if (filters.startDate) {
    query = query.gte('date', filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte('date', filters.endDate);
  }
  if (typeof filters.minAmount === 'number' || typeof filters.maxAmount === 'number') {
    const min = typeof filters.minAmount === 'number' ? filters.minAmount : 0;
    const max = typeof filters.maxAmount === 'number' ? filters.maxAmount : undefined;

    const positiveConditions = [`amount.gte.${min}`];
    if (typeof max === 'number') {
      positiveConditions.push(`amount.lte.${max}`);
    }

    const negativeConditions: string[] = [];
    if (typeof max === 'number') {
      negativeConditions.push(`amount.gte.${-max}`);
    }
    negativeConditions.push(`amount.lte.${-min}`);

    const orClauses = [
      `and(${positiveConditions.join(',')})`,
      `and(${negativeConditions.join(',')})`,
    ];

    query = query.or(orClauses.join(','));
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
}

export async function getDashboardTransactions() {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .gte('date', oneYearAgo.toISOString())
    .order('date', { ascending: true });

  if (error) throw error;
  return data;
}

// --- Snapshots ---

/**
 * 创建或更新快照
 * 如果同一账户同一天已有快照，则更新；否则新增
 */
export async function createSnapshot(data: { account_id: string; balance: number; date: string; type?: string }) {
  // 提取日期部分 (YYYY-MM-DD)
  const dateOnly = data.date.split('T')[0];
  const startOfDay = `${dateOnly}T00:00:00.000Z`;
  const endOfDay = `${dateOnly}T23:59:59.999Z`;
  
  // 检查同一天是否已有快照
  const { data: existingSnapshots, error: queryError } = await supabase
    .from('snapshots')
    .select('id')
    .eq('account_id', data.account_id)
    .gte('date', startOfDay)
    .lte('date', endOfDay);
  
  if (queryError) throw queryError;
  
  if (existingSnapshots && existingSnapshots.length > 0) {
    // 更新最新的一条（如果有多条，只更新第一条，其他删除）
    const latestId = existingSnapshots[0].id;
    
    // 删除多余的快照（如果有的话）
    if (existingSnapshots.length > 1) {
      const idsToDelete = existingSnapshots.slice(1).map(s => s.id);
      await supabase.from('snapshots').delete().in('id', idsToDelete);
    }
    
    // 更新快照
    const { error: updateError } = await supabase
      .from('snapshots')
      .update({
        balance: data.balance,
        date: data.date,
        type: data.type || 'Manual',
      })
      .eq('id', latestId);
    
    if (updateError) throw updateError;
  } else {
    // 新增快照
    const { error: insertError } = await supabase.from('snapshots').insert({
    account_id: data.account_id,
    balance: data.balance,
    date: data.date,
      type: data.type || 'Manual',
  });
    if (insertError) throw insertError;
  }
}

export async function getSnapshotsByIds(ids: string[]): Promise<SnapshotRow[]> {
  if (!ids.length) return [];
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return [];

  const { data, error } = await supabase
    .from('snapshots')
    .select('*')
    .in('id', unique as string[]);

  if (error) throw error;
  return (data || []) as SnapshotRow[];
}

// --- Reconciliation ---

type TagRow = Database['public']['Tables']['bookkeeping_tags']['Row'];
type BookkeepingSettingsRow = Database['public']['Tables']['bookkeeping_settings']['Row'];
export type BookkeepingKind = 'expense' | 'income' | 'transfer';

// 默认容差阈值，实际使用时从数据库读取
const DEFAULT_RECON_TOLERANCE = 0.01;

function normalizeDate(input: string | Date) {
  const date = typeof input === 'string' ? new Date(input) : input;
  return date.toISOString();
}

interface RunReconciliationParams {
  accountId: string;
  startDate?: string | Date;
  endDate?: string | Date;
  source?: 'manual' | 'snapshot';
}

interface ReconciliationSegment {
  start: SnapshotRow;
  end: SnapshotRow;
  expectedDelta: number;
  actualDelta: number;
  diff: number;
  transactions: TransactionRow[];
}

export async function getReconciliationIssues(status: 'open' | 'resolved' = 'open') {
  let query = supabase
    .from('reconciliation_issues')
    .select('*')
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ReconciliationIssueRow[];
}

export async function resolveReconciliationIssue(id: string) {
  const { error } = await supabase
    .from('reconciliation_issues')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function runReconciliationCheck({
  accountId,
  startDate,
  endDate,
  source = 'manual',
}: RunReconciliationParams) {
  // 获取容差阈值设置
  const settings = await getBookkeepingSettings();
  const tolerance = settings.snapshot_tolerance || DEFAULT_RECON_TOLERANCE;

  const { data: snapshotsData, error: snapshotError } = await supabase
    .from('snapshots')
    .select('*')
    .eq('account_id', accountId)
    .order('date', { ascending: true });

  if (snapshotError) throw snapshotError;

  await supabase.from('reconciliation_issues').delete().eq('account_id', accountId);

  const snapshots = (snapshotsData || []) as SnapshotRow[];
  
  if (snapshots.length < 2) {
    return { inserted: 0, segments: [] as ReconciliationSegment[], message: '缺少足够的时点快照，无法查账' };
  }

  const startISO = startDate ? normalizeDate(startDate) : snapshots[0].date;
  const endISO = endDate ? normalizeDate(endDate) : snapshots[snapshots.length - 1].date;

  if (new Date(startISO) > new Date(endISO)) {
    throw new Error('开始时间不能晚于结束时间');
  }

  const scopedSnapshots = collectScopedSnapshots(snapshots, startISO, endISO);

  if (scopedSnapshots.length < 2) {
    return { inserted: 0, segments: [] };
  }

  const firstDate = scopedSnapshots[0].date;
  const lastDate = scopedSnapshots[scopedSnapshots.length - 1].date;

  const { data: transactionsData, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('account_id', accountId)
    .gt('date', firstDate)
    .lte('date', lastDate)
    .order('date', { ascending: true });

  if (txError) throw txError;
  const transactions = (transactionsData || []) as TransactionRow[];

  const segments: ReconciliationSegment[] = [];

  for (let i = 0; i < scopedSnapshots.length - 1; i++) {
    const startSnap = scopedSnapshots[i];
    const endSnap = scopedSnapshots[i + 1];

    const segmentTransactions =
      transactions?.filter(
        (tx) => new Date(tx.date) > new Date(startSnap.date) && new Date(tx.date) <= new Date(endSnap.date)
      ) || [];

    const actualDelta = segmentTransactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const expectedDelta = Number(endSnap.balance) - Number(startSnap.balance);
    const diff = Number((actualDelta - expectedDelta).toFixed(2));

    // 使用数据库中的容差阈值
    if (Math.abs(diff) > tolerance) {
      segments.push({
        start: startSnap,
        end: endSnap,
        expectedDelta,
        actualDelta,
        diff,
        transactions: segmentTransactions,
      });
    }
  }

  if (!segments.length) {
    return { inserted: 0, segments };
  }

  const payload = segments.map((segment) => ({
    account_id: accountId,
    start_snapshot_id: segment.start.id,
    end_snapshot_id: segment.end.id,
    period_start: segment.start.date,
    period_end: segment.end.date,
    expected_delta: segment.expectedDelta,
    actual_delta: segment.actualDelta,
    diff: segment.diff,
    status: 'open',
    source,
    metadata: {
      transaction_ids: segment.transactions.map((tx) => tx.id),
    } as Json,
    resolved_at: null,
  }));

  const { error: insertError } = await supabase.from('reconciliation_issues').insert(payload);

  if (insertError) throw insertError;

  return { inserted: payload.length, segments };
}

function collectScopedSnapshots(snapshots: SnapshotRow[], startISO: string, endISO: string) {
  const scoped: SnapshotRow[] = [];
  let lastBefore: SnapshotRow | null = null;
  let firstAfter: SnapshotRow | null = null;

  snapshots.forEach((snap) => {
    const date = new Date(snap.date);
    if (date < new Date(startISO)) {
      lastBefore = snap;
    } else if (date > new Date(endISO)) {
      if (!firstAfter) firstAfter = snap;
    } else {
      scoped.push(snap);
    }
  });

  if (lastBefore) scoped.unshift(lastBefore);
  if (firstAfter) scoped.push(firstAfter);

  return scoped;
}

export async function regenerateIssuesForAccounts(accountIds: string[], source: 'manual' | 'snapshot' = 'manual') {
  const unique = Array.from(new Set(accountIds.filter(Boolean)));
  for (const id of unique) {
    await runReconciliationCheck({ accountId: id, source });
  }
}

// --- Settings: Colors + Tags ---

export async function getBookkeepingSettings() {
  const { data, error } = await supabase
    .from('bookkeeping_settings')
    .select('*')
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  if (!data) {
    return {
      id: true,
      thousand_separator: true,
      decimal_places: 2,
      default_currency: 'CNY',
      auto_snapshot_enabled: true,
      snapshot_interval_days: 30,
      snapshot_tolerance: 1,
      expense_color: '#ef4444',
      income_color: '#22c55e',
      transfer_color: '#0ea5e9',
      updated_at: new Date().toISOString(),
    } satisfies BookkeepingSettingsRow;
  }

  return data as BookkeepingSettingsRow;
}

export async function updateBookkeepingColors(data: {
  expense_color: string;
  income_color: string;
  transfer_color: string;
}) {
  const payload = {
    id: true,
    ...data,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('bookkeeping_settings').upsert(payload);
  if (error) throw error;
}

export async function updateBookkeepingSettings(data: {
  decimal_places?: number;
  thousand_separator?: boolean;
  auto_snapshot_enabled?: boolean;
  snapshot_interval_days?: number;
  snapshot_tolerance?: number;
}) {
  const payload = {
    id: true,
    ...data,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('bookkeeping_settings').upsert(payload);
  if (error) throw error;
}

export async function listTags() {
  const { data, error } = await supabase
    .from('bookkeeping_tags')
    .select('*')
    .order('kind', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return (data || []) as TagRow[];
}

export async function createTag(data: {
  kind: BookkeepingKind;
  name: string;
  description?: string;
  is_active?: boolean;
}) {
  const payload = {
    kind: data.kind,
    name: data.name,
    description: data.description || null,
    is_active: data.is_active ?? true,
  };

  const { error } = await supabase.from('bookkeeping_tags').insert(payload);
  if (error) throw error;
}

export async function updateTag(id: string, data: Partial<Omit<TagRow, 'id'>>) {
  const payload = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('bookkeeping_tags').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteTag(id: string) {
  const { error } = await supabase.from('bookkeeping_tags').delete().eq('id', id);
  if (error) throw error;
}

// --- Periodic Tasks ---

export interface PeriodicTaskWithAccount extends PeriodicTaskRow {
  accounts: { name: string; currency: string } | null;
}

export async function getPeriodicTasks(): Promise<PeriodicTaskWithAccount[]> {
  const { data, error } = await supabase
    .from('periodic_tasks')
    .select(`
      *,
      accounts:account_id (
        name,
        currency
      )
    `)
    .order('next_run_date', { ascending: true });

  if (error) {
    console.error('getPeriodicTasks error:', error);
    throw new Error(error.message || 'Failed to fetch periodic tasks');
  }
  return (data || []) as PeriodicTaskWithAccount[];
}

export interface CreatePeriodicTaskData {
  account_id: string;
  type?: 'income' | 'expense' | 'transfer';
  amount: number;
  category: string;
  description?: string;
  frequency: string;
  next_run_date: string;
  to_account_id?: string;
  to_amount?: number;
}

export async function createPeriodicTask(data: CreatePeriodicTaskData) {
  const { error } = await supabase.from('periodic_tasks').insert({
    account_id: data.account_id,
    type: data.type || 'expense',
    amount: data.amount,
    category: data.category,
    description: data.description || null,
    frequency: data.frequency,
    next_run_date: data.next_run_date,
    is_active: true,
    to_account_id: data.to_account_id || null,
    to_amount: data.to_amount || null,
  });
  if (error) throw error;
}

export async function updatePeriodicTask(
  id: string,
  data: Partial<Omit<PeriodicTaskRow, 'id' | 'created_at'>>
) {
  const { error } = await supabase.from('periodic_tasks').update(data).eq('id', id);
  if (error) throw error;
}

export async function deletePeriodicTask(id: string) {
  const { error } = await supabase.from('periodic_tasks').delete().eq('id', id);
  if (error) throw error;
}

export async function togglePeriodicTaskActive(id: string, isActive: boolean) {
  const { data, error } = await supabase
    .from('periodic_tasks')
    .update({ is_active: isActive })
    .eq('id', id)
    .select();
  
  if (error) {
    console.error('Toggle active error:', error);
    throw new Error(error.message || '更新任务状态失败');
  }
  
  if (!data || data.length === 0) {
    throw new Error('未找到对应任务');
  }
  
  return data[0];
}

// --- Daily Check-in & Global Refresh ---

/**
 * 获取今日是否已打卡
 */
export async function getTodayCheckin(): Promise<{ checked: boolean; checkedAt: string | null }> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  const { data, error } = await supabase
    .from('daily_checkins')
    .select('*')
    .eq('check_date', today)
    .maybeSingle();
  
  if (error) throw error;
  
  const checkin = data as DailyCheckinRow | null;
  
  return {
    checked: !!checkin,
    checkedAt: checkin?.checked_at || null,
  };
}

/**
 * 记录今日打卡
 */
export async function recordCheckin(): Promise<{ success: boolean; alreadyChecked: boolean }> {
  const today = new Date().toISOString().split('T')[0];
  
  // 检查是否已打卡
  const { data: existing } = await supabase
    .from('daily_checkins')
    .select('id')
    .eq('check_date', today)
    .maybeSingle();
  
  if (existing) {
    return { success: true, alreadyChecked: true };
  }
  
  // 插入打卡记录
  const { error } = await supabase
    .from('daily_checkins')
    .insert({ check_date: today });
  
  if (error) throw error;
  
  return { success: true, alreadyChecked: false };
}

/**
 * 计算下一次执行日期
 */
function calculateNextRunDate(currentDate: string, frequency: string): string {
  const date = new Date(currentDate);
  
  switch (frequency) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'biweekly':
      date.setDate(date.getDate() + 14);
      break;
    case 'monthly': {
      // 自然月逻辑：保持日期，处理月末
      const originalDay = date.getDate();
      date.setMonth(date.getMonth() + 1);
      // 如果日期溢出（如31号变成下下月1号），回退到月末
      if (date.getDate() !== originalDay) {
        date.setDate(0); // 回到上月最后一天
      }
      break;
    }
    case 'quarterly': {
      const originalDay = date.getDate();
      date.setMonth(date.getMonth() + 3);
      if (date.getDate() !== originalDay) {
        date.setDate(0);
      }
      break;
    }
    case 'yearly': {
      const originalDay = date.getDate();
      date.setFullYear(date.getFullYear() + 1);
      if (date.getDate() !== originalDay) {
        date.setDate(0);
      }
      break;
    }
    default:
      // 自定义天数：custom_N 格式
      if (frequency.startsWith('custom_')) {
        const days = parseInt(frequency.replace('custom_', ''), 10);
        if (!isNaN(days) && days > 0) {
          date.setDate(date.getDate() + days);
        }
      }
  }
  
  return date.toISOString().split('T')[0];
}

/**
 * 执行周期性交易
 * 检查所有启用的周期任务，对到期的任务创建流水并更新下次执行日期
 */
export async function executePeriodicTasks(): Promise<{
  executed: number;
  tasks: Array<{ taskId: string; taskName: string; date: string }>;
}> {
  const today = new Date().toISOString().split('T')[0];
  
  // 1. 获取所有启用的周期任务
  const { data: tasksData, error: tasksError } = await supabase
    .from('periodic_tasks')
    .select('*')
    .eq('is_active', true)
    .lte('next_run_date', today);
  
  if (tasksError) throw tasksError;
  
  const tasks = (tasksData || []) as PeriodicTaskRow[];
  const executedTasks: Array<{ taskId: string; taskName: string; date: string }> = [];
  
  // 2. 遍历每个任务
  for (const task of tasks) {
    let currentRunDate = task.next_run_date;
    
    // 循环处理所有到期的执行（补偿多期未打卡的情况）
    while (currentRunDate <= today) {
      // 创建流水
      const transactionDate = `${currentRunDate}T12:00:00.000Z`; // 中午12点
      
      if (task.type === 'transfer' && task.to_account_id) {
        // 划转：创建两笔关联流水
        const groupId = crypto.randomUUID();
        
        // 转出（负数）
        await supabase.from('transactions').insert({
          account_id: task.account_id,
          type: 'transfer',
          amount: -Math.abs(task.amount),
          category: task.category,
          description: task.description,
          date: transactionDate,
          transfer_group_id: groupId,
        });
        
        // 转入（正数）
        const toAmount = task.to_amount || task.amount;
        await supabase.from('transactions').insert({
          account_id: task.to_account_id,
          type: 'transfer',
          amount: Math.abs(toAmount),
          category: task.category,
          description: task.description,
          date: transactionDate,
          transfer_group_id: groupId,
        });
      } else {
        // 收入或支出
        const amount = task.type === 'expense' 
          ? -Math.abs(task.amount) 
          : Math.abs(task.amount);
        
        await supabase.from('transactions').insert({
          account_id: task.account_id,
          type: task.type,
          amount,
          category: task.category,
          description: task.description,
          date: transactionDate,
        });
      }
      
      executedTasks.push({
        taskId: task.id,
        taskName: task.category,
        date: currentRunDate,
      });
      
      // 计算下一次执行日期
      currentRunDate = calculateNextRunDate(currentRunDate, task.frequency);
    }
    
    // 更新任务的下次执行日期
    await supabase
      .from('periodic_tasks')
      .update({ next_run_date: currentRunDate })
      .eq('id', task.id);
  }
  
  return {
    executed: executedTasks.length,
    tasks: executedTasks,
  };
}

/**
 * 自动快照检查
 * 根据设置的间隔天数，检查是否需要为各账户创建新快照
 */
export async function autoSnapshotCheck(): Promise<{
  created: number;
  accounts: Array<{ accountId: string; accountName: string; balance: number }>;
}> {
  // 1. 获取设置
  const settings = await getBookkeepingSettings();
  
  if (!settings.auto_snapshot_enabled) {
    return { created: 0, accounts: [] };
  }
  
  const intervalDays = settings.snapshot_interval_days;
  const today = new Date();
  const cutoffDate = new Date(today);
  cutoffDate.setDate(cutoffDate.getDate() - intervalDays);
  const cutoffISO = cutoffDate.toISOString();
  
  // 2. 获取所有账户
  const { data: accountsData, error: accountsError } = await supabase
    .from('accounts')
    .select('id, name, currency')
    .order('created_at', { ascending: true });
  
  if (accountsError) throw accountsError;
  const accounts = accountsData || [];
  
  const createdSnapshots: Array<{ accountId: string; accountName: string; balance: number }> = [];
  
  // 3. 检查每个账户的最近快照
  for (const account of accounts) {
    // 获取该账户最近的快照
    const { data: lastSnapshotData, error: snapshotError } = await supabase
      .from('snapshots')
      .select('*')
      .eq('account_id', account.id)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (snapshotError) {
      console.error(`Error fetching snapshot for account ${account.id}:`, snapshotError);
      continue;
    }
    
    const lastSnapshot = lastSnapshotData as SnapshotRow | null;
    
    // 判断是否需要创建新快照
    const needsSnapshot = !lastSnapshot || new Date(lastSnapshot.date) < new Date(cutoffISO);
    
    if (needsSnapshot) {
      // 计算当前余额
      const balance = await calculateBalance(supabase, account.id, today);
      
      // 创建自动快照（使用 createSnapshot 函数，自动处理覆盖逻辑）
      try {
        await createSnapshot({
          account_id: account.id,
          balance,
          date: today.toISOString(),
          type: 'Auto',
        });
        
        createdSnapshots.push({
          accountId: account.id,
          accountName: account.name,
          balance,
        });
      } catch (insertError) {
        console.error(`Error creating snapshot for account ${account.id}:`, insertError);
        continue;
      }
    }
  }
  
  return {
    created: createdSnapshots.length,
    accounts: createdSnapshots,
  };
}

/**
 * 手动为所有账户创建快照
 */
export async function createManualSnapshotsForAllAccounts(): Promise<{
  created: number;
  accounts: Array<{ accountId: string; accountName: string; balance: number }>;
}> {
  const today = new Date();
  
  // 获取所有账户
  const { data: accountsData, error: accountsError } = await supabase
    .from('accounts')
    .select('id, name, currency')
    .order('created_at', { ascending: true });
  
  if (accountsError) throw accountsError;
  const accounts = accountsData || [];
  
  const createdSnapshots: Array<{ accountId: string; accountName: string; balance: number }> = [];
  
  for (const account of accounts) {
    // 计算当前余额
    const balance = await calculateBalance(supabase, account.id, today);
    
    // 创建手动快照（使用 createSnapshot 函数，自动处理覆盖逻辑）
    try {
      await createSnapshot({
        account_id: account.id,
        balance,
        date: today.toISOString(),
        type: 'Manual',
      });
      
      createdSnapshots.push({
        accountId: account.id,
        accountName: account.name,
        balance,
      });
    } catch (insertError) {
      console.error(`Error creating snapshot for account ${account.id}:`, insertError);
      continue;
    }
  }
  
  return {
    created: createdSnapshots.length,
    accounts: createdSnapshots,
  };
}

/**
 * 获取导出数据（流水和快照）
 */
export async function getExportData(options: {
  startDate?: string;
  endDate?: string;
  includeTransactions?: boolean;
  includeSnapshots?: boolean;
}): Promise<{
  transactions: Array<TransactionRow & { account_name: string; account_currency: string }>;
  snapshots: Array<SnapshotRow & { account_name: string; account_currency: string }>;
}> {
  const { startDate, endDate, includeTransactions = true, includeSnapshots = true } = options;
  
  let transactions: Array<TransactionRow & { account_name: string; account_currency: string }> = [];
  let snapshots: Array<SnapshotRow & { account_name: string; account_currency: string }> = [];
  
  if (includeTransactions) {
    let query = supabase
      .from('transactions')
      .select(`
        *,
        accounts (name, currency)
      `)
      .order('date', { ascending: true });
    
    if (startDate) {
      query = query.gte('date', startDate);
    }
    if (endDate) {
      query = query.lte('date', endDate);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    
    transactions = (data || []).map((tx: TransactionRow & { accounts: { name: string; currency: string } | null }) => ({
      ...tx,
      account_name: tx.accounts?.name || '',
      account_currency: tx.accounts?.currency || '',
    }));
  }
  
  if (includeSnapshots) {
    let query = supabase
      .from('snapshots')
      .select(`
        *,
        accounts (name, currency)
      `)
      .order('date', { ascending: true });
    
    if (startDate) {
      query = query.gte('date', startDate);
    }
    if (endDate) {
      query = query.lte('date', endDate);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    
    snapshots = (data || []).map((snap: SnapshotRow & { accounts: { name: string; currency: string } | null }) => ({
      ...snap,
      account_name: snap.accounts?.name || '',
      account_currency: snap.accounts?.currency || '',
    }));
  }
  
  return { transactions, snapshots };
}

/**
 * 全局刷新函数
 * 包含：周期性交易执行、自动快照检查
 */
export async function runGlobalRefresh(): Promise<{
  periodicTasks: { executed: number; tasks: Array<{ taskId: string; taskName: string; date: string }> };
  autoSnapshot: { created: number; accounts: Array<{ accountId: string; accountName: string; balance: number }> };
}> {
  // 1. 执行周期性交易
  const periodicResult = await executePeriodicTasks();
  
  // 2. 自动快照检查
  const snapshotResult = await autoSnapshotCheck();
  
  return {
    periodicTasks: periodicResult,
    autoSnapshot: snapshotResult,
  };
}

/**
 * 每日打卡入口
 * 首次打卡时执行全局刷新，后续仅刷新
 */
export async function handleDailyCheckin(): Promise<{
  isFirstCheckin: boolean;
  refreshResult: {
    periodicTasks: { executed: number; tasks: Array<{ taskId: string; taskName: string; date: string }> };
    autoSnapshot: { created: number; accounts: Array<{ accountId: string; accountName: string; balance: number }> };
  };
}> {
  // 1. 记录打卡
  const checkinResult = await recordCheckin();
  
  // 2. 执行全局刷新
  const refreshResult = await runGlobalRefresh();
  
  return {
    isFirstCheckin: !checkinResult.alreadyChecked,
    refreshResult,
  };
}

// --- Budget Plans ---

export interface BudgetPlanWithRecords extends BudgetPlanRow {
  records: BudgetPeriodRecordRow[];
}

/**
 * 获取所有预算计划（包含周期记录）
 */
export async function getBudgetPlans(status?: 'active' | 'expired' | 'paused'): Promise<BudgetPlanWithRecords[]> {
  let query = supabase
    .from('budget_plans')
    .select(`
      *,
      records:budget_period_records (*)
    `)
    .order('created_at', { ascending: false });
  
  if (status) {
    query = query.eq('status', status);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  
  return (data || []) as BudgetPlanWithRecords[];
}

/**
 * 获取单个预算计划
 */
export async function getBudgetPlan(id: string): Promise<BudgetPlanWithRecords | null> {
  const { data, error } = await supabase
    .from('budget_plans')
    .select(`
      *,
      records:budget_period_records (*)
    `)
    .eq('id', id)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data as BudgetPlanWithRecords | null;
}

/**
 * 获取总支出计划（只有一个）
 */
export async function getTotalBudgetPlan(): Promise<BudgetPlanWithRecords | null> {
  const { data, error } = await supabase
    .from('budget_plans')
    .select(`
      *,
      records:budget_period_records (*)
    `)
    .eq('plan_type', 'total')
    .neq('status', 'expired')
    .maybeSingle();
  
  if (error) throw error;
  return data as BudgetPlanWithRecords | null;
}

/**
 * 计算周期的开始和结束日期
 */
function calculatePeriodDates(startDate: string, period: 'weekly' | 'monthly', periodIndex: number): { start: string; end: string } {
  const start = new Date(startDate);
  
  if (period === 'weekly') {
    // 周度：每7天一个周期
    start.setDate(start.getDate() + (periodIndex - 1) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  } else {
    // 月度：自然月
    start.setMonth(start.getMonth() + (periodIndex - 1));
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    end.setDate(end.getDate() - 1);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  }
}

/**
 * 计算计划结束日期（12个周期后）
 */
function calculatePlanEndDate(startDate: string, period: 'weekly' | 'monthly'): string {
  const start = new Date(startDate);
  
  if (period === 'weekly') {
    // 12周 = 84天
    start.setDate(start.getDate() + 84 - 1);
  } else {
    // 12个月
    start.setMonth(start.getMonth() + 12);
    start.setDate(start.getDate() - 1);
  }
  
  return start.toISOString().split('T')[0];
}

export interface CreateBudgetPlanData {
  plan_type: 'category' | 'total';
  category_name?: string;
  period: 'weekly' | 'monthly';
  hard_limit: number;
  limit_currency?: string;
  soft_limit_enabled?: boolean;
  account_filter_mode?: 'all' | 'include' | 'exclude';
  account_filter_ids?: string[];
  included_categories?: string[];
  start_date: string;
}

/**
 * 创建预算计划
 */
export async function createBudgetPlan(data: CreateBudgetPlanData): Promise<BudgetPlanRow> {
  const endDate = calculatePlanEndDate(data.start_date, data.period);
  
  const { data: plan, error } = await supabase
    .from('budget_plans')
    .insert({
      plan_type: data.plan_type,
      category_name: data.category_name || null,
      period: data.period,
      hard_limit: data.hard_limit,
      limit_currency: data.limit_currency || 'CNY',
      soft_limit_enabled: data.soft_limit_enabled ?? true,
      status: 'active',
      account_filter_mode: data.account_filter_mode || 'all',
      account_filter_ids: data.account_filter_ids || null,
      start_date: data.start_date,
      end_date: endDate,
      included_categories: data.included_categories || null,
      round_number: 1,
    })
    .select()
    .single();
  
  if (error) throw error;
  
  const budgetPlan = plan as BudgetPlanRow;

  // 创建 12 个周期记录
  const periodRecords = [];
  for (let i = 1; i <= 12; i++) {
    const { start, end } = calculatePeriodDates(data.start_date, data.period, i);
    periodRecords.push({
      plan_id: budgetPlan.id,
      round_number: 1,
      period_index: i,
      period_start: start,
      period_end: end,
      hard_limit: data.hard_limit,
      soft_limit: null, // 前3个周期没有柔性约束
      indicator_status: 'pending' as const,
    });
  }
  
  const { error: recordsError } = await supabase
    .from('budget_period_records')
    .insert(periodRecords);
  
  if (recordsError) throw recordsError;
  
  return budgetPlan;
}

/**
 * 更新预算计划
 */
export async function updateBudgetPlan(
  id: string,
  data: Partial<Pick<BudgetPlanRow, 'hard_limit' | 'soft_limit_enabled' | 'account_filter_mode' | 'account_filter_ids' | 'included_categories' | 'status'>>
): Promise<void> {
  const { error } = await supabase
    .from('budget_plans')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  
  if (error) throw error;
  
  // 如果更新了刚性约束，同步更新未来周期的 hard_limit
  if (data.hard_limit !== undefined) {
    const today = new Date().toISOString().split('T')[0];
    await supabase
      .from('budget_period_records')
      .update({ hard_limit: data.hard_limit })
      .eq('plan_id', id)
      .gte('period_start', today);
  }
}

/**
 * 修改计划周期（会重置12周期进度）
 */
export async function changeBudgetPlanPeriod(
  id: string,
  newPeriod: 'weekly' | 'monthly',
  newStartDate: string
): Promise<void> {
  // 获取当前计划
  const { data: plan, error: fetchError } = await supabase
    .from('budget_plans')
    .select('*')
    .eq('id', id)
    .single();
  
  if (fetchError) throw fetchError;
  
  const budgetPlan = plan as BudgetPlanRow;

  const newEndDate = calculatePlanEndDate(newStartDate, newPeriod);
  const newRoundNumber = (budgetPlan.round_number || 1) + 1;
  
  // 更新计划
  const { error: updateError } = await supabase
    .from('budget_plans')
    .update({
      period: newPeriod,
      start_date: newStartDate,
      end_date: newEndDate,
      round_number: newRoundNumber,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  
  if (updateError) throw updateError;
  
  // 删除旧的周期记录
  await supabase
    .from('budget_period_records')
    .delete()
    .eq('plan_id', id)
    .eq('round_number', budgetPlan.round_number);
  
  // 创建新的 12 个周期记录
  const periodRecords = [];
  for (let i = 1; i <= 12; i++) {
    const { start, end } = calculatePeriodDates(newStartDate, newPeriod, i);
    periodRecords.push({
      plan_id: id,
      round_number: newRoundNumber,
      period_index: i,
      period_start: start,
      period_end: end,
      hard_limit: budgetPlan.hard_limit,
      soft_limit: null,
      indicator_status: 'pending' as const,
    });
  }
  
  const { error: recordsError } = await supabase
    .from('budget_period_records')
    .insert(periodRecords);
  
  if (recordsError) throw recordsError;
}

/**
 * 暂停/恢复预算计划
 */
export async function toggleBudgetPlanStatus(id: string, status: 'active' | 'paused'): Promise<void> {
  const { error } = await supabase
    .from('budget_plans')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  
  if (error) throw error;
}

/**
 * 再启动过期计划
 */
export async function restartBudgetPlan(
  id: string,
  options: {
    newHardLimit?: number;
    newStartDate?: string;
  } = {}
): Promise<void> {
  // 获取当前计划
  const { data: plan, error: fetchError } = await supabase
    .from('budget_plans')
    .select('*')
    .eq('id', id)
    .single();
  
  if (fetchError) throw fetchError;
  
  const budgetPlan = plan as BudgetPlanRow;

  const newStartDate = options.newStartDate || new Date().toISOString().split('T')[0];
  const newHardLimit = options.newHardLimit ?? budgetPlan.hard_limit;
  const newEndDate = calculatePlanEndDate(newStartDate, budgetPlan.period);
  const newRoundNumber = (budgetPlan.round_number || 1) + 1;
  
  // 更新计划
  const { error: updateError } = await supabase
    .from('budget_plans')
    .update({
      hard_limit: newHardLimit,
      start_date: newStartDate,
      end_date: newEndDate,
      round_number: newRoundNumber,
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  
  if (updateError) throw updateError;
  
  // 创建新的 12 个周期记录
  const periodRecords = [];
  for (let i = 1; i <= 12; i++) {
    const { start, end } = calculatePeriodDates(newStartDate, budgetPlan.period, i);
    periodRecords.push({
      plan_id: id,
      round_number: newRoundNumber,
      period_index: i,
      period_start: start,
      period_end: end,
      hard_limit: newHardLimit,
      soft_limit: null,
      indicator_status: 'pending' as const,
    });
  }
  
  const { error: recordsError } = await supabase
    .from('budget_period_records')
    .insert(periodRecords);
  
  if (recordsError) throw recordsError;
}

/**
 * 删除预算计划
 */
export async function deleteBudgetPlan(id: string): Promise<void> {
  const { error } = await supabase
    .from('budget_plans')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
}

// --- Currency Rates ---

/**
 * 获取所有汇率
 */
export async function getCurrencyRates(): Promise<CurrencyRateRow[]> {
  const { data, error } = await supabase
    .from('currency_rates')
    .select('*')
    .order('from_currency', { ascending: true });
  
  if (error) throw error;
  return (data || []) as CurrencyRateRow[];
}

/**
 * 获取指定汇率
 */
export async function getCurrencyRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;
  
  const { data, error } = await supabase
    .from('currency_rates')
    .select('rate')
    .eq('from_currency', from)
    .eq('to_currency', to)
    .maybeSingle();
  
  if (error) throw error;
  if (!data) return 1; // 如果没有汇率，返回 1
  
  return data.rate;
}

/**
 * 更新汇率
 */
export async function updateCurrencyRate(from: string, to: string, rate: number): Promise<void> {
  const { error } = await supabase
    .from('currency_rates')
    .upsert({
      from_currency: from,
      to_currency: to,
      rate,
      updated_at: new Date().toISOString(),
    });
  
  if (error) throw error;
}

// --- Budget Calculation ---

/**
 * 计算指定周期内某标签的消费金额
 */
export async function calculateCategorySpending(
  categoryName: string,
  startDate: string,
  endDate: string,
  targetCurrency: string,
  accountFilterMode: 'all' | 'include' | 'exclude' = 'all',
  accountFilterIds: string[] | null = null
): Promise<number> {
  let query = supabase
    .from('transactions')
    .select(`
      amount,
      accounts (currency)
    `)
    .eq('category', categoryName)
    .in('type', ['expense', 'transfer'])
    .gte('date', startDate)
    .lte('date', endDate)
    .lt('amount', 0); // 只计算支出（负数）
  
  // 账户筛选
  if (accountFilterMode === 'include' && accountFilterIds && accountFilterIds.length > 0) {
    query = query.in('account_id', accountFilterIds);
  } else if (accountFilterMode === 'exclude' && accountFilterIds && accountFilterIds.length > 0) {
    // Supabase 不直接支持 NOT IN，需要用其他方式
    // 这里简化处理：获取所有账户，排除指定的
    const { data: allAccounts } = await supabase.from('accounts').select('id');
    const includedIds = (allAccounts || [])
      .map(a => a.id)
      .filter(id => !accountFilterIds.includes(id));
    if (includedIds.length > 0) {
      query = query.in('account_id', includedIds);
    }
  }
  
  const { data, error } = await query;
  if (error) throw error;
  
  // 汇总金额（需要汇率转换）
  let total = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const tx of (data || []) as any[]) {
    const txCurrency = (tx.accounts as { currency: string } | null)?.currency || 'CNY';
    const rate = await getCurrencyRate(txCurrency, targetCurrency);
    total += Math.abs(tx.amount) * rate;
  }
  
  return total;
}

/**
 * 计算指定周期内总支出金额
 */
export async function calculateTotalSpending(
  includedCategories: string[] | null,
  startDate: string,
  endDate: string,
  targetCurrency: string,
  accountFilterMode: 'all' | 'include' | 'exclude' = 'all',
  accountFilterIds: string[] | null = null
): Promise<number> {
  let query = supabase
    .from('transactions')
    .select(`
      amount,
      accounts (currency)
    `)
    .in('type', ['expense', 'transfer'])
    .gte('date', startDate)
    .lte('date', endDate)
    .lt('amount', 0);
  
  // 标签筛选
  if (includedCategories && includedCategories.length > 0) {
    query = query.in('category', includedCategories);
  }
  
  // 账户筛选
  if (accountFilterMode === 'include' && accountFilterIds && accountFilterIds.length > 0) {
    query = query.in('account_id', accountFilterIds);
  } else if (accountFilterMode === 'exclude' && accountFilterIds && accountFilterIds.length > 0) {
    const { data: allAccounts } = await supabase.from('accounts').select('id');
    const includedIds = (allAccounts || [])
      .map(a => a.id)
      .filter(id => !accountFilterIds.includes(id));
    if (includedIds.length > 0) {
      query = query.in('account_id', includedIds);
    }
  }
  
  const { data, error } = await query;
  if (error) throw error;
  
  let total = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const tx of (data || []) as any[]) {
    const txCurrency = (tx.accounts as { currency: string } | null)?.currency || 'CNY';
    const rate = await getCurrencyRate(txCurrency, targetCurrency);
    total += Math.abs(tx.amount) * rate;
  }
  
  return total;
}

/**
 * 计算柔性约束（自然时间前3个周期的平均消费）
 * 
 * 例如：
 * - 月度计划，当前是4月 → 计算1月、2月、3月的实际消费平均值
 * - 周度计划，当前是第15周 → 计算第12、13、14周的实际消费平均值
 */
export async function calculateSoftLimit(
  plan: BudgetPlanRow,
  currentPeriodStart: string,
  currentPeriodEnd: string
): Promise<number | null> {
  // 计算前3个周期的时间范围
  const periodRanges: Array<{ start: string; end: string }> = [];
  const currentStart = new Date(currentPeriodStart);
  
  if (plan.period === 'monthly') {
    // 月度：往前推3个自然月
    for (let i = 1; i <= 3; i++) {
      const monthStart = new Date(currentStart);
      monthStart.setMonth(monthStart.getMonth() - i);
      monthStart.setDate(1);
      
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      monthEnd.setDate(0); // 上月最后一天
      
      periodRanges.push({
        start: monthStart.toISOString().split('T')[0],
        end: monthEnd.toISOString().split('T')[0],
      });
    }
  } else {
    // 周度：往前推3个自然周（7天）
    for (let i = 1; i <= 3; i++) {
      const weekStart = new Date(currentStart);
      weekStart.setDate(weekStart.getDate() - i * 7);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      periodRanges.push({
        start: weekStart.toISOString().split('T')[0],
        end: weekEnd.toISOString().split('T')[0],
      });
    }
  }
  
  // 计算每个周期的实际消费
  const amounts: number[] = [];
  
  for (const range of periodRanges) {
    let amount: number;
    if (plan.plan_type === 'total') {
      amount = await calculateTotalSpending(
        plan.included_categories,
        range.start,
        range.end,
        plan.limit_currency,
        plan.account_filter_mode,
        plan.account_filter_ids
      );
    } else {
      amount = await calculateCategorySpending(
        plan.category_name!,
        range.start,
        range.end,
        plan.limit_currency,
        plan.account_filter_mode,
        plan.account_filter_ids
      );
    }
    amounts.push(amount);
  }
  
  // 计算平均值
  const sum = amounts.reduce((acc, a) => acc + a, 0);
  return sum / 3;
}

/**
 * 判断指示灯状态
 */
export function determineIndicatorStatus(
  actualAmount: number,
  hardLimit: number,
  softLimit: number | null
): 'star' | 'green' | 'red' {
  // 刚性约束是底线
  if (actualAmount > hardLimit) {
    return 'red'; // 超过刚性约束 = 红灯
  }
  
  // 刚性达标的情况下，看柔性
  if (softLimit !== null && actualAmount <= softLimit) {
    return 'star'; // 同时低于柔性 = 星星
  }
  
  return 'green'; // 刚性达标但超过柔性 = 绿灯
}

/**
 * 更新预算周期记录（计算实际消费和状态）
 */
export async function updateBudgetPeriodRecord(recordId: string): Promise<void> {
  // 获取记录
  const { data: record, error: recordError } = await supabase
    .from('budget_period_records')
    .select('*, budget_plans (*)')
    .eq('id', recordId)
    .single();
  
  if (recordError) throw recordError;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const budgetRecord = record as any;
  const plan = budgetRecord.budget_plans as BudgetPlanRow;
  
  // 计算实际消费
  let actualAmount: number;
  if (plan.plan_type === 'total') {
    actualAmount = await calculateTotalSpending(
      plan.included_categories,
      budgetRecord.period_start,
      budgetRecord.period_end,
      plan.limit_currency,
      plan.account_filter_mode,
      plan.account_filter_ids
    );
  } else {
    actualAmount = await calculateCategorySpending(
      plan.category_name!,
      budgetRecord.period_start,
      budgetRecord.period_end,
      plan.limit_currency,
      plan.account_filter_mode,
      plan.account_filter_ids
    );
  }
  
  // 计算柔性约束（基于自然时间的前3个周期）
  let softLimit: number | null = null;
  if (plan.soft_limit_enabled) {
    softLimit = await calculateSoftLimit(plan, budgetRecord.period_start, budgetRecord.period_end);
  }
  
  // 判断状态
  const indicatorStatus = determineIndicatorStatus(actualAmount, budgetRecord.hard_limit, softLimit);
  
  // 更新记录
  const { error: updateError } = await supabase
    .from('budget_period_records')
    .update({
      actual_amount: actualAmount,
      soft_limit: softLimit,
      indicator_status: indicatorStatus,
    })
    .eq('id', recordId);
  
  if (updateError) throw updateError;
}

/**
 * 更新所有活跃计划的当前周期
 */
export async function updateAllActiveBudgetPeriods(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  
  // 获取所有活跃计划的当前周期记录
  const { data: records, error } = await supabase
    .from('budget_period_records')
    .select('id, plan_id, period_start, period_end')
    .lte('period_start', today)
    .gte('period_end', today);
  
  if (error) throw error;
  
  for (const record of (records || [])) {
    await updateBudgetPeriodRecord(record.id);
  }
}

/**
 * 检查并更新过期计划状态
 */
export async function checkExpiredBudgetPlans(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  
  const { error } = await supabase
    .from('budget_plans')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('end_date', today);
  
  if (error) throw error;
}

/**
 * 获取仪表盘预算数据
 */
export async function getDashboardBudgetData(): Promise<{
  plans: Array<{
    plan: BudgetPlanRow;
    currentPeriod: BudgetPeriodRecordRow | null;
    allRecords: BudgetPeriodRecordRow[];
  }>;
}> {
  const today = new Date().toISOString().split('T')[0];
  
  // 获取所有活跃计划
  const { data: plans, error } = await supabase
    .from('budget_plans')
    .select(`
      *,
      records:budget_period_records (*)
    `)
    .eq('status', 'active')
    .order('plan_type', { ascending: false }) // total 排在前面
    .order('created_at', { ascending: true });
  
  if (error) throw error;
  
  const result = [];
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const plan of (plans || []) as any[]) {
    const records = (plan.records || []) as BudgetPeriodRecordRow[];
    
    // 找到当前周期
    const currentPeriod = records.find(
      r => r.period_start <= today && r.period_end >= today
    ) || null;
    
    result.push({
      plan: plan as BudgetPlanRow,
      currentPeriod,
      allRecords: records.sort((a, b) => a.period_index - b.period_index),
    });
  }
  
  return { plans: result };
}
