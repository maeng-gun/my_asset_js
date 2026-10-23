/**
 * E2E Test Suite Helpers, Assertions & Execution Context
 */

export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
}

class TestContext {
  constructor() {
    this.results = []
    this.currentSuite = ''
    this.currentTier = ''
  }

  setTier(tier) {
    this.currentTier = tier
  }

  setSuite(suite) {
    this.currentSuite = suite
  }

  record(testCase) {
    this.results.push({
      tier: this.currentTier,
      suite: this.currentSuite,
      ...testCase,
    })
  }

  getSummary() {
    const total = this.results.length
    const passed = this.results.filter((r) => r.status === 'PASS').length
    const failed = this.results.filter((r) => r.status === 'FAIL').length
    const skipped = this.results.filter((r) => r.status === 'SKIP').length
    const totalDuration = this.results.reduce((acc, r) => acc + (r.durationMs || 0), 0)
    return { total, passed, failed, skipped, totalDuration, results: this.results }
  }
}

export const globalTestContext = new TestContext()

export function assert(condition, message = 'Assertion failed') {
  if (!condition) {
    const err = new Error(message)
    err.name = 'AssertionError'
    throw err
  }
}

export function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    const msg = message
      ? `${message}: Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
      : `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
    const err = new Error(msg)
    err.name = 'AssertionError'
    err.actual = actual
    err.expected = expected
    throw err
  }
}

export function assertDeepEqual(actual, expected, message = '') {
  const actualStr = JSON.stringify(actual)
  const expectedStr = JSON.stringify(expected)
  if (actualStr !== expectedStr) {
    const msg = message
      ? `${message}: Deep equality mismatch.\nExpected: ${expectedStr}\nActual:   ${actualStr}`
      : `Deep equality mismatch.\nExpected: ${expectedStr}\nActual:   ${actualStr}`
    const err = new Error(msg)
    err.name = 'AssertionError'
    err.actual = actual
    err.expected = expected
    throw err
  }
}

export function assertCloseTo(actual, expected, delta = 0.01, message = '') {
  const diff = Math.abs(Number(actual) - Number(expected))
  if (diff > delta) {
    const msg = message
      ? `${message}: Value ${actual} is not within ${delta} of ${expected} (diff: ${diff})`
      : `Value ${actual} is not within ${delta} of ${expected} (diff: ${diff})`
    const err = new Error(msg)
    err.name = 'AssertionError'
    throw err
  }
}

export async function measureMs(fn) {
  const start = performance.now()
  const result = await fn()
  const durationMs = Number((performance.now() - start).toFixed(2))
  return { result, durationMs }
}

/**
 * Execute a test case and record outcome
 */
export async function runTest(id, name, fn) {
  const start = performance.now()
  try {
    await fn()
    const durationMs = Number((performance.now() - start).toFixed(2))
    globalTestContext.record({
      id,
      name,
      status: 'PASS',
      durationMs,
    })
    return { id, name, status: 'PASS', durationMs }
  } catch (err) {
    const durationMs = Number((performance.now() - start).toFixed(2))
    globalTestContext.record({
      id,
      name,
      status: 'FAIL',
      durationMs,
      error: err.message,
      stack: err.stack,
    })
    return { id, name, status: 'FAIL', durationMs, error: err.message }
  }
}
