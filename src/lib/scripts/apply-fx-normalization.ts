import { createAdminClient } from '../supabase/admin';
import { fastRecalculatePortfolio } from '../engine/portfolio-runner';

async function fetchAll(supabase: any, table: string) {
  let all: any[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data } = await supabase.from(table).select('*').range(from, from + step - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < step) break;
    from += step;
  }
  return all;
}

async function main() {
  const supabase = createAdminClient();
  console.log('1. Fetching current dev_return rows...');
  const returnRows = await fetchAll(supabase, 'dev_return');
  console.log(`Loaded ${returnRows.length} rows.`);

  const LAST_EVAL_PROFIT = 716520;
  const targetDates = Array.from(
    new Set(returnRows.map((r) => r.기준일))
  ).filter((d) => d >= '2026-01-01' && d <= '2026-11-06');

  console.log(`2. Normalizing 2026 past dates (${targetDates[0]} ~ ${targetDates[targetDates.length - 1]}, total: ${targetDates.length} dates)...`);

  const rowsToUpdate: any[] = [];

  for (const date of targetDates) {
    const dateRows = returnRows.filter((r) => r.기준일 === date);

    // Cash items
    const fxCurItem = dateRows.find((r) => r.자산군 === '현금성' && r.세부자산군 === '현금' && r.세부자산군2 === '외환');
    if (fxCurItem) rowsToUpdate.push({ ...fxCurItem, 총손익: fxCurItem.총손익 - LAST_EVAL_PROFIT });

    const cashCur = dateRows.find((r) => r.자산군 === '현금성' && r.세부자산군 === '현금' && !r.세부자산군2);
    if (cashCur) rowsToUpdate.push({ ...cashCur, 총손익: cashCur.총손익 - LAST_EVAL_PROFIT });

    const cashTotal = dateRows.find((r) => r.자산군 === '현금성' && !r.세부자산군 && !r.세부자산군2);
    if (cashTotal) rowsToUpdate.push({ ...cashTotal, 총손익: cashTotal.총손익 - LAST_EVAL_PROFIT });

    // Stock items
    const stockItem = dateRows.find((r) => r.자산군 === '주식' && r.세부자산군 === '선진국' && r.세부자산군2 === '종목');
    if (stockItem) rowsToUpdate.push({ ...stockItem, 총손익: stockItem.총손익 + LAST_EVAL_PROFIT });

    const stockDev = dateRows.find((r) => r.자산군 === '주식' && r.세부자산군 === '선진국' && !r.세부자산군2);
    if (stockDev) rowsToUpdate.push({ ...stockDev, 총손익: stockDev.총손익 + LAST_EVAL_PROFIT });

    const stockTotal = dateRows.find((r) => r.자산군 === '주식' && !r.세부자산군 && !r.세부자산군2);
    if (stockTotal) rowsToUpdate.push({ ...stockTotal, 총손익: stockTotal.총손익 + LAST_EVAL_PROFIT });
  }

  console.log(`Prepared ${rowsToUpdate.length} rows to update across ${targetDates.length} dates.`);

  // Upsert in batches of 200
  const batchSize = 200;
  for (let i = 0; i < rowsToUpdate.length; i += batchSize) {
    const batch = rowsToUpdate.slice(i, i + batchSize);
    const { error } = await supabase.from('dev_return').upsert(batch, {
      onConflict: '기준일,자산군,세부자산군,세부자산군2',
    });
    if (error) {
      console.error(`Error updating batch at index ${i}:`, error);
      throw error;
    }
  }
  console.log('Successfully updated 2026 past dates.');

  // 3. For 2026-11-07: Fetch normalized 2026-11-06 rows and replace 2026-11-07
  console.log('3. Normalizing 2026-11-07 (Saturday) snapshot...');
  const { data: rows1106 } = await supabase.from('dev_return').select('*').eq('기준일', '2026-11-06');
  if (!rows1106 || rows1106.length === 0) {
    throw new Error('Failed to load 2026-11-06 rows.');
  }

  // Delete existing 2026-11-07 rows
  const { error: delErr } = await supabase.from('dev_return').delete().eq('기준일', '2026-11-07');
  if (delErr) {
    console.error('Error deleting 2026-11-07 rows:', delErr);
    throw delErr;
  }

  const rows1107New = rows1106.map((r) => ({
    ...r,
    기준일: '2026-11-07',
  }));

  const { error: insErr } = await supabase.from('dev_return').insert(rows1107New);
  if (insErr) {
    console.error('Error inserting new 2026-11-07 rows:', insErr);
    throw insErr;
  }
  console.log(`Successfully replaced 2026-11-07 with ${rows1107New.length} normalized rows.`);

  // 4. Re-run fastRecalculatePortfolio to keep today's 2026-11-08 snapshot in sync
  console.log('4. Running fastRecalculatePortfolio() for today (2026-11-08)...');
  const recalcResult = await fastRecalculatePortfolio();
  console.log('Recalculate success:', recalcResult.success);

  console.log('\n=== All Done! FX Normalization complete. ===');
}

main().catch(console.error);
