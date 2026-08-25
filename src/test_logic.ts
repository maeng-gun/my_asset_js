import { getDailyTrading, getBalanceSheet } from './lib/engine/bookkeeping';
import { Client } from 'pg';

const client = new Client({
  host: 'aws-1-ap-southeast-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.ldgdkaydtqywiqyywgoq',
  password: 'karekano85!@',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const { rows: assets } = await client.query("SELECT * FROM assets");
  const { rows: assets_daily } = await client.query("SELECT * FROM assets_daily ORDER BY 행번호 ASC");

  const dailyAssets = getDailyTrading(assets as any, assets_daily as any);
  const bsAssets = getBalanceSheet('assets', dailyAssets, assets as any);
  
  const kospi = bsAssets.find(r => r.종목명 === '코스피' && r.계좌 === '한투' && r.거래일자 === '2026-08-25');
  console.log('KOSPI on 2026-08-25:', kospi);

  const hantuCash = bsAssets.find(r => r.종목명 === '한투예수금' && r.거래일자 === '2026-08-25');
  console.log('Hantu Cash on 2026-08-25:', hantuCash);

  await client.end();
}
run();
