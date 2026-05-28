# Work Journal

A single chronological log of all work across every type. Newest first.

The `work-log` skill owns appending to this file. Per-type counters live below;
`work-define` increments the counter for the relevant type after allocating an
id.

## Next ticket numbers

- RSRCH: 5
- DSGN: 1
- ARCH: 2
- FEAT: 16
- IMPRV: 37
- MAINT: 2
- A11Y: 44
- RFCTR: 8
- BUG: 14

## Log

- 2026-05-28:17:10:23 — IMPRV-034 — done: added 9-case deriveSync block to
  wire.test.ts covering identity, latency, offsets, mirror invariant,
  NaN/Infinity, and hook-fixture regression anchor
- 2026-05-28:17:07:45 — IMPRV-034 — started
- 2026-05-28:17:06:31 — IMPRV-033 — done: added 19-test rtcDiagnostics suite
  covering banner, six listener channels, helpers via observable output, and
  logSelectedPair paths
- 2026-05-28:17:04:36 — IMPRV-033 — started
- 2026-05-28:17:02:22 — A11Y-043 — done: statusMessage default returns
  "Accepting invite..." on reply branch so Accept click has immediate ack
- 2026-05-28:17:00:50 — A11Y-043 — started
- 2026-05-28:16:59:26 — A11Y-042 — done: spinner honours motion-reduce via
  motion-reduce:animate-none
- 2026-05-28:16:57:52 — A11Y-042 — started
- 2026-05-28:16:57:15 — A11Y-041 — done: dropped onFocus auto-select on CopyBox
  textarea; manual-copy fallback still selects on click
- 2026-05-28:16:55:55 — A11Y-041 — started
- 2026-05-28:16:55:23 — A11Y-040 — done: dropped role+aria-label on timeline
  scroll wrapper; parent section + table labelledby own the names
- 2026-05-28:16:53:17 — A11Y-040 — started
- 2026-05-28:16:51:55 — A11Y-039 — done: empty-state placeholder no longer
  aria-hidden; aria-relevant="additions" already silences live churn
- 2026-05-28:16:48:30 — A11Y-039 — started
- 2026-05-28:16:48:03 — A11Y-038 — done: commit-hash footer now text-stone-600
  (~7.78:1) clearing WCAG 1.4.3
- 2026-05-28:16:46:55 — A11Y-038 — started
- 2026-05-28:16:46:05 — A11Y-037 — done: pending delivery glyph now text-sky-200
  (~4.5:1) clearing WCAG 1.4.11
- 2026-05-28:16:43:08 — A11Y-037 — started
- 2026-05-28:14:58:11 — RFCTR-007 — defined: sweep classname tailwind toMatch
  assertions in component tests
- 2026-05-28:14:54:47 — RFCTR-006 — defined: dedupe CopyBox clipboard fallback
  by delegating to core/clipboard helper
- 2026-05-28:14:52:59 — RFCTR-005 — defined: lift extractOfferCode and
  classifyPastedCode out of Offerer into src/core
- 2026-05-28:14:50:44 — RFCTR-004 — defined: lift pure telemetry math out of
  useChatSession into src/core/telemetry
- 2026-05-28:14:48:42 — IMPRV-036 — defined: pin wire chat envelope sender field
  decode and round-trip cases
- 2026-05-28:14:46:53 — IMPRV-035 — defined: add unit tests for buildIceServers
  env-driven branches
- 2026-05-28:14:44:25 — IMPRV-034 — defined: add direct unit tests for
  deriveSync math
- 2026-05-28:14:42:41 — IMPRV-033 — defined: add unit tests for rtcDiagnostics
  listener wiring and helpers
- 2026-05-28:14:26:16 — A11Y-043 — defined: joiner accept click has no immediate
  live-region acknowledgement
- 2026-05-28:14:24:41 — A11Y-042 — defined: spinner ignores
  prefers-reduced-motion
- 2026-05-28:14:23:29 — A11Y-041 — defined: copybox textarea auto-selects all
  content on focus
- 2026-05-28:14:22:07 — A11Y-040 — defined: network per-message timeline
  announces its name twice on entry
- 2026-05-28:14:20:47 — A11Y-039 — defined: chat transcript empty-state
  placeholder is aria-hidden from SR users
- 2026-05-28:14:19:26 — A11Y-038 — defined: home commit hash text-stone-500
  fails 1.4.3 in light mode
- 2026-05-28:14:18:11 — A11Y-037 — defined: pending delivery glyph contrast on
  outgoing bubbles fails 1.4.11
- 2026-05-28:06:39:41 — MAINT-001 — defined: silence vite/lightning-css warnings
  from tailwind scanning env(...) shorthand in comments
- 2026-05-27:22:17:03 — BUG-013 — done: useEffect with [isNearBottom, messages,
  lastReadMessageId, onMarkRead] deps calls onMarkRead(newest) whenever
  at-bottom and cursor < newest; hook's forward-only filter is the idempotency
  guarantee
- 2026-05-27:22:15:51 — RSRCH-004 — filed in 0-refine (per types/bug.md):
  consolidate the chat scroll/cursor implementation behind the now-stable
  four-rule model
- 2026-05-27:22:09:31 — BUG-013 — started
- 2026-05-27:22:08:05 — BUG-013 — defined: at-bottom snaps the read cursor to
  the newest message so the marker stops surfacing above already-read content
- 2026-05-27:20:35:15 — IMPRV-032 — done: isNearBottom state mirrors
  wasNearBottomRef from onScroll; lastReadIndex returns null at-bottom so the
  marker is suppressed without touching cursor advancement
- 2026-05-27:20:27:50 — IMPRV-032 — started
- 2026-05-27:16:22:09 — IMPRV-032 — defined: gate last-read marker visibility on
  live scroll state so it hides at-bottom and shows when scrolled back
- 2026-05-27:14:01:03 — IMPRV-031 — done: per-bubble setTimeout(3000) gates
  onMarkRead; isIntersecting schedules, !isIntersecting cancels, unmount clears
  all pending timers
- 2026-05-27:13:57:30 — IMPRV-031 — started
- 2026-05-27:13:56:33 — IMPRV-031 — defined: 3-second viewport dwell before the
  read cursor advances
- 2026-05-27:13:33:02 — IMPRV-030 — done: lastReadMessageId on
  ConversationRecord, hook markRead + persist via a single-tx storage helper,
  Last-read divider in transcript, IMPRV-029 pill scrolls to marker
- 2026-05-27:13:12:38 — IMPRV-030 — started
- 2026-05-27:13:09:29 — IMPRV-030 — defined: Read cursor with "Last read"
  divider; new-messages pill scrolls to the marker
- 2026-05-27:12:49:43 — RSRCH-003 — done: published
  docs/webrtc-recovery-options.md covering 3 disconnect classes, 4 recovery
  techniques, 4 signaling shapes, browser+NAT caveats, and code attach points
- 2026-05-27:12:43:58 — RSRCH-003 — started
- 2026-05-27:12:43:38 — IMPRV-029 — done: count-bearing pill sibling of the
  role=log scroll surface, increments per scrolled-back arrival, click scrolls
  to bottom + dismisses, manual-scroll does not dismiss per chosen policy
- 2026-05-27:12:38:14 — IMPRV-029 — started
- 2026-05-27:12:38:01 — IMPRV-028 — done: flipped transcript wrapper to flex
  flex-col and added mt-auto to its child so messages bottom-anchor adjacent to
  composer; DOM order + A11Y-018 + IMPRV-005 anti-yank preserved
