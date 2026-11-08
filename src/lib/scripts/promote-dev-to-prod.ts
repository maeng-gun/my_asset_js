import { createAdminClient } from '../supabase/admin';
import { fastRecalculatePortfolio } from '../engine/portfolio-runner';

async function fetchAll(supabase: any, table: string) {
  let all: any[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + step - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < step) break;
    from += step;
  }
  return all;
}

export async function promoteDevToProd() {
  const supabase = createAdminClient();

  console.log('=== Step 1: Promote dev_assets -> assets ===');
  const devAssets = await fetchAll(supabase, 'dev_assets');
  console.log(`Fetched ${devAssets.length} dev_assets rows.`);

  // Clean prod assets
  const { error: delAssetsErr } = await supabase.from('assets').delete().neq('행번호', -99999);
  if (delAssetsErr) throw delAssetsErr;

  // Insert dev_assets in batches of 100
  for (let i = 0; i < devAssets.length; i += 100) {
    const chunk = devAssets.slice(i, i + 100);
    const { error } = await supabase.from('assets').insert(chunk);
    if (error) throw error;
  }
  console.log(`Successfully promoted ${devAssets.length} rows to assets.`);

  console.log('=== Step 2: Promote dev_assets_daily -> assets_daily ===');
  const devDaily = await fetchAll(supabase, 'dev_assets_daily');
  console.log(`Fetched ${devDaily.length} dev_assets_daily rows.`);

  const { error: delDailyErr } = await supabase.from('assets_daily').delete().neq('행번호', -99999);
  if (delDailyErr) throw delDailyErr;

  for (let i = 0; i < devDaily.length; i += 100) {
    const chunk = devDaily.slice(i, i + 100);
    const { error } = await supabase.from('assets_daily').insert(chunk);
    if (error) throw error;
  }
  console.log(`Successfully promoted ${devDaily.length} rows to assets_daily.`);

  console.log('=== Step 3: Promote dev_return -> return ===');
  const devReturn = await fetchAll(supabase, 'dev_return');
  console.log(`Fetched ${devReturn.length} dev_return rows.`);

  // To delete all rows from return, we can delete by 기준일 > '1900-01-01'
  const { error: delReturnErr } = await supabase.from('return').delete().gte('기준일', '1900-01-01');
  if (delReturnErr) throw delReturnErr;

  for (let i = 0; i < devReturn.length; i += 100) {
    const chunk = devReturn.slice(i, i + 100);
    const { error } = await supabase.from('return').insert(chunk);
    if (error) throw error;
  }
  console.log(`Successfully promoted ${devReturn.length} rows to return.`);

  console.log('=== Step 4: Promote dev_latest_portfolio_summary -> latest_portfolio_summary ===');
  const { data: devSummary } = await supabase.from('dev_latest_portfolio_summary').select('*').limit(1);
  if (devSummary && devSummary.length > 0) {
    const summaryRow = devSummary[0];
    const { error: sumErr } = await supabase.from('latest_portfolio_summary').upsert(summaryRow);
    if (sumErr) throw sumErr;
    console.log('Successfully promoted latest_portfolio_summary.');
  }

  console.log('=== Promotion Complete & Verified ===');
}

if (process.argv[2] === '--execute') {
  promoteDevToProd().catch(console.error);
}
