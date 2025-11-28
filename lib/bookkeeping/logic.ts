import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';

/**
 * 核心算账函数：计算指定账户在指定日期的理论余额
 * 算法：
 * 1. 找到 targetDate 之前(或当天) 最近的一个 snapshot
 * 2. 如果有 snapshot，以它为基准；如果没有，基准为 0
 * 3. 累加 snapshot.date 之后 到 targetDate (含) 的所有 transaction.amount
 */
export async function calculateBalance(
  supabase: SupabaseClient<Database>,
  accountId: string,
  targetDate: Date = new Date()
): Promise<number> {
  const targetISO = targetDate.toISOString();

  // 1. 查找最近的快照
  const { data: snapshots, error: snapError } = await supabase
    .from('snapshots')
    .select('balance, date')
    .eq('account_id', accountId)
    .lte('date', targetISO) // date <= targetDate
    .order('date', { ascending: false })
    .limit(1);

  if (snapError) {
    console.error('Error fetching snapshots:', snapError);
    throw snapError;
  }

  let baseBalance = 0;
  let startDate = '1970-01-01T00:00:00.000Z'; // 默认从宇宙大爆炸开始查

  if (snapshots && snapshots.length > 0) {
    baseBalance = snapshots[0].balance;
    startDate = snapshots[0].date;
  }

  // 2. 累加此后的流水
  // 注意：需要查找 date > snapshot_date AND date <= target_date
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('amount, date, category') // Select more for debugging
    .eq('account_id', accountId)
    .gt('date', startDate) // 严格大于快照时间
    .lte('date', targetISO); // 小于等于目标时间

  if (txError) {
    console.error('Error fetching transactions:', txError);
    throw txError;
  }

  const totalFlow = transactions?.reduce((sum, tx) => sum + tx.amount, 0) || 0;

  // DEBUG LOGGING
  console.log(`[Balance Calc] Account: ${accountId}`);
  console.log(`Target Date: ${targetISO}`);
  console.log(`Base Snapshot: ${baseBalance} (Date: ${startDate})`);
  console.log(`Transactions found: ${transactions?.length}`, transactions);
  console.log(`Total Flow: ${totalFlow}`);
  console.log(`Final Balance: ${baseBalance + totalFlow}`);

  return baseBalance + totalFlow;
}
