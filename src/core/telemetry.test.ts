import { describe, expect, it } from 'vitest'
import { computeSummary, emptyTelemetry, type TelemetrySample } from './telemetry'

// RFCTR-004: focused coverage for telemetry math previously exercised only
// through useChatSession integration tests. Each case constructs the
// minimal sample list the branch needs and asserts the summary fields
// directly — no React, no fake PC.

function receipt(rttMs: number, at = 0): TelemetrySample {
  return { kind: 'receipt', at, messageId: `r-${rttMs}-${at}`, rttMs }
}

describe('emptyTelemetry', () => {
  it('returns the null-rollup shape used as the hook initial state', () => {
    expect(emptyTelemetry()).toEqual({
      connectedAt: null,
      sync: null,
      samples: [],
      summary: { sampleCount: 0, currentRttMs: null, medianRttMs: null, p95RttMs: null },
    })
  })
})

describe('computeSummary', () => {
  it('returns all-null with zero samples and null syncRtt', () => {
    expect(computeSummary([], null)).toEqual({
      sampleCount: 0,
      currentRttMs: null,
      medianRttMs: null,
      p95RttMs: null,
    })
  })

  it('counts syncRtt as a sample on its own', () => {
    expect(computeSummary([], 80)).toEqual({
      sampleCount: 1,
      currentRttMs: 80,
      medianRttMs: 80,
      p95RttMs: 80,
    })
  })

  it('counts receipt samples and ignores non-receipt kinds', () => {
    const samples: TelemetrySample[] = [
      { kind: 'state-change', at: 0, state: 'gathering' },
      { kind: 'sent', at: 0, messageId: 's1', sentAt: 0 },
      { kind: 'received', at: 0, messageId: 'r1', sentAt: 0, transitMs: null },
      receipt(100),
    ]
    const out = computeSummary(samples, null)
    expect(out.sampleCount).toBe(1)
    expect(out.currentRttMs).toBe(100)
    expect(out.medianRttMs).toBe(100)
    expect(out.p95RttMs).toBe(100)
  })

  it('combines syncRtt with receipt samples; currentRttMs is the last *appended* receipt', () => {
    // syncRtt is pushed first, then receipts in array order; the implementation
    // picks the last element of that combined list as `current`.
    const out = computeSummary([receipt(50, 1), receipt(150, 2)], 80)
    expect(out.sampleCount).toBe(3)
    expect(out.currentRttMs).toBe(150)
  })

  it('median picks the upper-middle element for an odd count', () => {
    // sorted: [50, 80, 150] — middle index = floor(3/2) = 1 → 80
    const out = computeSummary([receipt(50), receipt(150)], 80)
    expect(out.medianRttMs).toBe(80)
  })

  it('median picks the upper-middle element for an even count (no averaging)', () => {
    // sorted: [50, 80, 120, 150] — index = floor(4/2) = 2 → 120
    const out = computeSummary([receipt(50), receipt(120), receipt(150)], 80)
    expect(out.medianRttMs).toBe(120)
  })

  it('p95 collapses to the max on tiny sample counts (spike-detection semantics)', () => {
    // sorted: [50, 80] — floor(2 * 0.95) = 1 → sorted[min(1, 1)] = 80
    const out = computeSummary([receipt(50)], 80)
    expect(out.p95RttMs).toBe(80)
  })

  it('p95 picks the index at floor(n * 0.95) for larger inputs', () => {
    // n = 20, floor(20 * 0.95) = 19 → sorted[min(19, 19)] = 200 (the max).
    const rtts = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200]
    const samples = rtts.map((rtt, i) => receipt(rtt, i))
    const out = computeSummary(samples, null)
    expect(out.sampleCount).toBe(20)
    expect(out.medianRttMs).toBe(110) // sorted[floor(20/2)] = sorted[10] = 110
    expect(out.p95RttMs).toBe(200)
  })

  it('clamps the p95 index to the last sorted element when floor(n * 0.95) overflows', () => {
    // n = 21 (still bounded by sorted.length - 1 = 20). floor(21 * 0.95) = 19;
    // clamp via min(20, 19) = 19 → sorted[19].
    const rtts = Array.from({ length: 21 }, (_, i) => (i + 1) * 10)
    const samples = rtts.map((rtt, i) => receipt(rtt, i))
    const out = computeSummary(samples, null)
    expect(out.p95RttMs).toBe(200)
  })
})
