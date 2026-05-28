import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ChatMessage } from '../core/rtc'
import type { ChatSession } from '../hooks/useChatSession'
import { Offerer } from '../screens/Offerer'

// IMPRV-019: a real route that mounts Offerer's connected branch driven by a
// local stub session, so reviewers (especially on mobile) can reach the
// post-handshake UI without negotiating SDPs between two devices. The shape
// here mirrors the showcase preview helpers in DesignSystem.tsx — the two
// surfaces are intentionally distinct (this route uses the production chrome,
// the showcase demotes it) so the helpers are duplicated rather than shared.

const DS_PREVIEW_CONV_ID = '00000000-0000-0000-0000-000000000000'

function buildChatFixture(): ChatMessage[] {
  const day1AfternoonLocal = new Date(2026, 4, 21, 14, 5).getTime()
  const day1EveningLocal = new Date(2026, 4, 21, 18, 32).getTime()
  const day2MorningLocal = new Date(2026, 4, 22, 9, 14).getTime()
  return [
    { id: 'ds-1', from: 'them', text: 'Hey! Got the invite.\nLooks neat.', at: day1AfternoonLocal },
    { id: 'ds-2', from: 'me', text: 'Glad it worked.', at: day1AfternoonLocal + 60_000, delivery: 'delivered' },
    { id: 'ds-3', from: 'them', text: 'Are you around tomorrow?', at: day1EveningLocal },
    { id: 'ds-4', from: 'me', text: 'Yep, after 10am.', at: day1EveningLocal + 90_000, delivery: 'pending' },
    { id: 'ds-5', from: 'them', text: 'Cool, talk then.', at: day2MorningLocal },
  ]
}

export function DesignSystemChat() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<ChatMessage[]>(buildChatFixture)
  // IMPRV-030: design-system route is for visual review. Pre-seed the cursor
  // at the second-to-last fixture message so reviewers see the "Last read"
  // divider when they scroll back. `markRead` is a no-op in this stub —
  // every fixture bubble is visible on mount, so the IntersectionObserver
  // in ChatTranscript would otherwise fire forward advancement (after the
  // IMPRV-031 dwell) and the cursor would land at ds-5, hiding the marker
  // entirely. Production exercises advancement via the real hook; this
  // surface is for the divider shape + the IMPRV-029 pill's re-routed
  // scroll target.
  //
  // IMPRV-032: the marker is now scroll-gated — it does NOT render on first
  // paint because the auto-scroll snaps to bottom, and "at-bottom = caught
  // up" suppresses the marker. Reviewers see the divider after scrolling up.
  // No bypass is exposed; the demo route reflects the production invariant.
  const [lastReadMessageId] = useState<string | null>('ds-4')
  const session: ChatSession = {
    state: 'connected',
    error: null,
    encodedLocal: null,
    messages,
    telemetry: {
      connectedAt: null,
      sync: null,
      samples: [],
      summary: { sampleCount: 0, currentRttMs: null, medianRttMs: null, p95RttMs: null },
    },
    conversationId: DS_PREVIEW_CONV_ID,
    hasResumed: false,
    bindConversation: async () => {},
    startAsOfferer: async () => {},
    startAsAnswerer: async () => {},
    submitAnswer: async () => {},
    politelyAcceptOffer: async () => {},
    send: (text: string) => {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), from: 'me', text, at: Date.now(), delivery: 'pending' },
      ])
    },
    reset: () => {},
    lastReadMessageId,
    markRead: () => {
      // No-op: see the comment on the `lastReadMessageId` state above. The
      // viewport contains every fixture bubble on mount, so any forward
      // advancement would immediately hide the divider this route exists
      // to demonstrate.
    },
  }
  return <Offerer session={session} conversationId={DS_PREVIEW_CONV_ID} onCancel={() => navigate('/design-system')} />
}
