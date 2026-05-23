import { useState } from 'react'
import { Button } from '../components/Button'
import { Callout } from '../components/Callout'
import { Chat } from '../components/Chat'
import { CopyBox } from '../components/CopyBox'
import { Divider } from '../components/Divider'
import { Heading } from '../components/Heading'
import { LiveRegion } from '../components/LiveRegion'
import { ScreenChromeContext, type ScreenChromeValue } from '../components/ScreenChrome'
import { Textarea } from '../components/Textarea'
import type { ChatMessage } from '../core/rtc'
import { useFocusOnMount } from '../hooks/useFocusOnMount'
import type { ChatSession } from '../hooks/useChatSession'
import { usePageTitle } from '../hooks/usePageTitle'
import { Home } from '../screens/Home'
import { Joiner } from '../screens/Joiner'
import { Offerer } from '../screens/Offerer'
import { Section, Row } from './Section'

type ThemeMode = 'system' | 'light' | 'dark'

// A 5-message fixture used by the Chat organism preview and the "Connected"
// screen preview. Exercises: incoming + outgoing, a same-day pair, a
// day-rollover, and a multi-line message (so the `whitespace-pre-wrap` path
// renders without the reviewer needing to type a newline).
function buildChatFixture(): ChatMessage[] {
  const day1AfternoonLocal = new Date(2026, 4, 21, 14, 5).getTime()
  const day1EveningLocal = new Date(2026, 4, 21, 18, 32).getTime()
  const day2MorningLocal = new Date(2026, 4, 22, 9, 14).getTime()
  return [
    { id: 'ds-1', from: 'them', text: 'Hey! Got the invite.\nLooks neat.', at: day1AfternoonLocal },
    { id: 'ds-2', from: 'me', text: 'Glad it worked.', at: day1AfternoonLocal + 60_000 },
    { id: 'ds-3', from: 'them', text: 'Are you around tomorrow?', at: day1EveningLocal },
    { id: 'ds-4', from: 'me', text: 'Yep, after 10am.', at: day1EveningLocal + 90_000 },
    { id: 'ds-5', from: 'them', text: 'Cool, talk then.', at: day2MorningLocal },
  ]
}

// Hand-rolled session stubs let us render real screen components without
// touching the live WebRTC hook. Per ticket "Open questions": start with (a)
// minimal stubs; escalate to extracting branch bodies if these grow brittle.
function stubSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    state: 'idle',
    error: null,
    encodedLocal: null,
    messages: [],
    startAsOfferer: async () => {},
    startAsAnswerer: async () => {},
    submitAnswer: async () => {},
    politelyAcceptOffer: async () => {},
    send: () => {},
    reset: () => {},
    ...overrides,
  }
}

const FAKE_OFFER = 'eyJzZHAiOiJ2PTBcclxubz1mYWtlIDQ5ODc2NTQzMjEgMSBJTiBJUDQgMTI3LjAuMC4xXHJcbiJ9'
const FAKE_REPLY = 'eyJzZHAiOiJ2PTBcclxubz1yZXBseSAxMjM0NTY3ODkgMSBJTiBJUDQgMTI3LjAuMC4xXHJcbiJ9'

const SWATCHES: { name: string; light: string; dark: string; label: string }[] = [
  { name: 'slate-50', light: 'bg-slate-50', dark: 'bg-slate-50', label: 'page light bg' },
  { name: 'slate-900', light: 'bg-slate-900', dark: 'bg-slate-900', label: 'page dark bg' },
  { name: 'sky-700', light: 'bg-sky-700', dark: 'bg-sky-700', label: 'brand / primary' },
  { name: 'emerald-700', light: 'bg-emerald-700', dark: 'bg-emerald-700', label: 'success' },
  { name: 'amber-700', light: 'bg-amber-700', dark: 'bg-amber-700', label: 'warning' },
  { name: 'red-900', light: 'bg-red-900', dark: 'bg-red-900', label: 'error text' },
  { name: 'red-300', light: 'bg-red-300', dark: 'bg-red-300', label: 'error border' },
]

function Swatch({ className, label, name }: { className: string; label: string; name: string }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <div className={`h-12 w-20 rounded-md border border-slate-300 dark:border-slate-700 ${className}`} />
      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{name}</span>
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  )
}

