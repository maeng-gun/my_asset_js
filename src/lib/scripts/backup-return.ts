import { createAdminClient } from '../supabase/admin';
import * as fs from 'fs';
import * as path from 'path';

async function fetchAll(supabase: any, table: string, select = '*') {
  let all: any[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + step - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < step) break;
    from += step;
  }
  return all;
}

async function main() {
  const supabase = createAdminClient();
  console.log('Fetching all dev_return rows for backup...');
  const rows = await fetchAll(supabase, 'dev_return');
  console.log(`Fetched ${rows.length} rows.`);

  const backupPath = path.resolve(__dirname, 'backup-dev-return-20261108.json');
  fs.writeFileSync(backupPath, JSON.stringify(rows, null, 2), 'utf-8');
  console.log(`Saved backup to ${backupPath} (${fs.statSync(backupPath).size} bytes).`);
}

main().catch(console.error);
