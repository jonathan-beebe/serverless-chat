# IMPRV-001: No timeout when waiting for ICE gathering to complete

**Status:** Resolved **Severity:** High **Location:** `src/core/rtc.ts` (lines
32-43), used by `createOffer` (line 56) and `acceptOffer` (line 89)

## Problem

`waitForIceComplete` resolves only when `pc.iceGatheringState` transitions to
`'complete'`:

```ts
function waitForIceComplete(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve()
    const handle = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', handle)
        resolve()
      }
    }
    pc.addEventListener('icegatheringstatechange', handle)
  })
}
```

If gathering never completes — STUN servers blocked, network change mid-flight,
or the not-uncommon browser behavior where the state stalls in `gathering` for
tens of seconds — this promise never resolves. The user is stranded on:

- `"Preparing invite (gathering network candidates)…"` (Offerer,
  `src/screens/Offerer.tsx:62-66`)
- `"Preparing reply (gathering network candidates)…"` (Joiner,
  `src/screens/Joiner.tsx:81-85`)

indefinitely, with no feedback and no way to recover other than reloading the
tab.

The spike document (§7.5 / `__local__/spike-p2p-chat.md`) explicitly calls out
that `'failed'` ICE should surface to the user so they "know they need a fresh
invite exchange". Hanging silently violates that contract.

## Intended behavior

Even in the worst case, the user should get a definitive answer within a bounded
amount of time — typically 5-10 seconds is plenty on a healthy network. If
gathering stalls past that, treat it as a soft failure: resolve with whatever
candidates we have (non-trickle SDP still includes the candidates that did
arrive), or reject so the hook can transition to `'failed'` and show the
existing "Couldn't establish a direct connection. Try a different network."
message.

## Suggested fix

Add a bounded timeout (default ~5 s):

```ts
function waitForIceComplete(
  pc: RTCPeerConnection,
  timeoutMs = 5000,
): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve()
    const handle = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', handle)
        clearTimeout(timer)
        resolve()
      }
    }
    pc.addEventListener('icegatheringstatechange', handle)
    const timer = setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', handle)
      resolve()
    }, timeoutMs)
  })
}
```

`pc.localDescription` will still contain the host + reflexive candidates
gathered so far, which is usually enough for at least one peer pair on a typical
network. The downstream `connectionState === 'failed'` listener in
`useChatSession` (line 61) will fire if the partial candidate set can't connect,
taking us to the existing `'failed'` UI.

Add a unit test that exercises both paths (gathers within the timeout, and
stalls past the timeout). The `FakePeerConnection` stub already used in
`App.test.tsx` is a good starting point — promote it to a shared test util.

## Working notes

- `waitForIceComplete` is currently private to `rtc.ts`. To unit-test the
  timeout branch I'll export it (it's a small, pure utility around the spec API
  — exporting it is the simplest change).
- The function pattern I'll use mirrors the spec's suggested fix: existing
  event-driven resolution plus a `setTimeout` that resolves the promise after
  `timeoutMs` and removes the listener. Default timeout is 5000ms.
- Tests will use `vi.useFakeTimers()` so the stall path doesn't make the suite
  slow. Use a minimal fake `RTCPeerConnection` with
  `addEventListener`/`removeEventListener` and a mutable `iceGatheringState` —
  no need to share with App.test.tsx since they exercise different surfaces and
  sharing would couple two test files together. Keep it local.
- The downstream callers (`createOffer`, `acceptOffer`) don't need to change: a
  soft-failure resolve means they proceed with `pc.localDescription` containing
  whatever candidates were gathered, and the existing `'failed'` UI in
  `useChatSession` will catch the case where the partial set can't connect.
