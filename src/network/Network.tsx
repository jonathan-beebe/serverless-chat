import { Button } from '../components/Button'
import { Callout } from '../components/Callout'
import { Divider } from '../components/Divider'
import { Heading } from '../components/Heading'
import { ScreenContainer, useScreenChrome } from '../components/ScreenChrome'
import type { ChatSession } from '../hooks/useChatSession'
import type { NetworkTelemetry, TelemetrySample } from '../hooks/useChatSession'
import { useFocusOnMount } from '../hooks/useFocusOnMount'
import { usePageTitle } from '../hooks/usePageTitle'

interface Props {
  session: ChatSession
}

// FEAT-010: per-session network diagnostic page rendered at `#network`. Every
// number on this page comes from the live `session.telemetry` ring buffer —
// no charts, no persistence, no backend. The intent is "user reports the
// chat feels laggy" → user opens `#network` → user reads off concrete
// numbers (RTT median/p95, sync offset, per-message timeline).

const TIMELINE_ROWS = 50

function fmtMs(ms: number | null | undefined, precision = 0): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '—'
  return `${ms.toFixed(precision)} ms`
}

function fmtClockTime(t: number | null): string {
  if (t === null) return '—'
  return new Date(t).toLocaleTimeString()
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem === 0 ? `${m} min` : `${m} min ${rem} s`
}

function offsetDescription(offsetMs: number): string {
  const abs = Math.abs(offsetMs).toFixed(0)
  if (Math.abs(offsetMs) < 1) return "Peer's clock is in sync with yours"
  return offsetMs > 0 ? `Peer's clock is +${abs} ms ahead of yours` : `Peer's clock is ${abs} ms behind yours`
}

function HeaderSummary({ telemetry }: { telemetry: NetworkTelemetry }) {
  const { sync, summary, connectedAt } = telemetry
  const sessionDuration = connectedAt ? fmtDuration(Date.now() - connectedAt) : '—'
  return (
    <section
      aria-labelledby="net-summary-heading"
      className="rounded-md border border-stone-300 bg-white/50 p-4 dark:border-stone-700 dark:bg-stone-900/50">
      <Heading level={2} size="sm" id="net-summary-heading">
        Summary
      </Heading>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat label="Connection started" value={connectedAt ? new Date(connectedAt).toLocaleTimeString() : '—'} />
        <Stat label="Session duration" value={sessionDuration} />
        <Stat label="Current RTT" value={fmtMs(summary.currentRttMs)} />
        <Stat label="Median RTT" value={fmtMs(summary.medianRttMs)} />
        <Stat label="p95 RTT" value={fmtMs(summary.p95RttMs)} />
        <Stat label="Sample count" value={String(summary.sampleCount)} />
        <Stat label="Clock offset" value={sync === null ? '—' : offsetDescription(sync.offset)} />
        <Stat label="One-way latency (≈ RTT / 2)" value={sync === null ? '—' : fmtMs(sync.rtt / 2, 1)} />
      </dl>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="font-mono text-sm text-stone-900 dark:text-stone-100">{value}</dd>
    </div>
  )
}

function SyncProbeDetail({ sync }: { sync: NetworkTelemetry['sync'] }) {
  if (sync === null) {
    return (
      <section aria-labelledby="net-sync-heading" className="flex flex-col gap-3">
        <Heading level={2} size="sm" id="net-sync-heading">
          Clock sync handshake
        </Heading>
        <Callout variant="info">
          Sync handshake not completed yet (or timed out). Chat still works — only the RTT and clock-offset numbers
          above are unavailable.
        </Callout>
      </section>
    )
  }
  return (
    <section aria-labelledby="net-sync-heading" className="flex flex-col gap-3">
      <Heading level={2} size="sm" id="net-sync-heading">
        Clock sync handshake
      </Heading>
      <p className="text-sm text-stone-700 dark:text-stone-300">
        NTP-style 4-timestamp exchange. The math: rtt = (t4 − t1) − (t3 − t2); offset = ((t2 − t1) + (t3 − t4)) / 2.
      </p>
      <dl className="grid grid-cols-2 gap-3 rounded-md border border-stone-300 bg-white/50 p-3 dark:border-stone-700 dark:bg-stone-900/50 sm:grid-cols-4">
        <Stat label="t1 (probe sent)" value={fmtClockTime(sync.t1)} />
        <Stat label="t2 (probe received)" value={fmtClockTime(sync.t2)} />
        <Stat label="t3 (ack sent)" value={fmtClockTime(sync.t3)} />
        <Stat label="t4 (ack received)" value={fmtClockTime(sync.t4)} />
        <Stat label="Round-trip" value={fmtMs(sync.rtt)} />
        <Stat label="Clock offset (peer − us)" value={fmtMs(sync.offset, 1)} />
      </dl>
    </section>
  )
}