- 2026-05-27:12:34:53 — IMPRV-028 — started
- 2026-05-27:12:32:57 — RSRCH-003 — defined: Survey WebRTC connection recovery
  options under current and hypothetical signaling models
- 2026-05-27:12:25:15 — IMPRV-029 — defined: New-messages button surfaces when
  scrolled back and new messages arrive
- 2026-05-27:12:21:08 — IMPRV-028 — defined: Anchor chat transcript to bottom so
  newest message sits adjacent to composer
- 2026-05-27:11:32:00 — IMPRV-027 — done: gated the transcript wrapper's
  `border` / `border-stone-300` / `dark:border-stone-700` / `rounded-md`
  utilities behind `sm:` in `src/components/ChatTranscript.tsx` so phone- width
  viewports render edge-to-edge with no framing outline; the bg tint, padding,
  focus ring, and scroll affordance remain unconditional; new behavior assertion
  in `src/components/ChatTranscript.test.tsx` asserts the `sm:`-prefixed shape
  with negative guards against the unconditional pre-IMPRV-027 utilities; suite
  458 passing
- 2026-05-27:11:31:00 — IMPRV-027 — started
- 2026-05-27:11:30:00 — IMPRV-026 — done: added `sm:mb-4` to the composer
  `<form>` in `src/components/ChatComposer.tsx` so the composer sits with 1rem
  (~16px) of breathing room above the viewport bottom on viewports ≥640px;
  phone-width unchanged so the IMPRV-017 / IMPRV-020 keyboard-pin behavior
  survives; new behavior assertion in `src/components/ChatComposer.test.tsx`
  reads the form's className for `sm:mb-4` presence and guards against a bare
  `mb-4` regression; suite 457 passing
- 2026-05-27:11:29:00 — IMPRV-026 — started
- 2026-05-27:11:28:00 — BUG-012 — done: verified BUG-011's `session.reset()`
  restoration in `src/routes/ConversationRoute.tsx` onCancel sites also fixes
  the cancel→restart→NotFound sequence (sibling symptom of the same ARCH-001
  regression); added a behavior test in `src/App.test.tsx` that drives Start →
  Cancel → Start and asserts the second start lands on Offerer "Invite your
  friend", not "Conversation not found"; verified the test fails when the
  BUG-011 fix is reverted; suite 456 passing
- 2026-05-27:11:27:00 — BUG-012 — started
- 2026-05-27:11:26:00 — BUG-011 — done: restored `session.reset()` before
  `navigate('/')` in all three `onCancel` sites in
  `src/routes/ConversationRoute.tsx` (joiner sticky-offer, live-session Offerer,
  resume Offerer) so the local hook tears down `RTCPeerConnection` /
  `RTCDataChannel` on user cancel — remote peer now observes `channel.onclose`
  and transitions `connected → 'closed'`; added a `pagehide` window listener in
  `src/hooks/useChatSession.ts` so closing the tab also tears down the channel
  before the browser kills the process; updated the Joiner closed-branch stale
  comment (`App.goHome` → ConversationRoute callback); new behavior tests
  `src/routes/ConversationRoute.test.tsx` (4 cases: invite Cancel, connected End
  chat, closed Return home, joiner Decline) and a `pagehide` teardown test added
  to `src/hooks/useChatSession.test.ts`; suite 455 passing
- 2026-05-27:11:22:00 — BUG-011 — started
- 2026-05-27:11:21:00 — BUG-010 — done: moved safe-area-inset from
  `ScreenContainer` margin utilities to
  `body { padding-top/left/right: env(...) }` in `src/index.css`; removed
  `SAFE_AREA_CLASSES` from `ScreenChrome.tsx`; flipped the four IMPRV-024
  className assertions in `src/components/ScreenChrome.test.tsx` to assert "no
  `safe-area-inset` utility on the screen root" plus three new postcss-AST
  checks for the body padding rules; wide-screen `mx-auto` centering restored
  without regressing iOS standalone notch / landscape edge clearance; suite 450
  passing
- 2026-05-27:11:19:00 — BUG-010 — started
- 2026-05-27:10:51:24 — IMPRV-027 — defined: hide chat transcript border below
  sm breakpoint
- 2026-05-27:10:51:24 — IMPRV-026 — defined: float connected chat on wide
  screens
- 2026-05-27:10:51:24 — BUG-012 — defined: cancel from offerer leaves session
  bound second start renders notfound
- 2026-05-27:10:51:24 — BUG-011 — defined: end chat does not close channel so
  peer stays connected
- 2026-05-27:10:42:28 — BUG-010 — defined: restore wide-screen centering broken
  by imprv-024 margin insets
- 2026-05-27:10:20:33 — BUG-009 — done: stubbed `window.scrollTo` for the
  IMPRV-017 mount-side-effect test in `src/mobile-responsive.test.tsx` so the
  hook's pan-cancellation call no longer fires through jsdom's unimplemented
  `scrollTo` and leaks two "Not implemented" lines per test run; mirrors the
  stub pattern already in `useVisualViewportHeight.test.ts:27-34`; suite still
  449 passing
- 2026-05-27:10:19:17 — BUG-009 — started
- 2026-05-27:10:19:17 — BUG-009 — defined: jsdom scrollTo stderr noise in
  mobile-responsive test
- 2026-05-27:09:58:00 — RSRCH-002 — done: usechatsession seam map published to
  docs/usechatsession-seam-map.md
- 2026-05-27:09:52:09 — RSRCH-002 — started
- 2026-05-27:09:52:00 — RFCTR-003 — done: split Chat.tsx (454→42 lines) into
  ChatCopyToolbar, ChatComposer, ChatTranscript with colocated tests
- 2026-05-27:09:43:47 — RFCTR-003 — started
- 2026-05-27:09:43:37 — RSRCH-002 — defined: usechatsession seam map
- 2026-05-27:09:43:37 — RFCTR-003 — defined: extract chat into colocated
  components
- 2026-05-27:09:29:43 — RFCTR-002 — done: converted the file-content
  `readFileSync(...).toMatch(/className/)` assertions in
  `src/mobile-responsive.test.tsx` (14 of 17) and `src/dark-mode.test.tsx` (1
  of 3) to behavior assertions via `renderWithProviders` + `screen` queries;
  added `src/__helpers__/cssRules.ts` (postcss-AST walker) for the six
  `index.css` rule assertions plus the dark-mode `color-scheme` / dark-body
  rules so Prettier-reordered declarations no longer false-positive; kept three
  documented file-content holdouts (typography absence tests + the
  `useVisualViewportHeight` no-`safe-area-inset-bottom` hook-internal invariant
  - `UpdatePrompt.tsx` className + `index.html` `<meta>` scans); no new direct
    dev deps (postcss already transitive via tailwindcss);
    `npx prettier --write src/` no-op then `npm run ci` green (447 tests).
- 2026-05-27:09:22:29 — RFCTR-002 — started
- 2026-05-27:09:21:34 — RFCTR-001 — done: moved `ConversationRow` + its helpers
  (`formatRelative`, `autoLabel`, `COPY_FLASH_MS`, `TYPEAHEAD_RESET_MS`,
  `MENU_ITEM_LABELS`, `RowProps`) from `src/screens/Home.tsx` to
  `src/components/ConversationRow.tsx`; Home retains `LIVE_STATES` +
  `liveConversationId` (consume `useSession`); split the 807-line
  `Home.test.tsx` into a 175-line screen test (focus, empty state, CR-011 cull,
  Start-a-chat, commit hash) + a 737-line `ConversationRow.test.tsx` covering
  rendering / CR-008 menu dismissal / CR-009 Copy transcript / A11Y-025 APG
  keyboard; updated the IMPRV-021 file-content assertion in
  `src/mobile-responsive.test.tsx` to read from `ConversationRow.tsx`;
  `npm run ci` green.
