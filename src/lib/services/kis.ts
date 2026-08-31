import { createAdminClient } from '@/lib/supabase/admin'

export interface KISConfig {
  appKey: string
  appSecret: string
  account: string
  urlBase: string
  agent?: string
}

export class KISService {
  private config: KISConfig
  private tokenTable: string
  private tokenCache: { token: string; expiresAt: Date } | null = null

  constructor(config: KISConfig, accountName = 'my') {
    this.config = config
    this.tokenTable = `KIS${accountName}`
  }

  static async create(accountName = 'my'): Promise<KISService> {
    const supabase = createAdminClient()

    let appKey =
      accountName === 'boolio'
        ? process.env.KIS_BOOLIO_APP_KEY || process.env.KIS_MY_APP_KEY
        : process.env.KIS_MY_APP_KEY
    let appSecret =
      accountName === 'boolio'
        ? process.env.KIS_BOOLIO_APP_SECRET || process.env.KIS_MY_APP_SECRET
        : process.env.KIS_MY_APP_SECRET
    let account =
      accountName === 'boolio'
        ? process.env.KIS_BOOLIO_ACCOUNT || process.env.KIS_MY_ACCOUNT
        : process.env.KIS_MY_ACCOUNT
    const urlBase = process.env.KIS_URL_BASE || 'https://openapi.koreainvestment.com:9443'

    // 환경변수가 없는 경우 DB config 테이블에서 폴백 조회
    if (!appKey || !appSecret || !account) {
      console.warn(`[KISService] Missing environment variables for ${accountName}`);
    }

    return new KISService(
      {
        appKey: appKey || '',
        appSecret: appSecret || '',
        account: account || '',
        urlBase,
      },
      accountName
    )
  }