function StateTimeline({ samples, connectedAt }: { samples: TelemetrySample[]; connectedAt: number | null }) {
  const stateChanges = samples.filter(
    (s): s is Extract<TelemetrySample, { kind: 'state-change' }> => s.kind === 'state-change',
  )
  if (stateChanges.length === 0) {
    return null
  }
  const t0 = stateChanges[0]?.at ?? connectedAt ?? Date.now()
  return (
    <section aria-labelledby="net-state-heading" className="flex flex-col gap-3">
      <Heading level={2} size="sm" id="net-state-heading">
        Connection state timeline
      </Heading>
      <ol className="rounded-md border border-stone-300 bg-white/50 p-3 text-sm dark:border-stone-700 dark:bg-stone-900/50">
        {stateChanges.map((s, i) => (
          <li
            key={`${s.at}-${i}`}
            className="flex justify-between gap-3 border-b border-stone-200 py-1 last:border-b-0 dark:border-stone-800">
            <span className="font-mono text-xs text-stone-700 dark:text-stone-300">+{fmtDuration(s.at - t0)}</span>
            <span className="font-medium text-stone-900 dark:text-stone-100">{s.state}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function MessageTimeline({ telemetry }: { telemetry: NetworkTelemetry }) {
  // Pair each `sent`/`received` event with its corresponding `receipt` (for
  // outgoing) so each row carries a single "this message took X ms" number.
  const rows = telemetry.samples
    .filter(
      (s): s is Extract<TelemetrySample, { kind: 'sent' | 'received' }> => s.kind === 'sent' || s.kind === 'received',
    )
    .slice(-TIMELINE_ROWS)
    .reverse()

  if (rows.length === 0) {
    return (
      <section aria-labelledby="net-timeline-heading" className="flex flex-col gap-3">
        <Heading level={2} size="sm" id="net-timeline-heading">
          Per-message timeline
        </Heading>
        <Callout variant="info">No messages yet. Send a message to see per-message timing here.</Callout>
      </section>
    )
  }

  const median = telemetry.summary.medianRttMs

  return (
    <section aria-labelledby="net-timeline-heading" className="flex flex-col gap-3">
      <Heading level={2} size="sm" id="net-timeline-heading">
        Per-message timeline (last {Math.min(rows.length, TIMELINE_ROWS)})
      </Heading>
      {/* A11Y-028: wrapper is the only horizontal scroll surface on viewports
          narrower than 36rem. Chromium auto-promotes overflow containers to
          focusable since M126, but Firefox / Safari do not — so without an
          explicit `tabIndex={0}` keyboard-only users on those engines can't
          reach the off-screen columns. `role="region"` + `aria-label` makes
          it a navigable landmark; the focus-visible ring matches A11Y-021's
          treatment of the chat transcript wrapper. */}
      <div
        role="region"
        aria-label="Per-message timeline (scrollable)"
        tabIndex={0}
        className="overflow-x-auto rounded-md border border-stone-300 bg-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:border-stone-700 dark:bg-stone-900/50">
        <table aria-labelledby="net-timeline-heading" className="w-full min-w-[36rem] text-left text-sm">
          <thead className="text-xs font-medium text-stone-600 dark:text-stone-400">
            <tr className="border-b border-stone-300 dark:border-stone-700">
              <th scope="col" className="px-3 py-2">
                ID
              </th>
              <th scope="col" className="px-3 py-2">
                Direction
              </th>
              <th scope="col" className="px-3 py-2">
                When
              </th>
              <th scope="col" className="px-3 py-2">
                Timing
              </th>
              <th scope="col" className="px-3 py-2">
                Δ from median
              </th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs text-stone-800 dark:text-stone-200">
            {rows.map((row) => {
              const id = row.messageId.slice(0, 8)
              const direction = row.kind === 'sent' ? 'sent' : 'received'
              let timingMs: number | null = null
              let timingLabel = '—'
              if (row.kind === 'sent') {
                // Find the matching receipt sample to know the RTT.
                const receipt = telemetry.samples.find(
                  (s): s is Extract<TelemetrySample, { kind: 'receipt' }> =>
                    s.kind === 'receipt' && s.messageId === row.messageId,
                )
                if (receipt) {
                  timingMs = receipt.rttMs
                  timingLabel = `RTT ${fmtMs(receipt.rttMs)}`
                } else {
                  timingLabel = 'pending'
                }
              } else if (row.kind === 'received') {
                if (row.transitMs !== null) {
                  timingMs = row.transitMs
                  timingLabel = `transit ${fmtMs(row.transitMs)}`
                }
              }
              const delta = timingMs !== null && median !== null ? timingMs - median : null
              return (
                <tr
                  key={`${row.kind}-${row.messageId}-${row.at}`}
                  className="border-b border-stone-200 last:border-b-0 dark:border-stone-800">
                  <td className="px-3 py-1.5">{id}</td>
                  <td className="px-3 py-1.5">{direction}</td>
                  <td className="px-3 py-1.5">{fmtClockTime(row.at)}</td>
                  <td className="px-3 py-1.5">{timingLabel}</td>
                  <td className="px-3 py-1.5">
                    {delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(0)} ms`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function EmptyState() {
  const { suppressInitialFocus } = useScreenChrome()
  const homeRef = useFocusOnMount<HTMLAnchorElement>([], { skip: suppressInitialFocus })
  return (
    <ScreenContainer label="Network telemetry" className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-12">
      <Heading level={1}>Network telemetry</Heading>
      <Callout variant="info">
        No active session. Start a chat to see network telemetry. Telemetry is per-session and not persisted across
        reloads.
      </Callout>
      <a
        ref={homeRef}
        href="#"
        className="self-start rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50 dark:focus-visible:ring-offset-stone-900">
        Back to home
      </a>
    </ScreenContainer>
  )
}

export function Network({ session }: Props) {
  usePageTitle('Network telemetry · P2P Chat')
  const { suppressInitialFocus } = useScreenChrome()
  const headingRef = useFocusOnMount<HTMLHeadingElement>([], { skip: suppressInitialFocus })
  const telemetry = session.telemetry
  // Empty state: no active session (we never reached `connected` and never
  // had any state-change sample). Render a quiet explainer + link home.
  if (telemetry.connectedAt === null && telemetry.samples.length === 0) {
    return <EmptyState />
  }

  return (
    <ScreenContainer label="Network telemetry" className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <header className="flex items-start justify-between">
        <div>
          <Heading level={1} ref={headingRef}>
            Network telemetry
          </Heading>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            Live numbers for the current session. Reload or end the chat to reset.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            // Hash-clear nav back home. Same pattern as `clearHash` but
            // avoids importing it here (Network is decoupled from url.ts).
            window.location.hash = ''
          }}>
          Back
        </Button>
      </header>

      <HeaderSummary telemetry={telemetry} />

      <Divider />

      <SyncProbeDetail sync={telemetry.sync} />

      <Divider />

      <StateTimeline samples={telemetry.samples} connectedAt={telemetry.connectedAt} />

      <Divider />

      <MessageTimeline telemetry={telemetry} />
    </ScreenContainer>
  )
}
