import { createAdminClient } from '../supabase/admin';
import { getDailyTrading, getBalanceSheet } from '../engine/bookkeeping';
import YahooFinance from 'yahoo-finance2';
import { format } from 'date-fns';

const yf = new YahooFinance({ suppressNotices: ['ripHistorical'] });

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

  console.log('1. Loading database tables...');
  const [assetsRaw, assetsDailyRaw, returnRaw] = await Promise.all([
    fetchAll(supabase, 'dev_assets'),
    fetchAll(supabase, 'dev_assets_daily'),
    fetchAll(supabase, 'dev_return'),
  ]);

  console.log(`Loaded assets: ${assetsRaw.length}, daily trades: ${assetsDailyRaw.length}, return rows: ${returnRaw.length}`);

  console.log('2. Computing daily trading & balance sheet...');
  const dailyAssets = getDailyTrading(assetsRaw, assetsDailyRaw);
  const bsAssets = getBalanceSheet(dailyAssets, assetsRaw);

  console.log('3. Fetching historical FX rates from Yahoo Finance...');
  const usdQuotes = await yf.historical('USDKRW=X', { period1: '2025-12-01', period2: '2026-11-09', interval: '1d' });
  const jpyQuotes = await yf.historical('JPYKRW=X', { period1: '2025-12-01', period2: '2026-11-09', interval: '1d' });

  const usdMap = new Map<string, number>();
  for (const q of usdQuotes) usdMap.set(format(q.date, 'yyyy-MM-dd'), Number(((q.close ?? q.adjClose) || 0).toFixed(4)));
  const jpyMap = new Map<string, number>();
  for (const q of jpyQuotes) jpyMap.set(format(q.date, 'yyyy-MM-dd'), Number(((q.close ?? q.adjClose) || 0).toFixed(4)));

  const sortedUsdDates = Array.from(usdMap.keys()).sort();
  const getRate = (date: string, cur: 'USD' | 'JPY') => {
    const m = cur === 'USD' ? usdMap : jpyMap;
    if (m.has(date)) return m.get(date)!;
    const prev = sortedUsdDates.filter((d) => d <= date);
    if (prev.length > 0) return m.get(prev[prev.length - 1]) || (cur === 'USD' ? 1350 : 9.3);
    return cur === 'USD' ? 1350 : 9.3;
  };

  // Target dates: 2025-12-31 to 2026-11-07 (2026-11-08 already has new classification)
  const allReturnDates = Array.from(new Set(returnRaw.map((r) => r.기준일))).sort();
  const targetDates = allReturnDates.filter((d) => d >= '2025-12-31' && d < '2026-11-08');

  console.log(`4. Target dates to backfill: ${targetDates.length} dates (${targetDates[0]} ~ ${targetDates[targetDates.length - 1]})`);

  // Foreign stock codes for stock item yield calculation
  const foreignStockCodes = ['UNH', 'ZTS', 'GOOG', 'VST', 'AMZN'];

  let processedCount = 0;
  let skippedCount = 0;

  for (const targetDate of targetDates) {
    const dayBs = bsAssets.filter((r) => r.거래일자 === targetDate);
    const usdRate = getRate(targetDate, 'USD');
    const jpyRate = getRate(targetDate, 'JPY');

    // Foreign RP: BOOL_BAL_SUSI
    const rpItem = dayBs.find((r) => r.계좌 === '불리오' && r.종목코드 === 'BOOL_BAL_SUSI');
    const rpUSD = rpItem?.외화장부금액 || 0;
    const rpBook = rpItem?.장부금액 || 0;
    const rpMean = rpItem?.평잔 || 0;
    const rpRealized = rpItem?.실현손익 || 0;
    const rpEval = Math.round(rpUSD * usdRate);
    const rpEvalProfit = rpUSD > 0 ? rpEval - rpBook : 0;
    const rpProfit = rpRealized + rpEvalProfit;
    const rpYield = rpMean > 0 ? Number(((rpProfit / rpMean) * 100).toFixed(2)) : 0;

    // Foreign Cash: BLDO_KOIN, MYDO_KOIN, MYWN_KOIN
    const cashItems = dayBs.filter((r) =>
      (r.계좌 === '불리오' && r.종목코드 === 'BLDO_KOIN') ||
      (r.계좌 === '한투' && r.종목코드 === 'MYDO_KOIN') ||
      (r.계좌 === '한투' && r.종목코드 === 'MYWN_KOIN')
    );

    let cashEval = 0;
    let cashProfit = 0;
    let cashMean = 0;

    for (const c of cashItems) {
      const curRate = c.통화 === '엔화' ? jpyRate / 100 : usdRate;
      const cEval = Math.round((c.외화장부금액 || 0) * curRate);
      const cBook = c.장부금액 || 0;
      const cEvalProfit = (c.외화장부금액 || 0) > 0 ? cEval - cBook : 0;
      const cRealized = c.실현손익 || 0;
      cashEval += cEval;
      cashProfit += cRealized + cEvalProfit;
      cashMean += c.평잔 || 0;
    }

    const cashYield = cashMean > 0 ? Number(((cashProfit / cashMean) * 100).toFixed(2)) : 0;

    const shiftEval = rpEval + cashEval;
    const shiftProfit = rpProfit + cashProfit;

    // If already has foreign RP/Cash or shift is 0 and no RP/Cash
    const existingDateRows = returnRaw.filter((r) => r.기준일 === targetDate);
    const hasAlreadyRp = existingDateRows.some(
      (r) => r.자산군 === '현금성' && r.세부자산군 === '금융상품' && r.세부자산군2 === '외화상품' && r.평가금액 > 0
    );

    if (hasAlreadyRp) {
      skippedCount++;
      continue;
    }

    if (shiftEval === 0 && shiftProfit === 0 && rpMean === 0 && cashMean === 0) {
      skippedCount++;
      continue;
    }

    // Foreign stock items mean for stock yield recalculation
    const dayForeignStocks = dayBs.filter((r) => foreignStockCodes.includes(r.종목코드));
    const stockMean = dayForeignStocks.reduce((sum, s) => sum + (s.평잔 || 0), 0);

    // Deep copy existing rows
    const updatedRows = existingDateRows.map((r) => ({ ...r }));

    // A. 주식 > 선진국 > 종목
    const stockItemRow = updatedRows.find(
      (r) => r.자산군 === '주식' && r.세부자산군 === '선진국' && r.세부자산군2 === '종목'
    );
    if (stockItemRow) {
      stockItemRow.평가금액 -= shiftEval;
      stockItemRow.총손익 -= shiftProfit;
      if (stockMean > 0) {
        stockItemRow.총수익률 = Number(((stockItemRow.총손익 / stockMean) * 100).toFixed(2));
      }
    }

    // B. 주식 > 선진국
    const stockDevRow = updatedRows.find(
      (r) => r.자산군 === '주식' && r.세부자산군 === '선진국' && !r.세부자산군2
    );
    if (stockDevRow) {
      stockDevRow.평가금액 -= shiftEval;
      stockDevRow.총손익 -= shiftProfit;
    }

    // C. 주식 (대분류)
    const stockRow = updatedRows.find(
      (r) => r.자산군 === '주식' && !r.세부자산군 && !r.세부자산군2
    );
    if (stockRow) {
      stockRow.평가금액 -= shiftEval;
      stockRow.총손익 -= shiftProfit;
    }

    // D. 현금성 > 금융상품 > 외화상품
    let rpRow = updatedRows.find(
      (r) => r.자산군 === '현금성' && r.세부자산군 === '금융상품' && r.세부자산군2 === '외화상품'
    );
    if (rpRow) {
      rpRow.평가금액 = rpEval;
      rpRow.총손익 = rpProfit;
      rpRow.총수익률 = rpYield;
    } else {
      updatedRows.push({
        기준일: targetDate,
        자산군: '현금성',
        세부자산군: '금융상품',
        세부자산군2: '외화상품',
        평가금액: rpEval,
        총손익: rpProfit,
        총수익률: rpYield,
      });
    }

    // E. 현금성 > 금융상품 (중분류)
    const cashFinRow = updatedRows.find(
      (r) => r.자산군 === '현금성' && r.세부자산군 === '금융상품' && !r.세부자산군2
    );
    if (cashFinRow) {
      cashFinRow.평가금액 += rpEval;
      cashFinRow.총손익 += rpProfit;
    }

    // F. 현금성 > 현금 > 외환
    let cashCurItemRow = updatedRows.find(
      (r) => r.자산군 === '현금성' && r.세부자산군 === '현금' && r.세부자산군2 === '외환'
    );
    if (cashCurItemRow) {
      cashCurItemRow.평가금액 = cashEval;
      cashCurItemRow.총손익 = cashProfit;
      cashCurItemRow.총수익률 = cashYield;
    } else {
      updatedRows.push({
        기준일: targetDate,
        자산군: '현금성',
        세부자산군: '현금',
        세부자산군2: '외환',
        평가금액: cashEval,
        총손익: cashProfit,
        총수익률: cashYield,
      });
    }

    // G. 현금성 > 현금 (중분류)
    const cashCurRow = updatedRows.find(
      (r) => r.자산군 === '현금성' && r.세부자산군 === '현금' && !r.세부자산군2
    );
    if (cashCurRow) {
      cashCurRow.평가금액 += cashEval;
      cashCurRow.총손익 += cashProfit;
    }

    // H. 현금성 (대분류)
    const cashRow = updatedRows.find(
      (r) => r.자산군 === '현금성' && !r.세부자산군 && !r.세부자산군2
    );
    if (cashRow) {
      cashRow.평가금액 += shiftEval;
      cashRow.총손익 += shiftProfit;
    }

    // Clean up fields to match dev_return schema
    const payload = updatedRows.map((r) => ({
      기준일: r.기준일,
      자산군: r.자산군,
      세부자산군: r.세부자산군 || '',
      세부자산군2: r.세부자산군2 || '',
      평가금액: r.평가금액,
      총손익: r.총손익,
      총수익률: r.총수익률 ?? 0,
    }));

    // Invariant verification on date T
    const sumRow = payload.find((r) => r.자산군 === '<합계>');
    const origSum = existingDateRows.find((r) => r.자산군 === '<합계>');
    if (sumRow && origSum && Math.abs(sumRow.평가금액 - origSum.평가금액) > 0.01) {
      throw new Error(`합계 불일치 발생 on ${targetDate}! Original: ${origSum.평가금액}, New: ${sumRow.평가금액}`);
    }

    // Execute atomic delete & insert for date T
    const { error: delErr } = await supabase.from('dev_return').delete().eq('기준일', targetDate);
    if (delErr) {
      console.error(`Delete error on ${targetDate}:`, delErr);
      throw delErr;
    }

    const { error: insErr } = await supabase.from('dev_return').insert(payload);
    if (insErr) {
      console.error(`Insert error on ${targetDate}:`, insErr);
      throw insErr;
    }

    processedCount++;
    if (processedCount % 25 === 0 || processedCount === targetDates.length) {
      console.log(`Progress: ${processedCount} / ${targetDates.length} dates backfilled (latest: ${targetDate})`);
    }
  }

  console.log(`\nBackfill complete! Processed: ${processedCount} dates, Skipped: ${skippedCount} dates.`);
}

main().catch(console.error);
