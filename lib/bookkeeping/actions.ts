import { supabase } from '@/lib/supabase';
import { calculateBalance } from './logic';
import { AccountType, Currency } from '@/lib/constants';
import { Database, Json, SnapshotRow, TransactionRow, ReconciliationIssueRow, PeriodicTaskRow, DailyCheckinRow } from '@/types/database';

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
