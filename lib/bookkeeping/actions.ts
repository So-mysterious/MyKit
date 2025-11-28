import { supabase } from '@/lib/supabase';
import { calculateBalance } from './logic';
import { AccountType, Currency } from '@/lib/constants';
import { Database, Json } from '@/types/database';

// ... (Existing Accounts functions) ...
export async function getAccountsWithBalance() {
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!accounts) return [];

  const accountsWithBalance = await Promise.all(
    accounts.map(async (acc) => {
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
    query = query.eq('type', filters.type);
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

export async function createSnapshot(data: { account_id: string; balance: number; date: string }) {
  const { error } = await supabase.from('snapshots').insert({
    account_id: data.account_id,
    balance: data.balance,
    date: data.date,
    type: 'Manual'
  });
  if (error) throw error;
}

export async function getSnapshotsByIds(ids: string[]) {
  if (!ids.length) return [];
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return [];

  const { data, error } = await supabase
    .from('snapshots')
    .select('*')
    .in('id', unique as string[]);

  if (error) throw error;
  return data || [];
}

// --- Reconciliation ---

type SnapshotRow = Database['public']['Tables']['snapshots']['Row'];
type TransactionRow = Database['public']['Tables']['transactions']['Row'];
type ReconciliationIssueRow = Database['public']['Tables']['reconciliation_issues']['Row'];
type TagRow = Database['public']['Tables']['bookkeeping_tags']['Row'];
type BookkeepingSettingsRow = Database['public']['Tables']['bookkeeping_settings']['Row'];
export type BookkeepingKind = 'expense' | 'income' | 'transfer';

const RECON_TOLERANCE = 0.01;

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
  const { data: snapshots, error: snapshotError } = await supabase
    .from('snapshots')
    .select('*')
    .eq('account_id', accountId)
    .order('date', { ascending: true });

  if (snapshotError) throw snapshotError;

  await supabase.from('reconciliation_issues').delete().eq('account_id', accountId);

  if (!snapshots || snapshots.length < 2) {
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

  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('account_id', accountId)
    .gt('date', firstDate)
    .lte('date', lastDate)
    .order('date', { ascending: true });

  if (txError) throw txError;

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

    if (Math.abs(diff) > RECON_TOLERANCE) {
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

type PeriodicTaskRow = Database['public']['Tables']['periodic_tasks']['Row'];

export interface PeriodicTaskWithAccount extends PeriodicTaskRow {
  accounts: { name: string; currency: string } | null;
}

export async function getPeriodicTasks() {
  const { data, error } = await supabase
    .from('periodic_tasks')
    .select(`
      *,
      accounts (
        name,
        currency
      )
    `)
    .order('next_run_date', { ascending: true });

  if (error) throw error;
  return (data || []) as PeriodicTaskWithAccount[];
}

export interface CreatePeriodicTaskData {
  account_id: string;
  amount: number;
  category: string;
  description?: string;
  frequency: string;
  next_run_date: string;
}

export async function createPeriodicTask(data: CreatePeriodicTaskData) {
  const { error } = await supabase.from('periodic_tasks').insert({
    account_id: data.account_id,
    amount: data.amount,
    category: data.category,
    description: data.description || null,
    frequency: data.frequency,
    next_run_date: data.next_run_date,
    is_active: true,
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
