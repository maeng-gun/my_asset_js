import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

import { format, subYears } from 'date-fns';
import {
  calculateReturns,
  calculateCumulativeReturns,
  calculateCAGR,
  calculateAnnualizedVolatility,
  calculateSharpeRatio,
  calculateMDD,
} from './stats-helpers';

const ASSET_BMS = {
  '국내주식': '305050.KS',
  '해외주식': '360200.KS',
  '만기보유채권': '114460.KS',
  '시장형채권': '114460.KS',
  '실물자산': '411060.KS',
  '인컴자산': '329200.KS'
};

export async function runAllocationBacktest(alloRows: any[]) {
  const saaRow = alloRows.find((r: any) => r.구분 === 'SAA') || { 국내주식: 19.5, 해외주식: 45.5, 만기보유채권: 17.4, 시장형채권: 2.6, 실물자산: 8.45, 인컴자산: 4.55 }
  const taa1Row = alloRows.find((r: any) => r.구분 === 'TAA1') || { 국내주식: 21.0, 해외주식: 49.0, 만기보유채권: 15.225, 시장형채권: 2.275, 실물자산: 6.825, 인컴자산: 3.675 }
  const taa2Row = alloRows.find((r: any) => r.구분 === 'TAA2') || { 국내주식: 19.5, 해외주식: 45.5, 만기보유채권: 17.0, 시장형채권: 3.0, 실물자산: 5.8, 인컴자산: 3.2 }

  const today = new Date();
  const startDate = format(subYears(today, 5), 'yyyy-MM-dd'); // 5년 백테스트
  const endDate = format(today, 'yyyy-MM-dd');

  const queryOptions = {
    period1: startDate,
    period2: endDate,
    interval: '1d' as const,
  };

  const [domEq, forEq, bond, real, inc] = await Promise.all([
    (yahooFinance.historical(ASSET_BMS['국내주식'], queryOptions) as Promise<any[]>).catch(() => [] as any[]),
    (yahooFinance.historical(ASSET_BMS['해외주식'], queryOptions) as Promise<any[]>).catch(() => [] as any[]),
    (yahooFinance.historical(ASSET_BMS['만기보유채권'], queryOptions) as Promise<any[]>).catch(() => [] as any[]),
    (yahooFinance.historical(ASSET_BMS['실물자산'], queryOptions) as Promise<any[]>).catch(() => [] as any[]),
    (yahooFinance.historical(ASSET_BMS['인컴자산'], queryOptions) as Promise<any[]>).catch(() => [] as any[])
  ]);

  const dateMap = new Map<string, number>();
  forEq.forEach((r: any) => { if (r.date && r.adjClose) dateMap.set(format(r.date, 'yyyy-MM-dd'), r.adjClose); });

  const alignedDates: string[] = [];
  const prices = {
    '국내주식': [] as number[],
    '해외주식': [] as number[],
    '만기보유채권': [] as number[],
    '시장형채권': [] as number[],
    '실물자산': [] as number[],
    '인컴자산': [] as number[]
  };

  for (const r of domEq) {
    if (!r.date || !r.adjClose) continue;
    const dStr = format(r.date, 'yyyy-MM-dd');
    
    const forP = dateMap.get(dStr);
    const bondP = bond.find((x: any) => format(x.date, 'yyyy-MM-dd') === dStr)?.adjClose;
    const realP = real.find((x: any) => format(x.date, 'yyyy-MM-dd') === dStr)?.adjClose;
    const incP = inc.find((x: any) => format(x.date, 'yyyy-MM-dd') === dStr)?.adjClose;

    if (forP && bondP && realP && incP) {
      alignedDates.push(dStr);
      prices['국내주식'].push(r.adjClose);
      prices['해외주식'].push(forP);
      prices['만기보유채권'].push(bondP);
      prices['시장형채권'].push(bondP);
      prices['실물자산'].push(realP);
      prices['인컴자산'].push(incP);
    }
  }

  if (alignedDates.length < 2) {
    throw new Error('Not enough overlapping data points for backtesting.');
  }

  const returns = {
    '국내주식': calculateReturns(prices['국내주식']),
    '해외주식': calculateReturns(prices['해외주식']),
    '만기보유채권': calculateReturns(prices['만기보유채권']),
    '시장형채권': calculateReturns(prices['시장형채권']),
    '실물자산': calculateReturns(prices['실물자산']),
    '인컴자산': calculateReturns(prices['인컴자산']),
  };

  const generateStrategyStats = (weights: any, name: string) => {
    const wDOM = (weights.국내주식 || 0) / 100;
    const wFOR = (weights.해외주식 || 0) / 100;
    const wBND = (weights.만기보유채권 || 0) / 100;
    const wMKT = (weights.시장형채권 || 0) / 100;
    const wREL = (weights.실물자산 || 0) / 100;
    const wINC = (weights.인컴자산 || 0) / 100;

    const cashW = Math.max(0, 1 - (wDOM + wFOR + wBND + wMKT + wREL + wINC));

    const pfReturns = [];
    for (let i = 0; i < returns['국내주식'].length; i++) {
      const dailyRet = 
        returns['국내주식'][i] * wDOM +
        returns['해외주식'][i] * wFOR +
        returns['만기보유채권'][i] * wBND +
        returns['시장형채권'][i] * wMKT +
        returns['실물자산'][i] * wREL +
        returns['인컴자산'][i] * wINC +
        0 * cashW;
      
      pfReturns.push(dailyRet);
    }

    const pfCumReturns = calculateCumulativeReturns(pfReturns);
    
    const cagr = calculateCAGR(pfCumReturns[pfCumReturns.length - 1], alignedDates.length) * 100;
    const vol = calculateAnnualizedVolatility(pfReturns) * 100;
    const sharpe = calculateSharpeRatio(pfReturns);
    const mdd = calculateMDD(pfCumReturns, false) * 100;

    return {
      전략명: name,
      가중치: weights,
      연환산수익률: Number(cagr.toFixed(2)),
      연환산변동성: Number(vol.toFixed(2)),
      Sharpe: Number(sharpe.toFixed(2)),
      MDD: Number(mdd.toFixed(2))
    };
  };

  const strategies = [
    generateStrategyStats(saaRow, 'SAA (전략적 자산배분)'),
    generateStrategyStats(taa1Row, 'TAA1 (전술적 자산배분 1)'),
    generateStrategyStats(taa2Row, 'TAA2 (전술적 자산배분 2)'),
  ];

  return strategies;
}