- 2026-05-27:09:13:53 — RFCTR-001 — started
- 2026-05-27:09:13:43 — RFCTR-002 — defined: replace file-content tests with
  behavior assertions
- 2026-05-27:09:13:43 — RFCTR-001 — defined: extract conversationrow from home
- 2026-05-27:09:05:46 — IMPRV-025 — done: added
  `html { -webkit-tap-highlight-color: transparent }`,
  `body { overscroll-behavior-y: contain }`, and a global
  `touch-action: manipulation` rule on
  `button, a, input, textarea, select, [role="button"]` to `src/index.css` (raw
  rules outside `@layer`, matching the existing file posture — `touch-action`
  doesn't collide with any Tailwind utility so the IMPRV-024
  longhand-after-shorthand gotcha isn't in play); added `overscroll-contain` to
  the Chat transcript wrapper, `select-text` to the message-text span (line
  396), and `select-none` to the time/delivery span (line 400) in
  `src/components/Chat.tsx`; five new file-content assertions in
  `src/mobile-responsive.test.tsx` covering each CSS rule and both className
  changes; `npm run ci` green.
- 2026-05-27:09:02:15 — IMPRV-025 — started
- 2026-05-27:09:02:00 — IMPRV-024 — done: `ScreenContainer` now emits
  `mt-/ml-/mr-[env(safe-area-inset-*)]` on its root (margin, not padding —
  Tailwind v4 emits `padding-top` longhand AFTER `padding-block`, so a
  padding-based inset would clobber every consumer's `py-12` in browser tabs);
  Offerer/Joiner connected wrappers swapped `pb-1` →
  `pb-[max(env(safe-area-inset-bottom),0.25rem)]` so the composer clears the iOS
  home indicator in standalone without losing browser-tab breathing room;
  `UpdatePrompt`'s `py-3` split into
  `pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]` so the Update/Dismiss tap
  targets sit above the home-indicator pill; added a regression note alongside
  `--vvh` in `index.css` documenting the "wrapper-padding owns the bottom inset"
  choice; new `components/ScreenChrome.test.tsx` (4 tests) plus three new
  assertions and one updated assertion in `mobile-responsive.test.tsx`;
  `npm run ci` green.
- 2026-05-27:08:51:00 — IMPRV-024 — started
- 2026-05-27:08:49:30 — IMPRV-023 — done: generated `pwa-192x192.png`,
  `pwa-512x512.png`, `pwa-maskable-512x512.png` (10% safe-zone inset), and
  `apple-touch-icon.png` from `public/favicon.svg` via
  `@vite-pwa/assets-generator` (config: `pwa-assets.config.ts`, script:
  `npm run generate:icons`); split the maskable entry in `vite.config.js` to its
  own `src`; added `<link rel="apple-touch-icon">` plus the two
  `apple-mobile-web-app-*` meta lines to `index.html`; new
  `src/pwa-icons.test.ts` asserts the iOS meta and that every manifest icon
  `src` resolves to a file in `public/`
- 2026-05-27:08:44:54 — IMPRV-023 — started
- 2026-05-27:08:44:00 — FEAT-015 — done: added `useInstallPrompt` hook (captures
  `beforeinstallprompt`, holds the event after `preventDefault()`, exposes
  `promptInstall()`, clears on `appinstalled` or after `userChoice` resolves)
  and `useDisplayModeStandalone` hook (matchMedia + `navigator.standalone` union
  with `change` subscription); new `<InstallPrompt />` renders an "Install app"
  button on Home near the commit-hash footer when `canInstall && !standalone`,
  with LiveRegion announcement; 19 new tests cover Chromium fire→click→prompt,
  dismissed outcome, `appinstalled` window event, iOS standalone, and
  unsubscribe
- 2026-05-27:08:38:59 — FEAT-015 — started
- 2026-05-27:08:37:47 — FEAT-014 — done: CopyBox grew an optional `share` prop
  that renders an OS-share-sheet button alongside Copy when `navigator.share` +
  `canShare(payload)` both report support; Offerer's invite-URL CopyBox opts in,
  all other CopyBox call sites (Offerer polite-defer reply, Joiner reply) and
  unsupported browsers see the unchanged Copy-only affordance; `AbortError`
  (user dismissed the sheet) is swallowed silently so no error UI surfaces
- 2026-05-27:08:33:05 — FEAT-014 — started
- 2026-05-27:08:30:18 — FEAT-015 — defined: install pwa cta and standalone
  detection
- 2026-05-27:08:30:18 — FEAT-014 — defined: web share api for invite url
- 2026-05-27:08:30:18 — IMPRV-025 — defined: mobile native touch css polish
- 2026-05-27:08:30:18 — IMPRV-024 — defined: respect ios safe area insets in
  standalone mode
- 2026-05-27:08:30:18 — IMPRV-023 — defined: generate pwa icons and add ios
  install meta
- 2026-05-25:16:50:53 — IMPRV-022 — done: UpdatePrompt component reads
  `useRegisterSW`'s `needRefresh`, renders a bottom-fixed "new version
  available" banner on Home only, and calls `updateServiceWorker(true)` on
  click; the mock was rewritten with a `__pwaTest` driver so tests can flip the
  flag from outside React
- 2026-05-25:16:45:22 — IMPRV-022 — started
- 2026-05-25:16:44:51 — IMPRV-021 — done: chat copy-transcript toolbar wrapper
  switched to `hidden sm:flex` so it disappears below 640px; the Home row-menu
  Copy transcript path remains the small-screen fallback (guarded by a new
  mobile-responsive assertion)
- 2026-05-25:16:41:35 — IMPRV-021 — started
- 2026-05-25:16:41:05 — IMPRV-020 — done: connected chat container now fills
  `h-[var(--vvh)]` and uses asymmetric `pt-6 pb-1` so the composer sits ~4px
  above the visual-viewport bottom; doc comments and the mobile-responsive test
  were updated to match
- 2026-05-25:16:37:17 — IMPRV-020 — started
- 2026-05-25:16:36:05 — IMPRV-022 — defined: PWA update banner on Home prompts
  user to activate waiting service worker
- 2026-05-25:16:30:50 — IMPRV-021 — defined: hide chat copy-transcript toolbar
  below sm breakpoint
- 2026-05-25:16:27:54 — IMPRV-020 — defined: connected-chat container fills
  --vvh and pins composer to viewport bottom
- 2026-05-25:16:18:33 — IMPRV-018 — done: render **COMMIT_HASH** as muted text
  below the "How does this work?" disclosure on Home; "dev" passes through
  unchanged when git was unavailable at build time
- 2026-05-25:16:15:40 — IMPRV-018 — started
- 2026-05-25:16:14:47 — IMPRV-019 — done: added /design-system/chat route that
  mounts Offerer's connected branch with a local stub ChatSession; removed inert
  ConnectedChromePreview from /design-system and replaced it with a link to the
  new route
- 2026-05-25:16:11:12 — IMPRV-019 — started
- 2026-05-25:16:08:35 — IMPRV-019 — defined: mock connected-chat route at
  /design-system/chat for mobile testing
- 2026-05-25:16:01:00 — IMPRV-018 — defined: show short commit hash as version
  on home screen
- 2026-05-25:15:53:01 — IMPRV-017 — done: added `useVisualViewportHeight` hook +
  `:root --vvh: 100dvh` fallback; Offerer/Joiner connected branches now size via
  `h-[calc(var(--vvh)-3rem)]` and mount the hook so iOS Safari can no longer pan
  the page beneath the soft keyboard; 7 behavioral hook tests + refreshed
  mobile-responsive file-content assertions (commit 5e5780b)
- 2026-05-25:15:46:55 — IMPRV-017 — started
- 2026-05-25:15:46:04 — IMPRV-017 — defined: bind chat surface to visualViewport
  so composer stays above iOS keyboard
- 2026-05-25:12:17:03 — retro — covered 73 done tickets / 151 journal entries
  (first retro, full project history); themes: a11y dominant (35/73, ~48%), two
  architectural pivots (ARCH-001 routing, BUG-006 senderId) that absorbed 4+
  symptom tickets, test suite halved + noise-floor guarded; six failure modes
  filed as RSRCH-001 in `0-refine/`
- 2026-05-25:12:10:03 — RSRCH-001 — defined: harden workflow against six
  retro-surfaced failure modes
- 2026-05-25:07:44:03 — ARCH-001 — done: replaced hash router with react-router
  BrowserRouter at path-based URLs (/, /conversation/:id, /design-system,
  /network); session lifted into AppShell via new SessionContext so navigating
  between routes preserves the live PeerConnection (BUG-008 invariant); invite
  URL is now /conversation/&lt;id&gt;#offer=&lt;encoded&gt; (SDP still in
  fragment for privacy); ConversationRoute keeps a sticky-per-id offer so Joiner
  stays mounted while the URL settles to the canonical path; Home Resume is a
  real &lt;Link&gt; with a Live badge for the active session; Network's header +
  EmptyState Backs are real &lt;Link&gt;s (absorbs A11Y-031 + A11Y-036);
  pre-bind in Home.startNew prevents NotFound flash on freshly-minted conv ids;
  SPA fallback via public/\_redirects (Cloudflare) and a rewritten
  public/404.html + main.tsx restore (GitHub Pages); 14 routing tests + 9 new
  ones around joiner canonicalization, privacy, and ResumeOrNotFound; CI green
  (format/typecheck/lint/test + build)
- 2026-05-24:20:44:25 — ARCH-001 — started
- 2026-05-24:20:34:48 — A11Y-034 — done: hid the chat copy toolbar when
  `messages.length === 0` so SR users no longer hear an unexplained "Copy,
  button, dimmed" (the empty-state placeholder already conveys the surface
  state); bundled a de-flake of the A11Y-025 row-menu effect by gating
  auto-focus / reset on a `prevMenuOpenRef` so async `hasMessages` updates don't
  stomp `activeIndex` (`src/components/Chat.tsx`, `src/screens/Home.tsx`)
