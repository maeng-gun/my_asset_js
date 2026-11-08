import { createAdminClient } from '../supabase/admin';
import { fastRecalculatePortfolio } from '../engine/portfolio-runner';
import { buildAssetProfitData } from '../engine/analytics';

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

  console.log('1. Updating dev_assets 기초평가손익 for BLDO_KOIN to -15539...');
  const { error: assetErr } = await supabase
    .from('dev_assets')
    .update({ 기초평가손익: -15539 })
    .eq('계좌', '불리오')
    .eq('종목코드', 'BLDO_KOIN');

  if (assetErr) throw assetErr;
  console.log('dev_assets updated.');

  console.log('2. Fetching dev_return rows...');
  const returnRows = await fetchAll(supabase, 'dev_return');
  console.log(`Loaded ${returnRows.length} rows.`);

  const DIFF = 732059;
  const targetDates = Array.from(
    new Set(
      returnRows
        .map((r) => r.기준일.substring(0, 10))
        .filter((d) => d.startsWith('2026-') && d <= '2026-11-07')
    )
  );

  console.log(`3. Adjusting ${targetDates.length} dates in 2026 (2026-01-01 ~ 2026-11-07)...`);
  const updates: any[] = [];

  for (const date of targetDates) {
    const dayRows = returnRows.filter((r) => r.기준일.substring(0, 10) === date);

    // Cash side: +DIFF
    const fxCash = dayRows.find(
      (r) => r.자산군 === '현금성' && r.세부자산군 === '현금' && r.세부자산군2 === '외환'
    );
    if (fxCash) {
      fxCash.총손익 = Math.round((fxCash.총손익 || 0) + DIFF);
      updates.push(fxCash);
    }

    const cashSub = dayRows.find(
      (r) => r.자산군 === '현금성' && r.세부자산군 === '현금' && !r.세부자산군2
    );
    if (cashSub) {
      cashSub.총손익 = Math.round((cashSub.총손익 || 0) + DIFF);
      updates.push(cashSub);
    }

    const cashTotal = dayRows.find(
      (r) => r.자산군 === '현금성' && !r.세부자산군 && !r.세부자산군2
    );
    if (cashTotal) {
      cashTotal.총손익 = Math.round((cashTotal.총손익 || 0) + DIFF);
      updates.push(cashTotal);
    }

    // Stock side: -DIFF
    const stockItem = dayRows.find(
      (r) => r.자산군 === '주식' && r.세부자산군 === '선진국' && r.세부자산군2 === '종목'
    );
    if (stockItem) {
      stockItem.총손익 = Math.round((stockItem.총손익 || 0) - DIFF);
      updates.push(stockItem);
    }

    const stockSub = dayRows.find(
      (r) => r.자산군 === '주식' && r.세부자산군 === '선진국' && !r.세부자산군2
    );
    if (stockSub) {
      stockSub.총손익 = Math.round((stockSub.총손익 || 0) - DIFF);
      updates.push(stockSub);
    }

    const stockTotal = dayRows.find(
      (r) => r.자산군 === '주식' && !r.세부자산군 && !r.세부자산군2
    );
    if (stockTotal) {
      stockTotal.총손익 = Math.round((stockTotal.총손익 || 0) - DIFF);
      updates.push(stockTotal);
    }
  }

  console.log(`Updating ${updates.length} rows in dev_return in batches...`);
  const batchSize = 100;
  for (let i = 0; i < updates.length; i += batchSize) {
    const chunk = updates.slice(i, i + batchSize);
    const { error } = await supabase.from('dev_return').upsert(chunk);
    if (error) {
      console.error('Upsert error:', error);
      throw error;
    }
  }
  console.log('dev_return updates completed.');

  console.log('4. Running fastRecalculatePortfolio for today (2026-11-08)...');
  await fastRecalculatePortfolio();
  console.log('fastRecalculatePortfolio completed.');

  console.log('5. Verifying <합계> invariance and continuity...');
  const updatedRows = await fetchAll(supabase, 'dev_return');

  // Verify <합계> vs original
  const prodRows = await fetchAll(supabase, 'return');
  const allProdDates = Array.from(new Set(prodRows.map((r) => r.기준일.substring(0, 10))));

  let maxDrift = 0;
  for (const date of allProdDates) {
    const pSum = prodRows.find((r) => r.기준일.substring(0, 10) === date && r.자산군 === '<합계>');
    const dSum = updatedRows.find((r) => r.기준일.substring(0, 10) === date && r.자산군 === '<합계>');
    if (pSum && dSum) {
      const drift = Math.abs(dSum.총손익 - pSum.총손익);
      if (drift > maxDrift) maxDrift = drift;
    }
  }
  console.log(`Max <합계> drift across all ${allProdDates.length} dates: ${maxDrift}`);

  // Check 2026-01-01
  const d0101 = updatedRows.filter((r) => r.기준일.substring(0, 10) === '2026-01-01');
  const cash0101 = d0101.find((r) => r.자산군 === '현금성' && !r.세부자산군 && !r.세부자산군2);
  const fx0101 = d0101.find((r) => r.자산군 === '현금성' && r.세부자산군 === '현금' && r.세부자산군2 === '외환');
  const stock0101 = d0101.find((r) => r.자산군 === '주식' && r.세부자산군 === '선진국' && r.세부자산군2 === '종목');

  console.log('--- 2026-01-01 Status ---');
  console.log(`현금성 총손익: ${cash0101?.총손익} (${Math.round((cash0101?.총손익 || 0) / 10000)}만원)`);
  console.log(`외환 총손익: ${fx0101?.총손익}`);
  console.log(`선진국 종목 총손익: ${stock0101?.총손익} (${Math.round((stock0101?.총손익 || 0) / 10000)}만원)`);

  // Check recent trend
  const trendDates = ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
  console.log('--- Recent 현금성 & 외환 Trend ---');
  for (const td of trendDates) {
    const dRows = updatedRows.filter((r) => r.기준일.substring(0, 10) === td);
    const c = dRows.find((r) => r.자산군 === '현금성' && !r.세부자산군 && !r.세부자산군2);
    const f = dRows.find((r) => r.자산군 === '현금성' && r.세부자산군 === '현금' && r.세부자산군2 === '외환');
    console.log(`${td} 현금성 총손익: ${c?.총손익} (${Math.round((c?.총손익 || 0) / 10000)}만원), 외환: ${f?.총손익}`);
  }

  // Check buildAssetProfitData for chart
  const assetProfit = buildAssetProfitData(updatedRows, '2025-12-31', '2026-11-08');
  console.log('--- Chart assetProfit.현금성 first 5 & last 5 ---');
  console.log(assetProfit.현금성?.slice(0, 5));
  console.log(assetProfit.현금성?.slice(-5));
}

main().catch(console.error);