export function DesignSystem() {
  usePageTitle('Design system · P2P Chat')
  // Land focus on the page's own <h1> so keyboard / AT users start at a
  // meaningful heading instead of <body>. The page <h1> is outside the
  // ScreenChromeContext.Provider that wraps the previews, so it sees the
  // default context (suppressInitialFocus: false) and focuses normally. The
  // previews themselves read suppressInitialFocus: true from the showcase
  // chrome and stay out of the focus race. See A11Y-022.
  const headingRef = useFocusOnMount<HTMLHeadingElement>()
  const [mode, setMode] = useState<ThemeMode>('system')

  // Local-state Chat organism so reviewers can interact with the composer
  // without negotiating a peer. `onSend` appends a new "me" message.
  const [showcaseMessages, setShowcaseMessages] = useState<ChatMessage[]>(buildChatFixture)
  const onShowcaseSend = (text: string) => {
    setShowcaseMessages((prev) => [...prev, { id: crypto.randomUUID(), from: 'me', text, at: Date.now() }])
  }

  // Scope the dark/light override to the page root. The custom variant in
  // index.css (`@custom-variant dark (&:where(.dark, .dark *))`) makes
  // Tailwind's `dark:` utility respect this class, additive to the
  // `prefers-color-scheme` trigger — so navigating away returns the rest of
  // the app to OS-driven theming without any global state mutation.
  const themeClass = mode === 'dark' ? 'dark' : mode === 'light' ? 'light' : ''

  return (
    <div className={themeClass}>
      <main className="mx-auto flex max-w-4xl flex-col gap-8 bg-slate-50 px-4 py-12 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
        <header className="flex flex-col gap-4">
          <Heading level={1} ref={headingRef}>
            Design system
          </Heading>
          <p className="text-slate-700 dark:text-slate-300">
            Live preview of every primitive and screen this app ships. Importing the same files the features consume, so
            a tweak here is a tweak everywhere.
          </p>
          <div role="group" aria-label="Theme" className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Theme:</span>
            {(['system', 'light', 'dark'] as const).map((m) => {
              // A11Y-023: the selected state used to be `ring-2 ring-sky-400`,
              // which is visually identical to the Button primitive's base
              // `focus-visible:ring-2 focus-visible:ring-sky-400`. Tabbing
              // through the group produced two ringed buttons with no way to
              // tell selected from focused (WCAG 2.4.7 / 1.4.11). Selected
              // state now uses a tinted fill + recolored border + recolored
              // text; focus keeps the standard ring. Both cues co-occur
              // legibly on the focused+selected button (ring sits outside the
              // fill, separated by the ring-offset matched to the page bg —
              // same pattern as A11Y-017). `aria-pressed` is untouched.
              const selectedClasses =
                'bg-sky-100 text-sky-900 border-sky-700 dark:bg-sky-900 dark:text-sky-100 dark:border-sky-400'
              const ringOffset =
                'focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-900'
              return (
                <Button
                  key={m}
                  variant="secondary"
                  size="sm"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={mode === m ? `${selectedClasses} ${ringOffset}` : ringOffset}>
                  {m === 'system' ? 'System' : m === 'light' ? 'Light' : 'Dark'}
                </Button>
              )
            })}
          </div>
        </header>

        <Section title="Typography" description="Every text style used by the app.">
          {/* The Typography swatches show the *visual* style of each heading
              size — they aren't real headings (the page already has its h1
              above, and stamping out more h1s here would wreck the document
              outline). `as="p"` keeps the styling but renders a <p>. */}
          <Row label="Page h1 / 32px">
            <Heading level={1} as="p">
              Serverless P2P Chat
            </Heading>
          </Row>
          <Row label="Screen h1 / 24px">
            <Heading level={1} size="md" as="p">
              Invite your friend
            </Heading>
          </Row>
          <Row label="In-chat h1 / 18px">
            <Heading level={1} size="sm" as="p">
              Connected
            </Heading>
          </Row>
          <Row label="Section h2 / 24px">
            <Heading level={2}>Section heading</Heading>
          </Row>
          <Row label="Body / 16px">
            <p className="text-slate-700 dark:text-slate-300">The quick brown fox jumps over the lazy dog.</p>
          </Row>
          <Row label="Small / help / 12px">
            <p className="text-xs text-slate-600 dark:text-slate-400">Help text and metadata.</p>
          </Row>
          <Row label="Mono code">
            <code className="font-mono text-xs text-slate-900 dark:text-slate-100">eyJzZHAiOiJ2PTBccl…</code>
          </Row>
          <Row label="sr-only sample">
            <span className="text-xs italic text-slate-500 dark:text-slate-400">
              (visually hidden — only announced to assistive tech)
            </span>
            <span className="sr-only">You are not meant to see this. Screen readers will.</span>
          </Row>
        </Section>

        <Section title="Color & surface" description="The slate / sky / accent palette + card surface.">
          <Row label="Swatches">
            {SWATCHES.map((s) => (
              <Swatch key={s.name} className={s.light} label={s.label} name={s.name} />
            ))}
          </Row>
          <Row label="Card surface">
            <div className="w-full max-w-sm rounded-md border border-slate-300 bg-white/50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
              A muted card surface that reads on both the light and dark page background.
            </div>
          </Row>
          <Row label="Divider">
            <div className="w-full max-w-sm">
              <Divider>
                <time>Today</time>
              </Divider>
            </div>
          </Row>
        </Section>

        <Section title="Atoms" description="Single-element primitives composed by every higher-level screen.">
          <Row label="Button — primary">
            <Button variant="primary" size="sm">
              Small
            </Button>
            <Button variant="primary" size="md">
              Medium
            </Button>
            <Button variant="primary" size="lg">
              Large
            </Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </Row>
          <Row label="Button — secondary">
            <Button variant="secondary" size="sm">
              Small
            </Button>
            <Button variant="secondary" size="md">
              Medium
            </Button>
            <Button variant="secondary" size="lg">
              Large
            </Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
          </Row>
          <Row label="Button — ghost">
            <Button variant="ghost" size="sm">
              Small
            </Button>
            <Button variant="ghost" size="md">
              Medium
            </Button>
          </Row>
          {/* Same swatch-not-real-heading reasoning as the Typography
              section above — these rows demo the visual style of each
              Heading level without polluting the document outline. */}
          <Row label="Heading — level 1">
            <Heading level={1} as="p">
              Page heading
            </Heading>
          </Row>
          <Row label="Heading — level 2">
            <Heading level={2} as="p">
              Section heading
            </Heading>
          </Row>
          <Row label="Heading — level 3">
            <Heading level={3} as="p">
              Sub heading
            </Heading>
          </Row>
          <Row label="Textarea">
            <Textarea aria-label="Sample textarea" rows={3} placeholder="Type something…" className="max-w-sm" />
          </Row>
          <Row label="Callout — info">
            <Callout variant="info">Preparing invite (gathering network candidates)…</Callout>
          </Row>
          <Row label="Callout — success">
            <Callout variant="success">Copied!</Callout>
          </Row>
          <Row label="Callout — warning">
            <Callout variant="warning" className="text-sm">
              Couldn't establish a direct connection. Try a different network.
            </Callout>
          </Row>
          <Row label="Callout — error">
            <Callout variant="error">Invalid reply code. Make sure you pasted the whole string.</Callout>
          </Row>
          <Row label="Divider with label">
            <div className="w-full max-w-md">
              <Divider>
                <time>Friday, May 22, 2026</time>
              </Divider>
            </div>
          </Row>
          <Row label="LiveRegion">
            <span className="text-xs italic text-slate-500 dark:text-slate-400">
              (visually hidden — emits polite announcements to AT)
            </span>
            <LiveRegion>Sample status message.</LiveRegion>
          </Row>
        </Section>

        <Section title="Molecules" description="Self-contained UI fragments composed from atoms.">
          <Row label="CopyBox — URL">
            <div className="w-full max-w-lg">
              <CopyBox
                label="Invite URL"
                value={`https://chat.example.test/#offer=${FAKE_OFFER}`}
                helpText="Send this link to your friend in Teams, SMS, email — any channel works."
                variant="url"
              />
            </div>
          </Row>
          <Row label="CopyBox — code">
            <div className="w-full max-w-lg">
              <CopyBox
                label="Reply code"
                value={FAKE_REPLY}
                helpText="Paste this back in the same conversation. Waiting for them to accept…"
                variant="code"
              />
            </div>
          </Row>
        </Section>

        <Section
          title="Organisms"
          description="Larger composites — interactive without a peer connection in the showcase.">
          <Row label="Chat — interactive">
            <div className="h-96 w-full max-w-lg">
              <Chat messages={showcaseMessages} onSend={onShowcaseSend} />
            </div>
          </Row>
        </Section>

        <Section
          title="Screen previews"
          description="Static renders of each post-connect / between-states screen — review without a SDP handshake.">
          <ScreenPreview label="Home">
            <Home onStart={() => {}} />
          </ScreenPreview>

          <ScreenPreview label="Offerer — Invite your friend">
            <Offerer
              session={stubSession({ state: 'awaiting-answer', encodedLocal: FAKE_OFFER })}
              onCancel={() => {}}
            />
          </ScreenPreview>

          <ScreenPreview label="Offerer — Connection lost">
            <Offerer session={stubSession({ state: 'closed', encodedLocal: FAKE_OFFER })} onCancel={() => {}} />
          </ScreenPreview>

          <ScreenPreview label="Joiner — You've been invited">
            <Joiner session={stubSession({ state: 'idle' })} offerCode={FAKE_OFFER} onCancel={() => {}} />
          </ScreenPreview>

          <ScreenPreview label="Joiner — Send this code back">
            <JoinerReplyPreview />
          </ScreenPreview>

          <ScreenPreview label="Joiner — Connection lost">
            <Joiner
              session={stubSession({ state: 'closed', encodedLocal: FAKE_REPLY })}
              offerCode={FAKE_OFFER}
              onCancel={() => {}}
            />
          </ScreenPreview>

          <ScreenPreview label="Connected chat layout (header chrome)">
            <ConnectedChromePreview />
          </ScreenPreview>
        </Section>
      </main>
    </div>
  )
}

