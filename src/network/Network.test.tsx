import type { ReactElement } from 'react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Network } from './Network'
import type { ChatSession, NetworkTelemetry, TelemetrySample } from '../hooks/useChatSession'

// ARCH-001: Network now renders its Back affordance as a real `<Link>` (header
// nav and EmptyState alike). Wrap every render in a MemoryRouter so the link
// has a router context to read its basename from.
function renderInRouter(ui: ReactElement) {
  return render(<MemoryRouter initialEntries={['/network']}>{ui}</MemoryRouter>)
}

// FEAT-010: the Network page is a pure projection of `session.telemetry`. We
// stub the session and pass it different telemetry shapes to drive each
// branch (empty state, full report, sync-present, sync-absent).

function stubSession(telemetry: NetworkTelemetry): ChatSession {
  return {
    state: 'idle',
    error: null,
    encodedLocal: null,
    messages: [],
    telemetry,
    // FEAT-012: the Network page doesn't read these, but the ChatSession type
    // now requires them — minimal stubs keep the test surface honest.
    conversationId: null,
    hasResumed: false,
    bindConversation: async () => {},
    startAsOfferer: async () => {},
    startAsAnswerer: async () => {},
    submitAnswer: async () => {},
    politelyAcceptOffer: async () => {},
    send: () => {},
    reset: () => {},
    lastReadMessageId: null,
    markRead: () => {},
  }
}

function emptyTelemetry(): NetworkTelemetry {
  return {
    connectedAt: null,
    sync: null,
    samples: [],
    summary: { sampleCount: 0, currentRttMs: null, medianRttMs: null, p95RttMs: null },
  }
}

describe('Network empty state', () => {
  it('renders the "No active session" callout when no session has connected', () => {
    renderInRouter(<Network session={stubSession(emptyTelemetry())} />)
    expect(screen.getByRole('heading', { name: /network telemetry/i })).toBeInTheDocument()
    expect(screen.getByText(/no active session/i)).toBeInTheDocument()
  })

  it('exposes a link back to home', () => {
    // ARCH-001: was href="#" (hash-router treated empty fragment as home);
    // now a real react-router Link pointing at the canonical home path.
    renderInRouter(<Network session={stubSession(emptyTelemetry())} />)
    const home = screen.getByRole('link', { name: /back to home/i })
    expect(home.getAttribute('href')).toBe('/')
  })

  it('sets document.title to "Network telemetry · P2P Chat"', () => {
    renderInRouter(<Network session={stubSession(emptyTelemetry())} />)
    expect(document.title).toBe('Network telemetry · P2P Chat')
  })
})

