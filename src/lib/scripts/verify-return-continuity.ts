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

  console.log('1. Fetching updated dev_return...');
  const newRows = await fetchAll(supabase, 'dev_return');
  console.log(`Updated dev_return row count: ${newRows.length}`);

  const backupPath = path.resolve(__dirname, 'backup-dev-return-20261108.json');
  const backupRows: any[] = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
  console.log(`Backup dev_return row count: ${backupRows.length}`);

  // Check <합계> for all dates
  console.log('2. Checking <합계> invariants across all dates...');
  const backupSums = new Map<string, any>();
  for (const r of backupRows) {
    if (r.자산군 === '<합계>') backupSums.set(r.기준일, r);
  }

  let sumMismatchCount = 0;
  for (const r of newRows) {
    if (r.자산군 === '<합계>') {
      const b = backupSums.get(r.기준일);
      if (!b) {
        console.warn(`Date ${r.기준일} not found in backup!`);
        sumMismatchCount++;
      } else if (Math.abs(r.평가금액 - b.평가금액) > 0.01 || Math.abs(r.총손익 - b.총손익) > 0.01) {
        console.error(`Mismatch on ${r.기준일}: New (${r.평가금액}, ${r.총손익}) vs Backup (${b.평가금액}, ${b.총손익})`);
        sumMismatchCount++;
      }
    }
  }
  console.log(`<합계> invariant check: ${sumMismatchCount === 0 ? 'PERFECT! (0 mismatches across all dates)' : `FAILED with ${sumMismatchCount} mismatches!`}`);

  // Check continuity around the transition (2026-10-25 ~ 2026-11-08)
  console.log('\n3. Checking continuity around transition (2026-10-25 ~ 2026-11-08)...');
  const testDates = Array.from(new Set(newRows.map((r) => r.기준일)))
    .filter((d) => d >= '2026-10-25')
    .sort();

  const continuityData = testDates.map((d) => {
    const dRows = newRows.filter((r) => r.기준일 === d);
    const stockItem = dRows.find((r) => r.자산군 === '주식' && r.세부자산군 === '선진국' && r.세부자산군2 === '종목');
    const rp = dRows.find((r) => r.자산군 === '현금성' && r.세부자산군 === '금융상품' && r.세부자산군2 === '외화상품');
    const cash = dRows.find((r) => r.자산군 === '현금성' && r.세부자산군 === '현금' && r.세부자산군2 === '외환');
    const sum = dRows.find((r) => r.자산군 === '<합계>');
    return {
      일자: d,
      '선진국종목 평가': stockItem?.평가금액,
      '선진국종목 손익': stockItem?.총손익,
      '외화상품 평가': rp?.평가금액,
      '외화상품 손익': rp?.총손익,
      '외환 평가': cash?.평가금액,
      '외환 손익': cash?.총손익,
      '합계 평가': Math.round(sum?.평가금액 || 0),
    };
  });

  console.table(continuityData);

  // Check presence of 외화상품 and 외환 across 2026
  const dates2026 = Array.from(new Set(newRows.map((r) => r.기준일))).filter((d) => d >= '2025-12-31');
  const rpCount = dates2026.filter((d) => newRows.some((r) => r.기준일 === d && r.자산군 === '현금성' && r.세부자산군 === '금융상품' && r.세부자산군2 === '외화상품')).length;
  const cashCount = dates2026.filter((d) => newRows.some((r) => r.기준일 === d && r.자산군 === '현금성' && r.세부자산군 === '현금' && r.세부자산군2 === '외환')).length;

  console.log(`2025-12-31 이후 전체 날짜 수: ${dates2026.length}일`);
  console.log(`외화상품(외화RP) 존재하는 날짜 수: ${rpCount}일 / ${dates2026.length}일`);
  console.log(`외환(외화예수금) 존재하는 날짜 수: ${cashCount}일 / ${dates2026.length}일`);
}

main().catch(console.error);