// All previewed screens render inside a showcase context that demotes their
// landmarks and headings: each screen's `<main>` becomes a labelled
// `<div role="region">` (so the page keeps a single `<main>`), and every
// `Heading level={1}` inside renders as `<h2>` (so the page keeps a single
// `<h1>`). The visual styling is unchanged — heading sizes still track the
// authored level — so the showcase still looks like the real screen. See
// A11Y-013.
//
// `suppressInitialFocus: true` also tells each previewed screen to skip its
// `useFocusOnMount` call — six screens mounting at once would otherwise race
// to programmatically focus their <h1>, teleporting AT users mid-page. See
// A11Y-022.
const SHOWCASE_CHROME: ScreenChromeValue = {
  landmark: 'region',
  headingLevelOffset: 1,
  suppressInitialFocus: true,
}

function ScreenPreview({ label, children }: { label: string; children: React.ReactNode }) {
  // A11Y-024: each previewed screen mounts real production components wired
  // to no-op handlers (`onCancel={() => {}}`, etc.), so every button and
  // form control inside would otherwise advertise interactivity it does not
  // have — ~20 dead tab stops on a single route, with the added hazard that
  // a few (e.g. CopyBox's Copy button) accidentally *do* fire and quietly
  // mutate the reviewer's clipboard. `inert` removes the entire subtree
  // from the focus order, hit testing, and AT exposure in one attribute,
  // while leaving the DOM rendered for sighted visual review. The outer
  // `<span>` label remains live, so AT users still get a heading-list /
  // landmark trail by label without entering the inert region. React 19's
  // JSX boolean prop for `inert` makes this a one-line change; if the
  // project ever downgrades below React 19 this needs the ref +
  // `setAttribute('inert', '')` workaround instead. The `aria-label` is
  // belt-and-suspenders for any tool that surfaces the wrapper from
  // outside (DOM-walker dev tools, certain magnifiers).
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
      <div
        inert
        aria-label={`${label} (preview, non-interactive)`}
        className="rounded-md border border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
        <ScreenChromeContext.Provider value={SHOWCASE_CHROME}>{children}</ScreenChromeContext.Provider>
      </div>
    </div>
  )
}

