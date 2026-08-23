import * as cheerio from 'cheerio'

export interface ExchangeRates {
  USD: number
  JPY: number
}

export class MarketDataService {
  /**
   * 네이버 금융 환율 크롤링 (USD, JPY)
   */
  static async getExchangeRates(): Promise<ExchangeRates> {
    try {
      const resp = await fetch('https://finance.naver.com/marketindex/', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        next: { revalidate: 300 }, // 5분 캐싱
      })

      if (!resp.ok) throw new Error(`Fetch failed: ${resp.statusText}`)
      const html = await resp.text()
      const $ = cheerio.load(html)

      const values: number[] = []
      $('div.head_info > span.value').each((_, el) => {
        const text = $(el).text().replace(/,/g, '').trim()
        const val = parseFloat(text)
        if (!isNaN(val)) values.push(val)
      })

      const usd = values[0] || 1350
      const jpy = (values[1] || 900) / 100 // 100엔당 원화 -> 1엔당 원화

      return { USD: usd, JPY: jpy }
    } catch (err) {
      console.warn('[MarketDataService] Error fetching exchange rates:', err)
      return { USD: 1350, JPY: 9 } // 폴백
    }
  }

  /**
   * 네이버 금 시세 수집
   */
  static async getGoldPrice(): Promise<{ 종목코드: string; 종가: number } | null> {
    try {
      const resp = await fetch('https://api.stock.naver.com/marketindex/metals/M04020000', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        next: { revalidate: 300 },
      })

      if (!resp.ok) throw new Error(`Gold price fetch failed: ${resp.statusText}`)
      const json = await resp.json()
      const rawPrice = json?.closePrice ? String(json.closePrice).replace(/,/g, '') : null
      if (rawPrice) {
        return {
          종목코드: '04020000',
          종가: parseFloat(rawPrice),
        }
      }
      return null
    } catch (err) {
      console.warn('[MarketDataService] Gold price fetch failed:', err)
      return null
    }
  }

  /**
   * 펀드닥터 펀드 기준가 수집
   */
  static async getFundPrices(fundCodes: string[]): Promise<Array<{ 종목코드: string; 종가: number }>> {
    if (fundCodes.length === 0) return []

    const results: Array<{ 종목코드: string; 종가: number }> = []

    for (const code of fundCodes) {
      try {
        const resp = await fetch(`https://www.funddoctor.co.kr/afn/fund/fprofile2.jsp?fund_cd=${code}`, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        })

        if (!resp.ok) continue
        const html = await resp.text()
        const $ = cheerio.load(html)
        const priceText = $('div.price_info strong').first().text().replace(/,/g, '').trim() ||
          $('td:contains("기준가")').next().text().replace(/,/g, '').trim()

        const parsed = parseFloat(priceText)
        if (!isNaN(parsed) && parsed > 0) {
          results.push({
            종목코드: code,
            종가: parsed / 1000, // 좌당 기준가
          })
        }
      } catch (err) {
        console.warn(`[MarketDataService] Fund price failed for ${code}:`, err)
      }
    }

    return results
  }
}