describe('Network with active telemetry', () => {
  function activeTelemetry(): NetworkTelemetry {
    const connectedAt = 1_700_000_000_000
    const samples: TelemetrySample[] = [
      { kind: 'state-change', at: connectedAt - 2000, state: 'gathering' },
      { kind: 'state-change', at: connectedAt - 1500, state: 'awaiting-answer' },
      { kind: 'state-change', at: connectedAt, state: 'connected' },
      { kind: 'sent', at: connectedAt + 1000, messageId: 'abcdef1234', sentAt: connectedAt + 1000 },
      { kind: 'receipt', at: connectedAt + 1080, messageId: 'abcdef1234', rttMs: 80 },
      { kind: 'received', at: connectedAt + 2000, messageId: 'ffffff9999', sentAt: connectedAt + 1900, transitMs: 50 },
    ]
    return {
      connectedAt,
      sync: { t1: 100, t2: 250, t3: 260, t4: 200, rtt: 110, offset: 105 },
      samples,
      summary: { sampleCount: 2, currentRttMs: 80, medianRttMs: 80, p95RttMs: 110 },
    }
  }

  it('renders the heading and summary section', () => {
    renderInRouter(<Network session={stubSession(activeTelemetry())} />)
    expect(screen.getByRole('heading', { name: /network telemetry/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^summary$/i })).toBeInTheDocument()
  })

  it('renders Current/Median/p95 RTT from summary', () => {
    renderInRouter(<Network session={stubSession(activeTelemetry())} />)
    // The summary stats live inside a <dl>; assert the rendered text shows
    // up exactly once per stat (sanity check that we're reading from
    // telemetry.summary and not hardcoded zeros).
    expect(screen.getByText('Current RTT')).toBeInTheDocument()
    expect(screen.getByText('Median RTT')).toBeInTheDocument()
    expect(screen.getByText('p95 RTT')).toBeInTheDocument()
    // 80 ms (current and median) and 110 ms (p95).
    expect(screen.getAllByText(/80 ms/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/110 ms/).length).toBeGreaterThanOrEqual(1)
  })

  it('renders the four NTP timestamps and the derived rtt/offset when sync is present', () => {
    renderInRouter(<Network session={stubSession(activeTelemetry())} />)
    expect(screen.getByText(/t1 \(probe sent\)/i)).toBeInTheDocument()
    expect(screen.getByText(/t2 \(probe received\)/i)).toBeInTheDocument()
    expect(screen.getByText(/t3 \(ack sent\)/i)).toBeInTheDocument()
    expect(screen.getByText(/t4 \(ack received\)/i)).toBeInTheDocument()
    expect(screen.getByText(/round-trip/i)).toBeInTheDocument()
  })

  it('renders the state-change timeline with connection lifecycle events', () => {
    renderInRouter(<Network session={stubSession(activeTelemetry())} />)
    expect(screen.getByRole('heading', { name: /connection state timeline/i })).toBeInTheDocument()
    expect(screen.getByText('gathering')).toBeInTheDocument()
    expect(screen.getByText('awaiting-answer')).toBeInTheDocument()
    expect(screen.getByText('connected')).toBeInTheDocument()
  })

  it('renders the per-message timeline with sent and received rows', () => {
    renderInRouter(<Network session={stubSession(activeTelemetry())} />)
    expect(screen.getByRole('heading', { name: /per-message timeline/i })).toBeInTheDocument()
    // Truncated message IDs (first 8 chars) appear in the table.
    expect(screen.getByText('abcdef12')).toBeInTheDocument()
    expect(screen.getByText('ffffff99')).toBeInTheDocument()
    // RTT for the outgoing message:
    expect(screen.getByText(/RTT 80 ms/)).toBeInTheDocument()
    // Transit for the incoming message:
    expect(screen.getByText(/transit 50 ms/)).toBeInTheDocument()
  })

  it('describes the clock offset in a readable sentence', () => {
    renderInRouter(<Network session={stubSession(activeTelemetry())} />)
    // Offset is 105 ms; the readable label is "Peer's clock is +105 ms ahead of yours".
    expect(screen.getByText(/peer's clock is \+105 ms ahead of yours/i)).toBeInTheDocument()
  })

  // A11Y-028: mirror of A11Y-021's chat-transcript fix on the Network
  // timeline scroll wrapper. Chromium auto-promotes scroll containers to
  // focusable but Firefox / Safari do not — so without `tabIndex={0}` plus a
  // labelled `role="region"`, keyboard-only / screen-magnifier / switch users
  // on those engines cannot reach the off-screen columns.
  it('per-message timeline wrapper is a focusable scroll surface (A11Y-028, A11Y-040)', () => {
    // A11Y-040: the wrapper used to carry role="region" + an aria-label that
    // duplicated the heading the inner <table> already labels via
    // aria-labelledby. Landmark + content names now live on the parent
    // <section> and the table; the wrapper is just a focusable scroll
    // surface. The A11Y-028 keyboard-scroll properties stay intact.
    renderInRouter(<Network session={stubSession(activeTelemetry())} />)
    const wrapper = screen.getByTestId('net-timeline-scroll')
    expect(wrapper).toHaveAttribute('tabindex', '0')
    expect(wrapper.hasAttribute('role')).toBe(false)
    expect(wrapper.hasAttribute('aria-label')).toBe(false)
    expect(wrapper.className).toMatch(/overflow-x-auto/)
    expect(wrapper.className).toMatch(/focus-visible:ring-sky-400/)
    expect(wrapper.className).toMatch(/focus-visible:outline-none/)
  })

  // A11Y-027: SR table-navigation mode skips the surrounding prose, so the
  // <table> needs its own programmatic name (aria-labelledby reuses the
  // existing <h2 id>). And explicit scope="col" on each <th> is the canonical
  // signal that column headers govern body cells — without it, AT must guess.
  it('per-message timeline table carries aria-labelledby and column-scoped headers (A11Y-027)', () => {
    renderInRouter(<Network session={stubSession(activeTelemetry())} />)
    const table = screen.getByRole('table')
    expect(table).toHaveAttribute('aria-labelledby', 'net-timeline-heading')

    const headers = within(table).getAllByRole('columnheader')
    expect(headers).toHaveLength(5)
    headers.forEach((th) => {
      expect(th).toHaveAttribute('scope', 'col')
    })
  })
})

describe('Network with sync absent', () => {
  function telemetryNoSync(): NetworkTelemetry {
    const connectedAt = 1_700_000_000_000
    return {
      connectedAt,
      sync: null,
      samples: [{ kind: 'state-change', at: connectedAt, state: 'connected' }],
      summary: { sampleCount: 0, currentRttMs: null, medianRttMs: null, p95RttMs: null },
    }
  }

  it('renders the "sync not completed" callout when sync is null but the session is live', () => {
    renderInRouter(<Network session={stubSession(telemetryNoSync())} />)
    // Page still renders (we have a connectedAt), but the sync block falls back.
    expect(screen.getByRole('heading', { name: /network telemetry/i })).toBeInTheDocument()
    expect(screen.getByText(/sync handshake not completed/i)).toBeInTheDocument()
  })

  it('still renders the per-message timeline empty state when no messages have flowed', () => {
    renderInRouter(<Network session={stubSession(telemetryNoSync())} />)
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument()
  })
})
