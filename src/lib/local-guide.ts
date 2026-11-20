import fs from 'node:fs'
import path from 'node:path'

const RELATIVE_GUIDE_PARTS = '.agents|skills|portfolio_cio|docs|portfolio_cio_guide.html'

/**
 * 로컬 전용(Google Drive 정션) portfolio-cio 사용설명서 HTML 파일 경로를 반환합니다.
 * 이 모듈은 서버 컴포넌트 전용이며 민감한 개인 데이터를 코드에 포함하지 않습니다.
 */
export function getLocalGuidePath(): string {
  const override = process.env['LOCAL_CIO_GUIDE_PATH']
  if (override && override.trim()) {
    return override.trim()
  }
  const getCwd: () => string = process['cwd']
  const rootDir = getCwd()
  const segments = RELATIVE_GUIDE_PARTS.split('|')
  return path.resolve(/*turbopackIgnore: true*/ rootDir, ...segments)
}

/**
 * Vercel 클라우드 배포 환경에서는 무조건 false를 반환하고,
 * 로컬 환경이면서 비공개 HTML 파일이 실제 디스크에 존재할 때만 true를 반환합니다.
 */
export function isLocalGuideAvailable(): boolean {
  if (process.env['VERCEL'] || process.env['VERCEL_ENV']) {
    return false
  }
  try {
    const existsCheck: (p: fs.PathLike) => boolean = fs['existsSync']
    return existsCheck(getLocalGuidePath())
  } catch {
    return false
  }
}

/**
 * 로컬 전용 CIO 사용설명서 HTML 원문을 읽어옵니다. 가용하지 않으면 null을 반환합니다.
 */
export function readLocalGuideHtml(): string | null {
  if (!isLocalGuideAvailable()) {
    return null
  }
  try {
    const readText = fs['readFileSync']
    return readText(getLocalGuidePath(), 'utf-8')
  } catch {
    return null
  }
}
