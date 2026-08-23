export const ALLOCATION_ACCOUNTS = [
  '한투연금저축',
  '엔투저축연금',
  '미래DC',
  '엔투IRP',
  '농협IRP',
  '엔투ISA',
  '한투ISA',
  '엔투하영',
  '불리오',
  '금현물',
  '한투',
]

export const ACCOUNT_ORDER = [
  '한투',
  '불리오',
  '엔투하영',
  '금현물',
  '한투ISA',
  '엔투ISA',
  '엔투저축연금',
  '한투연금저축',
  '미래DC',
  '농협IRP',
  '엔투IRP',
]

export interface AssetMaster {
  행번호?: number
  계좌: string
  종목코드: string
  종목명: string
  상품명: string
  자산군: string
  세부자산군: string
  세부자산군2: string
  통화: string
  기초평가손익?: number
  평가금액?: number
  만기일?: string
}

export interface DailyTradeRaw {
  행번호?: number
  계좌: string
  종목코드: string
  거래일자: string
  매입수량: number
  매입액: number
  현금지출: number
  매도수량: number
  매도원금: number
  매도액: number
  이자배당액: number
  현금수입: number
  입출금: number
  통화?: string
  종목명?: string
}

export interface DailyTradeProcessed {
  계좌: string
  종목코드: string
  종목명: string
  통화: string
  거래일자: string
  순매입수량: number
  매입액: number
  매도원금: number
  수익: number
  비용: number
  실현손익: number
  현금수입: number
  입출금: number
  현금지출: number
}

export interface BalanceSheetRecord {
  계좌: string
  종목코드: string
  종목명: string
  통화: string
  거래일자: string
  수익: number
  비용: number
  실현손익: number
  보유수량: number
  장부금액: number
  평잔: number
  자산군: string
  세부자산군: string
  세부자산군2: string
  평가금액?: number
  평가손익?: number
  기초평가손익?: number
  평가손익증감?: number
  총손익?: number
}

export interface CommodityHoldingSummary {
  자산군: string
  세부자산군: string
  세부자산군2: string
  상품명: string
  보유수량: number
  장부금액: number
  평가금액: number
  평단가: number
  현재가: number
  평가손익: number
  평가수익률: number
  계좌?: string
  통화?: string
}

export interface TotalProfitRecord {
  연도: string
  장부금액: number
  평잔: number
  평가금액: number
  평가손익: number
  실현손익: number
  평가손익증감: number
  총손익: number
  실현수익률: number
  평가증감률: number
  총수익률: number
}

export interface ProfitVariationRecord {
  자산군: string
  세부자산군: string
  세부자산군2: string
  평가금액: number
  평잔: number
  총손익: number
  총수익률: number
  '1d': number
  '1d_': number
  '1m': number
  '1m_': number
  '3m': number
  '3m_': number
  '6m': number
  '6m_': number
  '1y': number
  '1y_': number
}

export interface AssetClassProfitRecord {
  자산군: string
  세부자산군: string
  세부자산군2: string
  장부금액: number
  평잔: number
  평가금액: number
  평가손익: number
  실현손익: number
  평가손익증감: number
  총손익: number
  비용률: number
  실현수익률: number
  평가증감률: number
  총수익률: number
}

export interface AccountProfitRecord {
  계좌: string
  자산군: string
  장부금액: number
  평잔: number
  평가금액: number
  평가손익: number
  실현손익: number
  평가손익증감: number
  총손익: number
  비용률: number
  실현수익률: number
  평가증감률: number
  총수익률: number
}

export interface DetailedCommodityProfitRecord {
  계좌: string
  통화: string
  자산군: string
  세부자산군: string
  세부자산군2: string
  종목명: string
  보유수량: number
  장부금액: number
  평잔: number
  평가금액: number
  평가손익: number
  실현손익: number
  평가손익증감: number
  총손익: number
  비용률: number
  실현수익률: number
  평가증감률: number
  총수익률: number
}

export interface DetailedCommodityProfit2Record {
  자산군: string
  세부자산군: string
  세부자산군2: string
  종목명: string
  계좌: string
  통화: string
  보유수량: number
  장부금액: number
  평잔: number
  평가금액: number
  평가손익: number
  실현손익: number
  평가손익증감: number
  총손익: number
  비용률: number
  실현수익률: number
  평가증감률: number
  총수익률: number
}

export interface CommodityHolding3Record {
  자산군: string
  세부자산군: string
  세부자산군2: string
  상품명: string
  평가금액: number
  평가손익: number
  평가수익률: number
  계좌: string
}

export interface AccountAllocationItem {
  자산군: string
  세부자산군: string
  세부자산군2: string
  한투연금저축?: number
  엔투저축연금?: number
  미래DC?: number
  엔투IRP?: number
  농협IRP?: number
  엔투ISA?: number
  한투ISA?: number
  엔투하영?: number
  불리오?: number
  금현물?: number
  한투?: number
  합계: number
  비중: number
}

export interface LatestPortfolioSummary {
  id?: string
  updated_at?: string
  기준일: string
  total_profit: TotalProfitRecord[]
  profit_variation: ProfitVariationRecord[]
  account_allocation: AccountAllocationItem[]
  t_comm: CommodityHoldingSummary[]
  t_comm2: Array<BalanceSheetRecord & { 평가수익률: number }>
  t_comm3: AssetClassProfitRecord[]
  t_comm4: AccountProfitRecord[]
  t_comm10: CommodityHolding3Record[]
  comm_profit: DetailedCommodityProfitRecord[]
  comm_profit2: DetailedCommodityProfit2Record[]
}

export interface InflowRecord {
  행번호?: number
  거래일자: string
  계좌: string
  구분?: string
  금액?: number
  자금유출입?: number
  비고?: string
}

export interface CategoryItem {
  key: string
  value: string
}

export interface AlloTableRow {
  행번호?: number
  배분일자: string
  국내주식: number
  해외주식: number
  만기보유채권: number
  시장형채권: number
  실물자산: number
  인컴자산: number
  구분: string
}
