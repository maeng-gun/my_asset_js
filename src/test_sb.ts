import { createAdminClient } from './lib/supabase/admin';
import { fetchAll } from './lib/supabase/utils';

async function run() {
  const supabase = createAdminClient();
  console.log('Fetching assets_daily...');
  const { data, error } = await fetchAll(supabase, 'assets_daily', '행번호');
  console.log('Total rows:', data ? data.length : 0);
  console.log('Error:', error);
}
run();
