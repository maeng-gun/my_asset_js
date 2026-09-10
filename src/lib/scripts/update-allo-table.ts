import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env.local
const envPath = path.resolve('C:/Users/infomax/.gemini/antigravity/worktrees/my_asset_js/update_portfolio_analytics_dashboard', '.env.local');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log('Fetching allo_table...');
  const { data, error } = await supabase.from('allo_table').select('*');
  if (error) {
    console.error('Error fetching allo_table:', error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No data found in allo_table');
    return;
  }

  console.log(`Found ${data.length} rows.`);

  for (const row of data) {
    const sum = row['국내주식'] + row['해외주식'] + row['만기보유채권'] + row['시장형채권'] + row['실물자산'] + row['인컴자산'];
    
    if (sum > 1.5) {
      console.log(`Row ${row['구분']} (${row['배분일자']}) seems to be already in percentage (sum: ${sum}). Skipping...`);
      continue;
    }

    console.log(`Updating row ${row['구분']} (${row['배분일자']}) - multiplying by 100...`);
    const { error: updateError } = await supabase
      .from('allo_table')
      .update({
        '국내주식': Number((row['국내주식'] * 100).toFixed(2)),
        '해외주식': Number((row['해외주식'] * 100).toFixed(2)),
        '만기보유채권': Number((row['만기보유채권'] * 100).toFixed(2)),
        '시장형채권': Number((row['시장형채권'] * 100).toFixed(2)),
        '실물자산': Number((row['실물자산'] * 100).toFixed(2)),
        '인컴자산': Number((row['인컴자산'] * 100).toFixed(2)),
      })
      .eq('행번호', row['행번호']);

    if (updateError) {
      console.error(`Error updating row ${row['행번호']}:`, updateError);
    } else {
      console.log(`Row ${row['행번호']} updated successfully.`);
    }
  }
  
  console.log('Migration complete.');
}

main();
