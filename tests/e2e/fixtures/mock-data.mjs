/**
 * Mock & Test Data Fixtures for E2E Suite (Tiers 1-4)
 */

// 1. F1: 일별 Return 테이블 시계열 (연말연초 경계 포함)
export const mockYearEndReturnRows = [
  { 기준일: '2024-12-30', 자산군: '<합계>', 총손익: 15000000, 평가금액: 250000000 },
  { 기준일: '2024-12-31', 자산군: '<합계>', 총손익: 15500000, 평가금액: 250500000 },
  // 2025년 첫 거래일 (연도 변경: 당일 총손익 300000을 전일자 평가금액으로 나눔)
  { 기준일: '2025-01-02', 자산군: '<합계>', 총손익: 300000, 평가금액: 250800000 },
  { 기준일: '2025-01-03', 자산군: '<합계>', 총손익: 600000, 평가금액: 251100000 },
  { 기준일: '2025-01-06', 자산군: '<합계>', 총손익: 400000, 평가금액: 250900000 }, // 하락일 (DD 발생)
  { 기준일: '2025-01-07', 자산군: '<합계>', 총손익: 200000, 평가금액: 250700000 }, // 추가 하락
  { 기준일: '2025-01-08', 자산군: '<합계>', 총손익: 900000, 평가금액: 251400000 }, // 신고가 반등
]

// 2. F2: 자산군별상품 (comm_profit2) 테스트 데이터 (엣지케이스 포함)
export const mockRawCommProfit2Items = [
  // 주식 - 선진국
  {
    계좌: '한투',
    자산군: '주식',
    세부자산군: '선진국',
    세부자산군2: '인덱스',
    상품명: 'ACE 미국S&P500',
    종목명: '360200',
    보유수량: 100,
    장부금액: 1500000,
    평가금액: 2000000,
  },
  // 주식 - 선진국 (계좌 다름: 한투ISA) - 별도 행이어야 함
  {
    계좌: '한투ISA',
    자산군: '주식',
    세부자산군: '선진국',
    세부자산군2: '인덱스',
    상품명: 'ACE 미국S&P500',
    종목명: '360200',
    보유수량: 50,
    장부금액: 750000,
    평가금액: 1000000,
  },
  // 주식 - 선진국 (띄어쓰기 차이: "ACE  미국S&P500")
  {
    계좌: '엔투ISA',
    자산군: '주식',
    세부자산군: '선진국',
    세부자산군2: '인덱스',
    상품명: 'ACE  미국S&P500',
    종목명: '360200',
    보유수량: 10,
    장부금액: 150000,
    평가금액: 200000,
  },
  // 주식 - 선진국 (전량 매도 종목: 보유수량 0, 평가금액 0)
  // 정렬 시 테이블 하단 999999가 아니라 선진국 인덱스 그룹 내에서 평가금액 0으로 정렬되어야 함
  {
    계좌: '한투',
    자산군: '주식',
    세부자산군: '선진국',
    세부자산군2: '인덱스',
    상품명: 'TIGER 미국나스닥100',
    종목명: '133690',
    보유수량: 0,
    장부금액: 0,
    평가금액: 0,
  },
  // 주식 - 국내
  {
    계좌: '한투',
    자산군: '주식',
    세부자산군: '국내',
    세부자산군2: '인덱스',
    상품명: 'KODEX 200',
    종목명: '069500',
    보유수량: 80,
    장부금액: 2400000,
    평가금액: 2600000,
  },
  // 대체자산 - 실물자산 (금현물)
  {
    계좌: '금현물',
    자산군: '대체자산',
    세부자산군: '실물자산',
    세부자산군2: '귀금속',
    상품명: 'KRX 금현물 1g',
    종목명: '900001',
    보유수량: 50,
    장부금액: 4500000,
    평가금액: 5500000,
  },
  // 현금성자산 - 달러자산 (외화자산)
  {
    계좌: '불리오',
    자산군: '현금성자산',
    세부자산군: '달러',
    세부자산군2: '외환',
    상품명: '불리오달러',
    종목명: 'USD_BOOLIO',
    보유수량: 1000,
    장부금액: 1350000,
    평가금액: 1450000,
  },
  // 채권 - 국채
  {
    계좌: '한투',
    자산군: '채권',
    세부자산군: '국채',
    세부자산군2: '국내',
    상품명: 'KOSEF 국고채10년',
    종목명: '148070',
    보유수량: 30,
    장부금액: 3000000,
    평가금액: 3100000,
  },
]

