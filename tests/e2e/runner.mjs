#!/usr/bin/env node
/**
 * Self-contained E2E Test Suite Runner
 * 
 * Usage:
 *   node tests/e2e/runner.mjs                # Run all tiers (Tier 1-4)
 *   node tests/e2e/runner.mjs --tier 1       # Run only Tier 1
 *   node tests/e2e/runner.mjs --tier 2       # Run only Tier 2
 *   node tests/e2e/runner.mjs --tier 3       # Run only Tier 3
 *   node tests/e2e/runner.mjs --tier 4       # Run only Tier 4
 *   node tests/e2e/runner.mjs --feature F1   # Filter by feature (F1..F5)
 *   node tests/e2e/runner.mjs --baseline     # Baseline mode (exit 0 on completion)
 */

import process from 'node:process'
import { colors, globalTestContext } from './helpers.mjs'
import { runTier1Tests } from './tier1-feature-coverage.test.mjs'
import { runTier2Tests } from './tier2-boundary-corner.test.mjs'
import { runTier3Tests } from './tier3-cross-feature.test.mjs'
import { runTier4Tests } from './tier4-real-world-scenarios.test.mjs'
import { runTier5Tests } from './tier5-adversarial-stress.test.mjs'

function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    tier: null,
    feature: null,
    baseline: false,
    filter: null,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--tier' && args[i + 1]) {
      options.tier = parseInt(args[i + 1], 10)
      i++
    } else if (arg.startsWith('--tier=')) {
      options.tier = parseInt(arg.split('=')[1], 10)
    } else if (arg === '--feature' && args[i + 1]) {
      options.feature = args[i + 1].toUpperCase()
      i++
    } else if (arg.startsWith('--feature=')) {
      options.feature = arg.split('=')[1].toUpperCase()
    } else if (arg === '--baseline' || arg === '--allow-failing') {
      options.baseline = true
    } else if (arg === '--filter' && args[i + 1]) {
      options.filter = args[i + 1]
      i++
    }
  }

  return options
}

function printBanner(options) {
  console.log('')
  console.log(`${colors.cyan}${colors.bold}========================================================================${colors.reset}`)
  console.log(`${colors.cyan}${colors.bold}   my_asset_js Requirements-Driven E2E Test Suite (Dual Track)          ${colors.reset}`)
  console.log(`${colors.cyan}${colors.bold}========================================================================${colors.reset}`)
  console.log(`${colors.dim}Node: ${process.version} | Timestamp: ${new Date().toISOString()}${colors.reset}`)
  if (options.tier) console.log(`${colors.yellow}Filter: Tier ${options.tier} only${colors.reset}`)
  if (options.feature) console.log(`${colors.yellow}Filter: Feature ${options.feature} only${colors.reset}`)
  if (options.filter) console.log(`${colors.yellow}Filter Pattern: ${options.filter}${colors.reset}`)
  console.log('')
}

async function main() {
  const options = parseArgs()
  printBanner(options)

  const startTime = performance.now()

  // Execute selected tiers
  if (!options.tier || options.tier === 1) {
    await runTier1Tests()
  }
  if (!options.tier || options.tier === 2) {
    await runTier2Tests()
  }
  if (!options.tier || options.tier === 3) {
    await runTier3Tests()
  }
  if (!options.tier || options.tier === 4) {
    await runTier4Tests()
  }
  if (!options.tier || options.tier === 5) {
    await runTier5Tests()
  }

  const durationMs = Number((performance.now() - startTime).toFixed(2))
  const { total, passed, failed, results } = globalTestContext.getSummary()

  // Filter results if options specified
  const filteredResults = results.filter((r) => {
    if (options.feature && !r.id.includes(options.feature)) return false
    if (options.filter && !r.name.includes(options.filter) && !r.id.includes(options.filter)) return false
    return true
  })

  // Display results grouped by tier & suite
  let currentTier = ''
  let currentSuite = ''

  for (const r of filteredResults) {
    if (r.tier !== currentTier) {
      currentTier = r.tier
      console.log(`\n${colors.bold}${colors.blue}▶ ${currentTier}${colors.reset}`)
    }
    if (r.suite !== currentSuite) {
      currentSuite = r.suite
      console.log(`  ${colors.bold}${colors.white}${currentSuite}${colors.reset}`)
    }

    if (r.status === 'PASS') {
      console.log(`    ${colors.green}✔ PASS${colors.reset} [${r.id}] ${r.name} ${colors.dim}(${r.durationMs}ms)${colors.reset}`)
    } else {
      console.log(`    ${colors.red}✖ FAIL${colors.reset} [${r.id}] ${r.name} ${colors.dim}(${r.durationMs}ms)${colors.reset}`)
      if (r.error) {
        console.log(`      ${colors.red}Error: ${r.error}${colors.reset}`)
      }
    }
  }

  const fTotal = filteredResults.length
  const fPassed = filteredResults.filter((r) => r.status === 'PASS').length
  const fFailed = filteredResults.filter((r) => r.status === 'FAIL').length

  // Summary report box
  console.log('')
  console.log(`${colors.cyan}------------------------------------------------------------------------${colors.reset}`)
  console.log(`${colors.bold}Test Execution Summary:${colors.reset}`)
  console.log(`  Total Executed : ${fTotal}`)
  console.log(`  ${colors.green}Passed         : ${fPassed}${colors.reset}`)
  console.log(`  ${fFailed > 0 ? colors.red : colors.dim}Failed         : ${fFailed}${colors.reset}`)
  const passRate = fTotal > 0 ? ((fPassed / fTotal) * 100).toFixed(1) : 0
  console.log(`  Pass Rate      : ${passRate}%`)
  console.log(`  Duration       : ${durationMs}ms`)
  console.log(`${colors.cyan}------------------------------------------------------------------------${colors.reset}`)

  if (fFailed > 0) {
    console.log(`\n${colors.yellow}[Dual Track Note] Failed tests represent requirements scheduled for implementation in upcoming milestones (M1-M5).${colors.reset}`)
  } else {
    console.log(`\n${colors.green}${colors.bold}✔ ALL TEST CASES PASSED!${colors.reset}`)
  }
  console.log('')

  if (options.baseline) {
    process.exit(0)
  }

  process.exit(fFailed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(`${colors.red}Fatal Runner Error:${colors.reset}`, err)
  process.exit(1)
})
