/**
 * [性质]: [核心] 复式记账核心算法
 * [Input]: Supabase Client
 * [Output]: calculateBalance (余额计算函数)
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';

/**
 * 核心算账函数：计算指定账户在指定日期的理论余额
 * 
 * 新架构算法：
 * 1. 找到 targetDate 之前(或当天) 最近的一个 snapshot
 * 2. 如果有 snapshot，以它为基准；如果没有，基准为 0
 * 3. 对于资产/负债类账户：
 *    - 作为 to_account 的交易：增加余额（资金流入）
 *    - 作为 from_account 的交易：减少余额（资金流出）
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

  // 2. 查找流入（作为 to_account）
  const { data: inflows, error: inflowError } = await supabase
    .from('transactions')
    .select('amount, to_amount')
    .eq('to_account_id', accountId)
    .gt('date', startDate)
    .lte('date', targetISO);

  if (inflowError) {
    console.error('Error fetching inflows:', inflowError);
    throw inflowError;
  }

  // 3. 查找流出（作为 from_account）
  const { data: outflows, error: outflowError } = await supabase
    .from('transactions')
    .select('amount, from_amount')
    .eq('from_account_id', accountId)
    .gt('date', startDate)
    .lte('date', targetISO);

  if (outflowError) {
    console.error('Error fetching outflows:', outflowError);
    throw outflowError;
  }

  // 计算流入总额（优先使用 to_amount，否则使用 amount）
  const totalInflow = (inflows || []).reduce((sum, tx) => {
    return sum + Number(tx.to_amount ?? tx.amount);
  }, 0);

  // 计算流出总额（优先使用 from_amount，否则使用 amount）
  const totalOutflow = (outflows || []).reduce((sum, tx) => {
    return sum + Number(tx.from_amount ?? tx.amount);
  }, 0);

  const finalBalance = baseBalance + totalInflow - totalOutflow;

  // DEBUG LOGGING
  console.log(`[Balance Calc] Account: ${accountId}`);
  console.log(`Target Date: ${targetISO}`);
  console.log(`Base Snapshot: ${baseBalance} (Date: ${startDate})`);
  console.log(`Inflows: ${inflows?.length}, Total: ${totalInflow}`);
  console.log(`Outflows: ${outflows?.length}, Total: ${totalOutflow}`);
  console.log(`Final Balance: ${finalBalance}`);

  return finalBalance;
}