// 3. F3: 운용기록 폼 16개 입력 필드 & 7개 필터 상태 템플릿
export const mockInitialTradingForm = {
  tradeType: '투자자산',
  account: '한투',
  currency: '원화',
  tradeDate: '2026-10-22',
  selectedTicker: '',
  buyQ: 0,
  buyAmt: 0,
  buyCash: 0,
  sellQ: 0,
  sellPrincipal: 0,
  sellAmt: 0,
  dividend: 0,
  cashIn: 0,
  inOut: 0,
  limitCount: 30,
  selectedRowId: null,
}

export const mockFilledTradingForm = {
  tradeType: '투자자산',
  account: '한투ISA',
  currency: '원화',
  tradeDate: '2026-10-22',
  selectedTicker: '360200',
  buyQ: 50,
  buyAmt: 950000,
  buyCash: 950150,
  sellQ: 0,
  sellPrincipal: 0,
  sellAmt: 0,
  dividend: 0,
  cashIn: 0,
  inOut: 0,
  limitCount: 50,
  selectedRowId: 1024,
}

export const mockTradingFilters = {
  totalStartDate: '2026-01-01',
  totalEndDate: '2026-10-22',
  selAssetClass: '주식',
  selAssetClass1: '선진국',
  selAssetClass2: '인덱스',
  selAccount: '한투ISA',
  selProductName: 'ACE 미국S&P500',
}

// 4. F4: 5,000건 합성 거래 기록 (Map 인덱싱 성능 벤치마크용)
export function generateSyntheticTrades(count = 5000) {
  const accounts = ['한투', '한투ISA', '엔투ISA', '불리오', '금현물']
  const currencies = ['원화', '달러', '엔화']
  const dates = []
  for (let i = 0; i < 200; i++) {
    const d = new Date(2025, 0, 1 + i).toISOString().substring(0, 10)
    dates.push(d)
  }

  const trades = []
  for (let i = 0; i < count; i++) {
    const acct = accounts[i % accounts.length]
    const cur = currencies[i % currencies.length]
    const d = dates[i % dates.length]
    trades.push({
      거래일자: d,
      계좌: acct,
      통화: cur,
      종목코드: `STK_${i % 40}`,
      종목명: `종목_${i % 40}`,
      현금수입: i % 3 === 0 ? 10000 : 0,
      입출금: i % 10 === 0 ? 500000 : 0,
      현금지출: i % 2 === 0 ? 20000 : 0,
      매입수량: 10,
      매입액: 100000,
      매도수량: 0,
      매도원금: 0,
      매도액: 0,
    })
  }
  return trades
}

// 5. F4: KIS 복수종목 시세 목업 데이터 (정상, 일부 누락, Rate Limit, 에러)
export const mockKisMultiPriceResponseSuccess = {
  rt_cd: '0',
  msg_cd: 'MCA00000',
  msg1: '정상처리 되었습니다.',
  output1: [
    { stck_shrn_iscd: '360200', stck_prpr: '19850', prdy_vrss: '150' },
    { stck_shrn_iscd: '069500', stck_prpr: '34500', prdy_vrss: '-200' },
    { stck_shrn_iscd: '148070', stck_prpr: '102500', prdy_vrss: '50' },
  ],
}

export const mockKisMultiPriceResponsePartial = {
  rt_cd: '0',
  msg_cd: 'MCA00000',
  msg1: '일부 종목 조회 성공',
  output1: [
    { stck_shrn_iscd: '360200', stck_prpr: '19850' },
    // 069500 은 누락됨 -> 단건 fallback 대상
    { stck_shrn_iscd: '148070', stck_prpr: '0' }, // 0원(무효) -> 단건 fallback 대상
  ],
}

export const mockKisRateLimitResponse = {
  rt_cd: '1',
  msg_cd: 'EGW00201',
  msg1: '초당 거래건수를 초과하였습니다.',
}

// 6. F5: 직전 스냅샷 목업 (기존 단가 정보 보유)
export const mockPrevPortfolioSummary = {
  id: 'latest',
  기준일: '2026-10-21',
  comm_profit2: [
    {
      계좌: '한투',
      종목코드: '360200',
      종목명: 'ACE 미국S&P500',
      보유수량: 100,
      장부금액: 1500000,
      평가금액: 1950000, // 단가: 19,500원
    },
    {
      계좌: '한투ISA',
      종목코드: '360200',
      종목명: 'ACE 미국S&P500',
      보유수량: 80,
      장부금액: 1200000,
      평가금액: 1560000, // 단가: 19,500원
    },
    {
      계좌: '한투ISA',
      종목코드: '069500',
      종목명: 'KODEX 200',
      보유수량: 80,
      장부금액: 2400000,
      평가금액: 2720000, // 단가: 34,000원
    },
  ],
}