- 2026-05-24:20:34:47 — A11Y-033 — done: added a `ConfirmDialog` design-system
  primitive (native `<dialog role="alertdialog">`, programmatic
  title/description, initial focus on Cancel, ESC routed through onCancel,
  two-button focus trap, focus restoration to a `returnFocusTo` ref); swapped
  `ConversationRow.doDelete`'s `window.confirm` for it (AC#20 wording verbatim);
  FEAT-012 AC#20 tests rewritten to drive the dialog
  (`src/design-system/ConfirmDialog.tsx`, `src/screens/Home.tsx`,
  `src/screens/Home.test.tsx`)
- 2026-05-24:20:34:46 — A11Y-032 — done: dropped the conflicting
  `aria-label="Past conversations"` on the past-chats `<section>` so the visible
  `<h2>` ("Past chats") is the authoritative name and the region landmark earns
  its slot inside the Home `<main>`; empty-state test re-anchored on the heading
  (`src/screens/Home.tsx`, `src/screens/Home.test.tsx`)
- 2026-05-24:20:34:45 — A11Y-030 — done: appended row labels to past-chats list
  buttons — `Resume <label>` (visible text "Resume" preserved → WCAG 2.5.3
  holds) and `More actions for <label>` (glyph-only trigger); loosened three
  `/^resume$/i` test queries to `/^resume\b/i` so they keep meaning "the Resume
  button" (`src/screens/Home.tsx`, `src/screens/Home.test.tsx`)
- 2026-05-24:20:34:44 — A11Y-029 — done: added the canonical focus-visible ring
  tokens (sky-400 ring + stone-50 / stone-900 offset) to the Include-timestamps
  checkbox — Tailwind v4 preflight had reset the default outline and
  `accent-sky-700` only paints the check fill (`src/components/Chat.tsx`)