  async getAuthToken(): Promise<string | null> {
    const now = new Date()

    // 1. 메모리 캐시 확인
    if (this.tokenCache && this.tokenCache.expiresAt > now) {
      return this.tokenCache.token
    }

    // 2. Supabase DB 토큰 캐시 테이블 확인
    const supabase = createAdminClient()
    try {
      const { data } = await supabase.from(this.tokenTable).select('token, valid_date').limit(1).single()
      if (data?.token && data?.valid_date) {
        // DB의 valid_date는 KST 문자열(예: '2024-08-28 10:10:10')로 가정
        const validDate = new Date(data.valid_date.replace(' ', 'T') + '+09:00')
        if (validDate > now) {
          this.tokenCache = { token: data.token, expiresAt: validDate }
          return data.token
        }
      }
    } catch {
      // 테이블이 없거나 레코드 없을 시 통과
    }

    // 3. KIS API 호출하여 신규 토큰 발급
    if (!this.config.appKey || !this.config.appSecret) {
      console.warn(`[KISService] APP_KEY or APP_SECRET not set for ${this.tokenTable}`)
      return null
    }

    try {
      const response = await fetch(`${this.config.urlBase}/oauth2/tokenP`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          appkey: this.config.appKey,
          appsecret: this.config.appSecret,
        }),
      })

      if (!response.ok) {
        console.error(`[KISService] Auth token request failed: ${response.statusText}`)
        return null
      }

      const json = await response.json()
      const token = json.access_token
      
      let expiresAt: Date;
      let formattedDate: string;

      if (json.access_token_token_expired) {
        // KIS API가 KST 포맷의 만료 시간을 제공하는 경우
        formattedDate = json.access_token_token_expired;
        expiresAt = new Date(formattedDate.replace(' ', 'T') + '+09:00');
      } else {
        // 제공하지 않는 경우 직접 계산 후 KST 문자열로 변환
        const expiresIn = json.expires_in || 86400;
        expiresAt = new Date(now.getTime() + (expiresIn - 300) * 1000);
        const kstDate = new Date(expiresAt.getTime() + 9 * 60 * 60 * 1000);
        formattedDate = kstDate.toISOString().replace('T', ' ').substring(0, 19);
      }

      this.tokenCache = { token, expiresAt }

      // DB에 저장
      try {
        await supabase.from(this.tokenTable).upsert(
          {
            id: 1,
            token,
            valid_date: formattedDate,
          },
          { onConflict: 'id' }
        )
      } catch (e) {
        console.warn('[KISService] Token save to DB warning:', e)
      }

      return token
    } catch (err) {
      console.error('[KISService] Auth error:', err)
      return null
    }
  }

  async getCurrentPrice(ticker: string): Promise<number | null> {
    const token = await this.getAuthToken()
    if (!token) return null

    const url = `${this.config.urlBase}/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${ticker}`

    try {
      const resp = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
          appkey: this.config.appKey,
          appsecret: this.config.appSecret,
          tr_id: 'FHKST01010100',
          custtype: 'P',
        },
      })

      if (!resp.ok) return null
      const data = await resp.json()
      if (data?.output?.stck_prpr) {
        return parseFloat(data.output.stck_prpr)
      }
      return null
    } catch (err) {
      console.error(`[KISService] Error fetching price for ${ticker}:`, err)
      return null
    }
  }

  async getDomesticBalance(): Promise<Array<{ 종목코드: string; 상품명: string; 평가금액: number }>> {
    const token = await this.getAuthToken()
    if (!token || !this.config.account) return []

    const url = `${this.config.urlBase}/uapi/domestic-stock/v1/trading/inquire-balance`
    const params = new URLSearchParams({
      CANO: this.config.account,
      ACNT_PRDT_CD: '01',
      AFHR_FLPR_YN: 'N',
      OFL_YN: 'N',
      INQR_DVSN: '01',
      UNPR_DVSN: '01',
      FUND_STTL_ICLD_YN: 'N',
      FNCG_AMT_AUTO_RDPT_YN: 'N',
      PRCS_DVSN: '01',
      CTX_AREA_FK100: '',
      CTX_AREA_NK100: '',
    })

    try {
      const resp = await fetch(`${url}?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
          appkey: this.config.appKey,
          appsecret: this.config.appSecret,
          tr_id: 'TTTC8434R',
          custtype: 'P',
        },
      })

      if (!resp.ok) return []
      const data = await resp.json()
      if (data?.output1 && Array.isArray(data.output1)) {
        return data.output1.map((item: { pdno: string; prdt_name: string; evlu_amt: string }) => ({
          종목코드: item.pdno,
          상품명: item.prdt_name,
          평가금액: parseFloat(item.evlu_amt) || 0,
        }))
      }
      return []
    } catch (err) {
      console.error('[KISService] Error fetching domestic balance:', err)
      return []
    }
  }

  async getOverseasBalance(currency: 'USD' | 'JPY' = 'USD'): Promise<Array<{ 종목코드: string; 상품명: string; 평가금액: number }>> {
    const token = await this.getAuthToken()
    if (!token || !this.config.account) return []

    const exchangeCode = currency === 'USD' ? 'NASD' : 'TKSE'
    const url = `${this.config.urlBase}/uapi/overseas-stock/v1/trading/inquire-balance`
    const params = new URLSearchParams({
      CANO: this.config.account,
      ACNT_PRDT_CD: '01',
      OVRS_EXCG_CD: exchangeCode,
      TR_CRCY_CD: currency,
      CTX_AREA_FK200: '',
      CTX_AREA_NK200: '',
    })

    try {
      const resp = await fetch(`${url}?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
          appkey: this.config.appKey,
          appsecret: this.config.appSecret,
          tr_id: 'TTTS3012R',
          custtype: 'P',
        },
      })

      if (!resp.ok) return []
      const data = await resp.json()
      if (data?.output1 && Array.isArray(data.output1)) {
        return data.output1.map((item: { ovrs_pdno: string; ovrs_item_name: string; ovrs_stck_evlu_amt: string }) => ({
          종목코드: item.ovrs_pdno,
          상품명: item.ovrs_item_name,
          평가금액: parseFloat(item.ovrs_stck_evlu_amt) || 0,
        }))
      }
      return []
    } catch (err) {
      console.error(`[KISService] Error fetching overseas balance (${currency}):`, err)
      return []
    }
  }
}
