# BUG-001: `clearHash` effect misses joiner→joiner transitions

**Status:** Resolved **Severity:** Medium **Location:** `src/App.tsx` (lines
33-35)

## Problem

The hash-scrubbing effect in `App.tsx` declares only `route.kind` as its
dependency:

```tsx
// Scrub the fragment once we've captured the offer in component state, so a
// refresh doesn't try to re-enter the joiner flow with a now-stale offer.
useEffect(() => {
  if (route.kind === 'joiner') clearHash()
}, [route.kind])
```

A `hashchange` listener (added in commit `f836f41` — "fix: re-route to Joiner
when invite URL opens in an existing tab") updates `route` to a fresh
`{ kind: 'joiner', offerCode: newOffer }` when the OS opens a new invite URL
into a tab already showing the Joiner:

```tsx
const onHashChange = () => {
  const next = routeFromHash()
  if (next.kind === 'joiner') setRoute(next)
}
```

Because `route.kind` does not change across this transition (it was already
`'joiner'`), the scrubbing effect does not re-run. The new `#offer=<code>`
remains in the URL.

## Intended behavior

Once a fragment-borne offer has been lifted into component state, the URL
fragment should be removed so a refresh doesn't try to re-enter the joiner flow
with a now-stale offer. This is the explicit goal stated in the inline comment.

## Actual behavior

After a same-tab joiner→joiner navigation, the URL keeps `#offer=<newCode>`
indefinitely. If the user refreshes, `routeFromHash()` reads the stale offer
back out of the fragment and the App tries to re-enter the joiner flow with it.
This is exactly the failure mode the scrub was added to prevent — the fix in
`f836f41` handles routing for the new invite but leaves the fragment behind.

## Root cause

A primitive dependency (`route.kind`) was chosen instead of the full route
object. The dependency array does not change when a transition is "same-kind,
different-offer", so the effect short-circuits.

## Suggested fix

Two reasonable options:

1. **Depend on `route`** (or specifically on
   `route.kind === 'joiner' ? route.offerCode : null`) so the effect re-runs
   every time a new offer arrives. Cheapest change:

   ```tsx
   useEffect(() => {
     if (route.kind === 'joiner') clearHash()
   }, [route])
   ```

2. **Move `clearHash()` to the call sites that set the joiner route** — once
   inside the `useState` initializer's caller (or just after first render,
   guarded), and once inside the `hashchange` handler right after
   `setRoute(next)`. Removes the implicit "scrub-via-effect" indirection.

Option 1 is the smaller diff and preserves the current structure. Either fix
should be covered by a new test case in `App.test.tsx` that asserts
`location.hash` is empty after a same-tab joiner→joiner `hashchange`.

## Working notes

- Confirmed bug still present in `src/App.tsx` lines 33-35 — dep was
  `[route.kind]`.
- Added a failing test in `src/App.test.tsx` ("scrubs the URL fragment on a
  same-tab joiner→joiner hashchange"): boots with an initial `#offer=` fragment
  (scrubbed on mount), then fires a `hashchange` with a new `#offer=`. Pre-fix
  it asserted `location.hash === ''` and failed with the new fragment still in
  place — matching the ticket's failure mode exactly.
- Applied Option 1 (smallest diff): widened the effect's dep array from
  `[route.kind]` to `[route]`. Object identity changes every time
  `setRoute(next)` runs in the hashchange handler, so the scrub re-runs on
  same-kind, different-offer transitions. Comment expanded to explain why.
- All 46 tests pass; `tsc --noEmit` and `eslint src` clean.