- 2026-05-24:20:34:43 — A11Y-028 — done: wrapped the per-message timeline in a
  `role="region"` with `tabIndex={0}`, `aria-label`, and the canonical
  focus-visible ring tokens so Firefox / Safari keyboard-only / screen-magnifier
  / switch users can reach the right-hand columns at narrow viewports (mirrors
  A11Y-021's chat-transcript fix) (`src/network/Network.tsx`)
- 2026-05-24:20:34:42 — A11Y-027 — done: gave the per-message timeline `<table>`
  a programmatic name via `aria-labelledby="net-timeline-heading"` (reusing the
  existing heading id rather than minting a caption) and added `scope="col"` to
  the five `<th>` cells so column→cell relationships are explicit in SR
  table-navigation mode (`src/network/Network.tsx`)
- 2026-05-24:20:34:41 — A11Y-026 — done: bumped the rename input border tokens
  from `stone-300 / stone-600` (≈1.48 / 2.4:1) to `stone-400 / stone-500` (≈3.00
  / 3.45:1) to clear WCAG 1.4.11's 3:1 non-text contrast floor — the input is a
  raw `<input>` and was missed by A11Y-016's Textarea sweep; pinned by a Home
  test (`src/screens/Home.tsx`, `src/screens/Home.test.tsx`)
- 2026-05-24:20:34:40 — A11Y-025 — done: implemented the full WAI-ARIA APG menu
  pattern on the ConversationRow row menu — auto-focus first non-disabled
  menuitem on open, ArrowDown / Up cycle with wrap, Home / End jump to the ends,
  case-insensitive 500ms type-ahead, Tab / Shift+Tab close without
  preventDefault, roving tabindex; Copy transcript swapped native `disabled` for
  `aria-disabled` plus an onClick no-op so the item stays focusable per APG
  while preserving the visual disabled state (`src/screens/Home.tsx`,
  `src/screens/Home.test.tsx`)
- 2026-05-24:18:58:12 — A11Y-036 — skipped: still blocked by ARCH-001 (the Back
  affordance's destination depends on the routing model ARCH-001 settles);
  leaving in `1-inbox/` to revisit after ARCH-001 lands
- 2026-05-24:18:57:01 — A11Y-034 — started
- 2026-05-24:18:50:07 — A11Y-033 — started
- 2026-05-24:18:39:30 — A11Y-032 — started
- 2026-05-24:18:36:28 — A11Y-030 — started
- 2026-05-24:18:34:13 — A11Y-029 — started
- 2026-05-24:18:32:14 — A11Y-028 — started
- 2026-05-24:18:30:08 — A11Y-027 — started
- 2026-05-24:18:27:02 — A11Y-026 — started
- 2026-05-24:18:12:41 — IMPRV-016 — done: added a Spinner primitive (Tailwind
  `animate-spin`, `aria-hidden`) and wired it into the three gathering-network
  callouts in Offerer/Joiner; previewed in DesignSystem
- 2026-05-24:18:12:25 — A11Y-025 — started
- 2026-05-24:17:38:00 — A11Y-036 — blocked by ARCH-001 (Back affordance's
  destination is set by the new routing model; revisit after ARCH-001 lands)
- 2026-05-24:17:37:00 — A11Y-031 — ABANDONED: superseded by ARCH-001 (the
  link/button choice for in-app navigation is settled at the architecture level
  by ARCH-001; the EmptyState already uses `<a href="#">` so no residual fix);
  moved to `3-done/`
- 2026-05-24:17:35:00 — BUG-008 — ABANDONED: superseded by ARCH-001 (the route
  vs session gap is the root cause; the routing change subsumes the fix); moved
  to `3-done/`
- 2026-05-24:17:34:00 — ARCH-001 — defined: route the chat surface so
  conversations are addressable
- 2026-05-24:16:05:00 — IMPRV-016 — started
- 2026-05-24:15:55:00 — A11Y-035 — ABANDONED: superseded by A11Y-036 (same
  problem, re-scoped under the new `/work-scope` + `/work-write` flow to drop
  the pre-committed implementation path); moved to `3-done/`
- 2026-05-24:15:48:00 — A11Y-036 — defined: Network header Back affordance is a
  button, not a link
- 2026-05-24:15:19:47 — A11Y-035 — defined: Network header "Back" is a
  `<Button>` that mutates `window.location.hash`
  (`src/network/Network.tsx:269–278`); loses open-in-new-tab / middle-click /
  copy-link-address; replace with `<a href="#">` (bundle with A11Y-031 as a
  shared `<HomeLink>`)
- 2026-05-24:15:18:46 — A11Y-034 — defined: Chat Copy button is `disabled` when
  `messages.length === 0` (`src/components/Chat.tsx:273`) with no programmatic
  explanation; SR users hear "Copy, button, dimmed" only; recommend not
  rendering the toolbar until first message (option b)
- 2026-05-24:15:17:52 — A11Y-033 — defined: Conversation delete confirmation
  uses native `window.confirm()` (`src/screens/Home.tsx:248–255`); inconsistent
  SR announcement and focus lost on dismiss; build a `role="alertdialog"` Dialog
  primitive (likely shared with A11Y-025) and replace the call
- 2026-05-24:15:14:51 — A11Y-032 — defined: Home past-chats `<section>` carries
  `aria-label="Past conversations"` while its nested `<h2>` reads "Past chats" —
  conflicting names; recommend dropping `aria-label` (heading already serves
  navigation), or pointing `aria-labelledby` at the `<h2>` id
- 2026-05-24:15:13:56 — A11Y-031 — defined: Network EmptyState "Back to home" is
  `<a href="#">` for an in-app action; document the link-vs-button choice,
  ensure honesty with sibling main-view affordance (ticket #11 / A11Y-035),
  optionally extract a shared `<HomeLink>` helper
- 2026-05-24:15:12:47 — A11Y-030 — defined: Resume / More-actions buttons in the
  past-chats list share identical accessible names across every row; extend with
  `aria-label={\`Resume
  ${label}\`}`/`aria-label={\`More actions for
  ${label}\`}` so AT in
  out-of-context modes can disambiguate
- 2026-05-24:15:11:34 — A11Y-029 — defined: Chat "Include timestamps" checkbox
  has no visible focus indicator (preflight resets outline; only
  `accent-sky-700` colors the check); add the canonical focus-visible ring +
  offset tokens
- 2026-05-24:15:11:26 — BUG-008 — defined: navigating from a live chat to
  #network and clearing the hash back to home strands the user on the Home list;
  root cause is hashchange listener setting route=home unconditionally, never
  restoring the offerer/joiner screen that hosts the Chat UI
- 2026-05-24:15:10:45 — A11Y-028 — defined: Network per-message timeline's
  horizontal scroll container isn't keyboard-scrollable on Firefox/Safari
  (Chromium-only auto-promotion masks the bug); add tabIndex=0 + role=region +
  aria-label + focus-visible ring (mirrors A11Y-021)
- 2026-05-24:15:09:41 — A11Y-027 — defined: Network per-message timeline
  `<table>` has no accessible name and `<th>` cells lack `scope="col"`; add
  `aria-labelledby="net-timeline-heading"` and `scope="col"` to the five header
  cells
- 2026-05-24:15:08:36 — A11Y-026 — defined: rename input in ConversationRow uses
  border-stone-300/dark:border-stone-600 (≈1.48 / ≈2.4:1), missed by A11Y-016's
  form-control contrast bump; bump to stone-400/stone-500 to clear WCAG 1.4.11
  3:1
- 2026-05-24:15:07:13 — A11Y-025 — defined: ConversationRow row menu claims
  role=menu but doesn't implement APG keyboard pattern (arrow keys, type-ahead,
  focusable aria-disabled items); recommend dropping menu role or implementing
  the full contract
- 2026-05-24:15:05:40 — IMPRV-016 — defined: animated spinner alongside
  "(gathering network candidates)…" callout — inline SVG + Tailwind animate-spin
  (no Hero Icons dep), shared across Offerer/Joiner gathering states
- 2026-05-24:10:09:00 — BUG-006 — RESOLVED: saved transcript loses author and
  timestamp after a live session (src/hooks/useChatSession.ts,
  src/hooks/useChatSession.test.ts) — wrote the four suggested distinguishing
  tests; #1/#2/#3 all passed, ruling out the named hypotheses. A fourth race
  surfaced: `bindConversation`'s fire-and-forget seed unconditionally replaces
  both `messages` state and `knownIdsRef`, wiping any live `send`/`chat`-receive
  that landed during the bind window. Fix: union persisted records into both
  (skip-on-known, sort by `at`) instead of replacing; `historySnapshotRef` stays
  from-storage-only so live entries aren't double-sent.
- 2026-05-24:09:50:33 — BUG-007 — RESOLVED: nine "not wrapped in act(...)"
  warnings emitted by `useChatSession.test.ts` (src/hooks/useChatSession.ts,
  src/test-setup.ts, src/hooks/useChatSession.test.ts) — replaced
  `queueMicrotask(commitTelemetry)` inside `transition()` with a `setState`
  version bump driven by a `useEffect` (commits in React's commit phase so
  `act()` wraps it naturally); added a `console.error` failure guard in
  test-setup so future regressions hard-fail; added a regression test pinning
  the contract that sync `act()` blocks see the telemetry update; also renamed
  two stale `BUG-007` code comments to `FEAT-008`
- 2026-05-24:09:37:36 — IMPRV-015 — REVERTED: tried jsdom → happy-dom swap; 6
  failures across 4 happy-dom compat gaps (`window.confirm` undefined,
  `textarea.rows` returns string, `compareDocumentPosition` returns 0,
  `history.replaceState` fires async hashchange — the last violates HTML spec
  and breaks BUG-007 App tests by re-routing through `clearHash`). Lever is real
  (~6.61s → ~5.9s, environment line down ~60%) but blocker is happy-dom's
  non-spec hashchange dispatch; revisit when happy-dom matches spec. Detailed
  gaps + per-failure fixes captured in ticket working notes (`vitest.config.ts`,
  `package.json`)
- 2026-05-24:09:23:59 — IMPRV-014 — RESOLVED: set `test.isolate: false` so
  workers reuse the JS env across files; registered `afterEach(cleanup)` in
  `src/test-setup.ts` because RTL's import-time auto-cleanup only registers
  against the first file in a worker; 5/5 consecutive `npm test` runs pass
  343/343; wall-clock ~12.07s → ~6.46s (~5.6s / ~46% faster) on top of
  post-IMPRV-013 baseline (`vitest.config.ts`, `src/test-setup.ts`)
- 2026-05-24:09:18:02 — IMPRV-013 — RESOLVED: split Vitest into `core` (node) +
  `dom` (jsdom) projects via `projects` API (Vitest 4 dropped
  `environmentMatchGlobs`); `clipboard.test.ts` and `url.test.ts` opt back into
  jsdom via pragma; 343/343 pass; `time npm test` ~14.54s → ~12.33s (~2.2s /
  ~15% faster) (`vitest.config.ts`, `src/core/clipboard.test.ts`,
  `src/core/url.test.ts`)
- 2026-05-24:09:07:00 — IMPRV-015 — jsdom environment setup is the largest
  single overhead in the test run (72.86s cumulative); swap to happy-dom (~2-3×
  faster) and watch focus/computed-style edge cases (`vitest.config.ts`,
  `package.json`) — open
- 2026-05-24:09:06:00 — IMPRV-014 — Vitest tears down its environment between
  every test file; set `test.isolate: false` to reuse the env within a worker
  once IDB cleanup is audited (`vitest.config.ts`) — open
- 2026-05-24:09:05:00 — IMPRV-013 — Pure-utility tests under `src/core/**` run
  under jsdom unnecessarily; split env so those use `node` and only DOM tests
  pay jsdom setup cost (`vitest.config.ts`) — open
- 2026-05-24:08:38:48 — BUG-007 — 9 React "not wrapped in act(...)" warnings
  emitted by `useChatSession.test.ts` (src/hooks/useChatSession.ts,
  src/hooks/useChatSession.test.ts) — root cause is `transition()` scheduling
  `commitTelemetry` via `queueMicrotask`, which escapes synchronous
  `act(() => …)` blocks in 6 tests; suggested fix is to drive `commitTelemetry`
  from a `useEffect` (or, as a fallback, await microtasks in the affected tests)
  plus a `console.error` failure guard in `src/test-setup.ts` to keep future
  regressions visible
- 2026-05-24:08:25:58 — BUG-006 — Saved-conversation transcript shows every
  message as "You" under one timestamp when copied from Home's row menu
  (src/screens/Home.tsx, src/hooks/useChatSession.ts, src/core/storage.ts);
  in-chat Copy transcript is correct, so the corruption is on the persistence or
  rebind path — ticket lays out three hypotheses (history-merge race,
  polite-defer abandoned conv, bind-race) and proposes end-to-end
  live-session→storage→formatTranscript tests to localize the fix.
- 2026-05-23:18:05:06 — IMPRV-012 — RESOLVED: group consecutive same-author
  messages under one heading in copied transcripts; date rollover still restarts
  the run (`src/core/transcript.ts`, `src/core/transcript.test.ts`)
- 2026-05-23:18:01:14 — IMPRV-011 — RESOLVED: cull empty conversations on first
  Home mount via new `cullEmptyConversations` storage helper, gated by a
  per-hook-instance ref so post-mount stubs survive (`src/core/storage.ts`,
  `src/hooks/useConversations.ts`)
- 2026-05-23:17:53:20 — IMPRV-010 — RESOLVED: relabel "Connection lost" CTA to
  "Return home" and update body copy to note the transcript is saved
  (`src/screens/Offerer.tsx`, `src/screens/Joiner.tsx`)
- 2026-05-23:17:49:59 — IMPRV-009 — Adds "Copy transcript" action to Home row
  menu via a shared `src/core/clipboard.ts` helper (extracted from `Chat.tsx`'s
  FEAT-011 copy); disabled for empty conversations, with inline badge +
  LiveRegion feedback — resolved
- 2026-05-23:17:42:13 — IMPRV-008 — Conversation-row "More actions" menu now
  dismisses on outside click and Escape; state lifted to `Home` for single-open
  invariant (`src/screens/Home.tsx`) — resolved
- 2026-05-23:17:22:34 — IMPRV-012 — Copied transcript repeats the `**You**` /
  `**Them**` heading on every consecutive same-sender message; group runs under
  a single heading (`src/core/transcript.ts`) — open
- 2026-05-23:17:16:36 — IMPRV-011 — Empty conversations linger in IndexedDB and
  clutter the Home list; sweep zero-message conversations on first Home mount
  (`src/hooks/useConversations.ts`, `src/core/storage.ts`) — open
- 2026-05-23:17:06:34 — FEAT-013 — Mobile-responsive chat: add
  `interactive-widget=resizes-content` to the viewport meta, raise form-field
  font-size to 16px on touch-primary devices, and swap the connected
  Offerer/Joiner screens from `100vh` to `100dvh` so the chat composer stays
  above the iOS soft keyboard and focusing a field no longer auto-zooms —
  resolved
- 2026-05-23:09:31:06 — FEAT-008 — Polite peer: when both peers click "Start a
  new chat", let whichever pastes the other's offer code into the reply-code
  textarea first politely abandon their own offer and answer instead, so the
  handshake completes without an error — resolved
- 2026-05-23:09:27:22 — IMPRV-010 — "Connection lost" CTA is labelled "Start a
  new chat" but should route home to surface the conversation list
  (`src/screens/Offerer.tsx`, `src/screens/Joiner.tsx`) — open
- 2026-05-23:09:26:49 — IMPRV-009 — Conversation-row "More actions" menu is
  missing a "Copy transcript" action (`src/screens/Home.tsx`) — open
- 2026-05-23:09:26:08 — IMPRV-008 — Conversation-row "More actions" menu doesn't
  dismiss on outside click or Escape (`src/screens/Home.tsx`) — open
- 2026-05-23:09:15:09 — FEAT-012 — Resume conversation: persist each peer's
  transcript locally in IndexedDB keyed by a conversation UUID, list past chats
  on Home with Resume/Rename/Delete, embed `&conv=<uuid>` in the invite URL, and
  on data-channel-open exchange a `history` envelope so both peers (including a
  peer on a fresh device with no local history) end up looking at the same
  merged-by-ID timeline with a "Resumed here" divider above the new session —
  resolved
- 2026-05-23:08:43:29 — FEAT-011 — Copy conversation: add a Copy button and an
  "Include timestamps" toggle to the chat surface that writes the whole
  transcript to the clipboard as markdown — either `# date` / `**You** · time`
  form or just `**You**` + body — reusing the existing `m.at` data with no
  wire-protocol change — resolved
- 2026-05-23:08:36:11 — FEAT-010 — Network telemetry: introduce a versioned JSON
  wire envelope, run an NTP-style clock-sync handshake on connect, send
  delivered receipts for every chat message (rendered as a single ✓ check on
  outgoing bubbles), log RTT/offset/state-change samples to an in-memory ring
  buffer, and ship a `#network` diagnostic route showing the per-session report
  — resolved
- 2026-05-23:08:19:34 — FEAT-009 — Migrate neutral palette from `slate` to
  `stone` (whole app, both light and dark): swap every `slate-*` utility class
  to the same-numbered `stone-*`, update the `index.css` body-fallback hex
  codes, and refresh the design-system swatch row; brand/accent colors untouched
  — resolved
- 2026-05-23:07:53:26 — IMPRV-006 — `useChatSession` has no internal
  state-machine guards — leaks PCs on re-entry and pushes invariants onto the
  view (`src/hooks/useChatSession.ts`) — resolved
- 2026-05-23:07:52:30 — IMPRV-007 — Connected chat page scrolls in addition to
  the transcript — `Chat`'s outer wrapper isn't bounded inside its flex-column
  parent (`src/components/Chat.tsx`) — resolved
- 2026-05-23:07:36:44 — A11Y-024 — DesignSystem screen previews are fully
  tab-navigable but wired to no-op handlers, creating 20+ dead tab stops and
  unactionable controls for keyboard users (WCAG 2.4.3, 3.2.4, 4.1.2, 2.4.6) —
  RESOLVED: Set React 19's `inert` JSX boolean prop (+
  `aria-label="<label> (preview, non-interactive)"`) on the `ScreenPreview`
  content wrapper in `src/design-system/DesignSystem.tsx`, removing ~20 dead tab
  stops and stopping the CopyBox Copy button inside previews from silently
  overwriting the reviewer's clipboard; interactive Chat organism rendered
  outside `<ScreenPreview>` remains keyboard-operable (regression test guards
  it) (commit 7a0ff64)
- 2026-05-23:07:17:35 — A11Y-023 — DesignSystem theme toggle selected-state ring
  is graphically identical to the focus-visible ring, defeating focus visibility
  for sighted keyboard users (WCAG 2.4.7, 1.4.11) — resolved
- 2026-05-23:07:13:19 — A11Y-022 — DesignSystem screen previews steal initial
  keyboard/AT focus from the page heading via competing `useFocusOnMount` calls
  (WCAG 2.4.3, 2.4.6) — RESOLVED: Extended `ScreenChromeContext` with an
  optional `suppressInitialFocus` flag and gated `useFocusOnMount` on a paired
  `{ skip }` option; `Home`/`Offerer`/`Joiner` read the flag via
  `useScreenChrome()` so the six screens mounted in the design-system showcase
  stop racing to programmatically focus their `<h1>` and stealing focus into a
  preview region; production routes keep the default (focus fires on mount,
  A11Y-005 preserved); also wired the showcase page's own `<h1>` through
  `useFocusOnMount` for a meaningful initial-focus target (commit 9657837)
- 2026-05-23:06:50:00 — A11Y-021 — Chat transcript scrollable region is not
  keyboard-focusable; Firefox/Safari users cannot scroll history with the
  keyboard alone (WCAG 2.1.1, 2.4.11) — RESOLVED: Added `tabIndex={0}` and
  `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400`
  to the chat transcript wrapper `<div role="log">` so Firefox/Safari
  keyboard-only users (and screen-magnifier / switch users) can Tab into the
  scroll container and use Arrow / PageUp / PageDown / Home / End to read
  history; initial-focus policy unchanged (composer still wins on mount) (commit
  ac5c085)
- 2026-05-23:06:43:35 — A11Y-020 — CopyBox "Copied!" success callout
  auto-dismisses after 1500ms with no extend / pause / disable control (WCAG
  2.2.1) — RESOLVED: Dropped the 1500ms `setTimeout` from CopyBox's
  success-state helper (renamed `flashCopied` → `markCopied`); "Copied!" now
  persists until a new copy attempt, a `value` prop change (new
  `useEffect([value])`), or unmount supersedes it, satisfying WCAG 2.2.1 by
  removing the time limit entirely; `aria-hidden` on the success callout and the
  `LiveRegion` single-announcement are preserved (commit c4fe5fd)
- 2026-05-23:06:39:24 — A11Y-019 — CopyBox warning callout marked
  `aria-hidden="true"` hides actionable manual-copy instruction from assistive
  tech; live-region one-shot is not a durable substitute (WCAG 1.3.1, 3.3.2,
  4.1.2) — RESOLVED: Dropped `aria-hidden="true"` from the CopyBox manual-copy
  warning Callout, wired the Textarea with conditional
  `aria-describedby="${textareaId}-manual-copy"` so SRs announce the instruction
  on focus, and slimmed the manual-copy `LiveRegion` to an attention-getter so
  the live region alerts and the durable Callout instructs; success callout
  retains `aria-hidden` per scope (commit f264d50)
- 2026-05-23:06:34:20 — A11Y-018 — Chat transcript uses `aria-live="polite"` on
  an `<ol>` instead of `role="log"`, causing wrong role exposure plus spurious
  announcements from the in-region empty-state and date-divider `<li>`s (WCAG
  4.1.2, 4.1.3) — RESOLVED: Wrapped the chat transcript `<ol>` in a
  `<div role="log" aria-label="Chat transcript" aria-live="polite" aria-relevant="additions" aria-atomic="false">`
  (also the scroll container), moved the empty-state to an `aria-hidden` `<p>`
  sibling of the `<ol>` so it no longer mutates inside a live region, and marked
  date dividers `role="presentation"` + `aria-hidden="true"` so they don't
  contribute to the list item count or live-region noise (commit fa9d48e)
- 2026-05-23:06:29:34 — A11Y-017 — Heading component strips focus indicator via
  `focus:outline-none` with no replacement, leaving programmatically-focused h1s
  invisible to sighted keyboard users (WCAG 2.4.7, 2.4.11) — RESOLVED: Replaced
  Heading primitive's bare `focus:outline-none` (no replacement) with the
  Button/Textarea pattern:
  `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2`
  plus `ring-offset-slate-50 / dark:ring-offset-slate-900` to blend into the
  real page surface, restoring a visible focus cue on every
  `useFocusOnMount`-driven screen transition for sighted keyboard users (commit
  e72672b)
- 2026-05-23:06:24:37 — A11Y-016 — Form control borders (Textarea + Button
  secondary) fail non-text contrast 3:1 in light and dark mode (WCAG 1.4.11) —
  RESOLVED: Bumped Textarea + Button(secondary) resting-state border tokens from
  `slate-300 / slate-700` (1.48 / 1.75:1) to `slate-400 / slate-500` (≈3.00 /
  3.45:1) so control boundaries clear WCAG 1.4.11's 3:1 non-text contrast floor
  in light and dark mode; decorative slate-300/700 borders intentionally left
  as-is (commit 7008835)
- 2026-05-23:06:22:06 — A11Y-015 — Chat message timestamps use 10px font +
  low-contrast color in all three bubble states (WCAG 1.4.3, 1.4.4) — RESOLVED:
  Bumped chat per-message timestamp from `text-[10px]` → `text-xs` and swapped
  low-contrast `text-sky-100/80` / `text-slate-500 dark:text-slate-300/70` for
  `text-white` (outgoing) and `text-slate-600 dark:text-slate-400` (incoming) so
  all three bubble states clear AA 4.5:1 (commit f301f12)
- 2026-05-23:06:18:50 — A11Y-014 — Primary brand surface (`bg-sky-600` +
  `text-white`) fails color contrast on outgoing chat bubbles and primary
  buttons (WCAG 1.4.3) — RESOLVED: Promoted primary brand token from `sky-600` →
  `sky-700` (with `hover:bg-sky-800` darkening) on Button, Chat outgoing bubble,
  and Design System swatch so `text-white` clears AA 4.5:1 contrast
- 2026-05-23:06:16:57 — A11Y-013 — Multiple `<main>` landmarks and multiple
  `<h1>` elements on the Design System page (WCAG 1.3.1, 2.4.1) — RESOLVED:
  Added `ScreenChromeContext` + `ScreenContainer` to demote nested
  `<main>`/`<h1>` inside the Design System showcase, and `Heading as="p"` for
  typography swatches (commit 0cb681b)
- 2026-05-22:22:51:20 — FEAT-007 — Design system route + extract atomic
  primitives: ship a `#design-system` showcase page; extract Button / Heading /
  Textarea / Callout / Divider / LiveRegion into shared files in
  `src/components/` and consume them from every screen — resolved
- 2026-05-22:22:15:04 — FEAT-006 — WhatsApp-style date headers and per-message
  timestamps: drop the `You`/`Them` captions; render a centered locale-full date
  header above the first message (and on every local-day rollover); show
  locale-short time inside each bubble's bottom-right — resolved
- 2026-05-22:22:10:15 — FEAT-005 — Use system-only fonts: drop the explicit
  `body { font-family }` override in `src/index.css` and rely on Tailwind v4
  preflight so UI sans and code mono render in each OS's native fonts; zero font
  network requests — resolved
- 2026-05-22:22:07:51 — FEAT-004 — Multi-line chat composer: swap chat input for
  an auto-growing textarea; Enter sends, Shift+Enter inserts a newline, message
  bubbles preserve line breaks — resolved
- 2026-05-22:22:04:29 — FEAT-003 — Enter submits the reply code: on the Offerer
  screen, Enter in the reply-code textarea submits; Shift+Enter still inserts a
  newline — resolved
- 2026-05-22:22:02:21 — FEAT-002 — Keep message input focused: refocus
  `#chat-input` after every send, on initial connect, and when the input is
  re-enabled after a disconnect — resolved
- 2026-05-22:21:57:37 — FEAT-001 — Dark mode: render the app in a dark palette
  when the OS reports `prefers-color-scheme: dark`, no in-app toggle in v1 —
  resolved
- 2026-05-22:21:38:38 — BUG-005 — Post-connect channel drop re-renders stale
  setup UI instead of a "Connection lost" screen (src/screens/Offerer.tsx,
  src/screens/Joiner.tsx) — RESOLVED: added a `'closed'` terminal state, split
  `channel.onclose` to route `connected→closed` (post-connect drop) vs. other
  non-terminal→`'failed'` (setup), and rendered a dedicated "Connection lost /
  Start a new chat" view on both screens (no stale encodedLocal)
- 2026-05-22:21:33:54 — BUG-004 — `CopyBox` clipboard fallback selects without
  copying and gives no UI signal (src/components/CopyBox.tsx) — RESOLVED: added
  `document.execCommand('copy')` fallback after `writeText` rejection, and a
  visible amber "Press Ctrl+C / Cmd+C" hint (announced via the existing
  `role="status"`) when both clipboard paths fail
- 2026-05-22:21:30:22 — BUG-003 — `wireChannel` misses `onopen` on the answerer
  when the channel is already `'open'` at attach time
  (src/hooks/useChatSession.ts, src/core/rtc.ts) — RESOLVED: wireChannel
  short-circuits to `'connected'` when `readyState === 'open'` so the
  late-dispatched `ondatachannel` event still drives the state transition
- 2026-05-22:21:17:23 — BUG-002 — Data-channel `onclose` only escalates from
  `'connected'`; pre-open failures leave the session stuck on the spinner
  (src/hooks/useChatSession.ts) — RESOLVED: widened onclose to escalate any
  non-terminal state to `'failed'` (preserving `'idle'`/`'failed'`)
- 2026-05-22:21:14:36 — BUG-001 — `clearHash` effect dep is `route.kind`, so
  same-tab joiner→joiner re-routes never scrub the fragment (src/App.tsx) —
  RESOLVED: widened dep array to `[route]` so same-kind/different-offer
  transitions re-run the scrub
- 2026-05-22:21:11:29 — A11Y-012 — Connection state transitions are not
  announced to screen readers (WCAG 4.1.3) — RESOLVED: Added persistent sr-only
  `role="status" aria-live="polite"` region per screen with state→message
  mapping; dropped duplicate `role="status"` from visible gathering hint (commit
  685d5f3)
- 2026-05-22:21:07:50 — A11Y-011 — Chat input placeholder fails color contrast
  (WCAG 1.4.3) — RESOLVED: Bumped chat input placeholder from
  `placeholder-slate-500` to `placeholder-slate-400` to meet AA contrast on
  slate-900 (commit d519020)
- 2026-05-22:21:06:26 — A11Y-010 — Chat empty-state text fails color contrast
  (WCAG 1.4.3) — RESOLVED: Bumped chat empty-state copy from `text-slate-500` to
  `text-slate-400` to meet AA contrast on slate-900 (commit 483408b)
- 2026-05-22:21:04:34 — A11Y-009 — Form error not programmatically associated
  with answer textarea (WCAG 3.3.1, 1.3.1) — RESOLVED: Associated Offerer error
  with answer textarea via `aria-invalid` +
  `aria-describedby="answer-help answer-error"` (commit 155313e)
- 2026-05-22:21:01:48 — A11Y-008 — `aria-live="polite"` placed on the
  interactive Copy button (WCAG 4.1.3, 4.1.2) — RESOLVED: Removed `aria-live`
  from Copy button; success now routed through a sibling sr-only `role="status"`
  live region (commit 960be85)
- 2026-05-22:20:59:37 — A11Y-007 — Insufficient focus indicator on textareas and
  inputs (WCAG 2.4.7, 2.4.11) — RESOLVED: Switched inputs/textareas to
  `focus-visible:` with a 2px sky-400 ring to meet WCAG 2.4.7 / 2.4.11 (commit
  c33fc06)
- 2026-05-22:20:57:38 — A11Y-006 — Critical instruction lives only in
  placeholder text (WCAG 3.3.2, 1.4.3) — RESOLVED: Replaced Offerer answer-input
  placeholder with a persistent helper `<p id="answer-help">` +
  `aria-describedby` (commit 79d6507)
- 2026-05-22:20:55:12 — A11Y-005 — Focus is not moved when navigating between
  screens (WCAG 2.4.3) — RESOLVED: Added `useFocusOnMount` hook; each screen's
  `<h1>` is now focused on navigation (commit 29674c7)
- 2026-05-22:20:51:36 — A11Y-004 — Chat message sender conveyed only visually
  (WCAG 1.3.1, 1.4.1) — RESOLVED: Added sr-only "You/They said:" prefix and
  visible "You/Them" caption to chat transcript bubbles (commit 07e2b93)
- 2026-05-22:20:49:12 — A11Y-003 — Page `<title>` never updates with SPA route
  changes (WCAG 2.4.2) — RESOLVED: Added `usePageTitle` hook; each screen sets
  `document.title` per state (commit 0e98c70)
- 2026-05-22:20:46:08 — A11Y-002 — No `<main>` landmark on any screen (WCAG
  1.3.1, 2.4.1) — RESOLVED: Wrapped each screen's root in `<main>` landmark
  (commit 5cabcf8)
- 2026-05-22:20:41:23 — A11Y-001 — CopyBox uses invalid HTML IDs containing
  spaces (WCAG 1.3.1, 4.1.2) — RESOLVED: CopyBox invalid HTML IDs fixed via
  `useId()` + `useRef` (commit e1c368d)
- 2026-05-22:20:36:34 — IMPRV-005 — `Chat` always scrolls to bottom on new
  message, yanking users out of scrollback (`src/components/Chat.tsx`) —
  resolved
- 2026-05-22:20:33:08 — IMPRV-004 — `Offerer` screen reads `location` and
  `import.meta.env` directly, blurring view/controller boundary
  (`src/screens/Offerer.tsx`) — resolved
- 2026-05-22:20:29:26 — IMPRV-003 — `useChatSession` controller has no unit
  tests (`src/hooks/useChatSession.ts`) — resolved
- 2026-05-22:20:24:38 — IMPRV-002 — Module-level mutable `messageCounter`
  violates functional core principle (`src/hooks/useChatSession.ts`) — resolved
- 2026-05-22:20:17:27 — IMPRV-001 — No timeout when waiting for ICE gathering to
  complete (`src/core/rtc.ts`) — resolved
