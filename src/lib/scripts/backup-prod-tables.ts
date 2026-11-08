import { createAdminClient } from '../supabase/admin';
import * as fs from 'fs';
import * as path from 'path';

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

async function main() {
  const supabase = createAdminClient();
  const backupDir = path.resolve(process.cwd(), 'supabase/backups/prod_pre_promotion_20261108');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const tablesToBackup = ['assets', 'assets_daily', 'return', 'latest_portfolio_summary', 'holdings', 'eval_profit'];

  console.log('=== Starting Production Tables Backup ===');
  for (const table of tablesToBackup) {
    console.log(`Backing up ${table}...`);
    const rows = await fetchAll(supabase, table);
    const filePath = path.join(backupDir, `${table}.json`);
    fs.writeFileSync(filePath, JSON.stringify(rows, null, 2), 'utf-8');
    console.log(`Saved ${table}: ${rows.length} rows to ${filePath}`);
  }
  console.log('=== Backup Complete ===');
}

main().catch(console.error);
