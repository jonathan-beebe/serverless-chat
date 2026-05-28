// FEAT-010: per-session network telemetry. Lives entirely in memory; resets
// on every reload or new session (no persistence). The `samples` buffer is a
// capped ring (last 500 entries in useChatSession) of wire events the
// `#network` page renders for a "is the connection slow?" diagnostic.
//
// RFCTR-004: lifted out of useChatSession.ts. The math here is pure and has
// no React, no RTCPeerConnection, no storage dependency — exactly the kind
// of code the functional-core/imperative-shell split puts in `src/core/`.
// useChatSession.ts re-exports the type aliases so existing consumers
// (Network.tsx, Network.test.tsx) keep importing from the hook path.

import type { ConnectionState } from './rtc'

export interface NetworkTelemetry {
  /** Date.now() when the channel transitioned to `open`. Null until connected. */
  connectedAt: number | null
  /** NTP-style sync result. Null until the probe → ack → done handshake completes
   *  (or the 5-second probe timeout fires — sync stays null, chat continues). */
  sync: { t1: number; t2: number; t3: number; t4: number; rtt: number; offset: number } | null
  /** Ring buffer of wire events. The capping policy lives in the hook. */
  samples: TelemetrySample[]
  /** Median / p95 / current-RTT rollups computed from `samples`. */
  summary: TelemetrySummary
}

export interface TelemetrySummary {
  /** Number of round-trip samples observed (sync RTT + every chat receipt). */
  sampleCount: number
  /** Most recent round-trip latency in ms, or null if none observed. */
  currentRttMs: number | null
  medianRttMs: number | null
  p95RttMs: number | null
}

export type TelemetrySample =
  | { kind: 'sent'; at: number; messageId: string; sentAt: number }
  | { kind: 'received'; at: number; messageId: string; sentAt: number; transitMs: number | null }
  | { kind: 'receipt'; at: number; messageId: string; rttMs: number }
  | { kind: 'state-change'; at: number; state: ConnectionState }

export function emptyTelemetry(): NetworkTelemetry {
  return {
    connectedAt: null,
    sync: null,
    samples: [],
    summary: { sampleCount: 0, currentRttMs: null, medianRttMs: null, p95RttMs: null },
  }
}

export function computeSummary(samples: TelemetrySample[], syncRtt: number | null): TelemetrySummary {
  const rtts: number[] = []
  if (syncRtt !== null) rtts.push(syncRtt)
  for (const s of samples) if (s.kind === 'receipt') rtts.push(s.rttMs)
  const sorted = [...rtts].sort((a, b) => a - b)
  const median = sorted.length === 0 ? null : sorted[Math.floor(sorted.length / 2)]
  // p95 = the 95th percentile; on tiny sample counts this collapses to the max,
  // which is the right "spike-detection" answer for a session that's only seen
  // a handful of probes.
  const p95 = sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
  const current = rtts.length === 0 ? null : rtts[rtts.length - 1]
  return { sampleCount: rtts.length, currentRttMs: current, medianRttMs: median, p95RttMs: p95 }
}
