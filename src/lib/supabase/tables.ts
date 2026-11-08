/**
 * Supabase 테이블 동적 라우팅
 * NEXT_PUBLIC_TABLE_PREFIX 환경변수에 따라 운영(빈 문자열) 또는 개발('dev_') 테이블로 라우팅합니다.
 */
const PREFIX = process.env.NEXT_PUBLIC_TABLE_PREFIX || ''

export const TABLES = {
  assets: `${PREFIX}assets`,
  assets_daily: `${PREFIX}assets_daily`,
  latest_portfolio_summary: `${PREFIX}latest_portfolio_summary`,
  return: `${PREFIX}return`,
  holdings: `${PREFIX}holdings`,
  asset_ratio: `${PREFIX}asset_ratio`,
  eval_profit: `${PREFIX}eval_profit`,
  groups: 'groups',
  inflow: 'inflow',
  categories: 'categories',
  allo_table: 'allo_table',
} as const