// The connected screen's outer chrome (header + End chat button) rendered
// without nesting a second Chat instance. The Chat organism above is the
// interactive one — sharing IDs across two Chat renders would dup the
// `chat-input` id and break label associations.
//
// Note: this is rendered inside `<ScreenPreview>`, which provides a
// `ScreenChromeContext` that already demotes the heading semantics. We use a
// `<div>` instead of `<main>` directly because there's no `ScreenContainer`
// indirection here (real screens use one — this preview is local to the
// showcase file).
function ConnectedChromePreview() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 px-4 py-6">
      <header className="flex items-center justify-between">
        <Heading level={1} size="sm">
          Connected
        </Heading>
        <Button variant="secondary" size="sm">
          End chat
        </Button>
      </header>
      <p className="rounded-md border border-dashed border-slate-300 p-3 text-xs italic text-slate-500 dark:border-slate-700 dark:text-slate-400">
        ↑ The Chat transcript + composer renders below this header on the real screen — see the interactive Chat in the
        Organisms section above.
      </p>
    </div>
  )
}

// Joiner's reply-code branch reads `accepted` from local state. To preview
// the reply view in the showcase, we render the Joiner under a state where
// the session already has `encodedLocal` and `state: awaiting-answer` — but
// the user must click Accept first. To skip that step in the showcase we
// can't easily reach into Joiner's internal state, so we render the JSX
// directly here using the same primitives. Mirrors the structure of the
// reply branch in Joiner.tsx.
function JoinerReplyPreview() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-12">
      <header className="flex items-start justify-between">
        <div>
          <Heading level={1}>Send this code back</Heading>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Once they paste it, the connection opens and the chat starts automatically.
          </p>
        </div>
        <Button variant="secondary" size="sm">
          Cancel
        </Button>
      </header>
      <CopyBox
        label="Reply code"
        value={FAKE_REPLY}
        helpText="Paste this back in the same conversation. Waiting for them to accept…"
      />
    </div>
  )
}
