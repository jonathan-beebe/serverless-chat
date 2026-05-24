# Known limitations

Things the spike does not handle yet, with notes on how we'd close each gap if
this graduated from "two-tab demo" to something real.

## Optional TURN relay — strict-NAT peers can connect when configured

The browser is configured with STUN by default (`ICE_CONFIG` in
`src/core/rtc.ts`). STUN tells each peer its public IP as seen from the
internet, which is enough for most home networks. It is **not** enough when both
peers sit behind **symmetric NATs** — common on corporate guest Wi-Fi, VPN
exits, some carrier-grade NAT, and strict firewalls — because the public IP/port
each side discovers via STUN won't accept inbound traffic from the other peer.

A TURN entry is now **optionally** appended to `ICE_CONFIG` when the
`VITE_TURN_URLS` / `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL` env vars are
set (see `.env.example`). When unset, behavior is STUN-only and unchanged. Wired
in commit `ce6e25a`.

When the env vars are **unset and** both peers are behind symmetric NATs: ICE
gathering finishes, the SDPs exchange fine, and then `pc.connectionState`
transitions to `failed` after connectivity checks time out. The user sees the
generic "Try a different network" UI (see `BUG-005`).

In dev, the cause is no longer opaque — `src/core/rtcDiagnostics.ts` logs every
ICE candidate as it's gathered (with type: `host` / `srflx` / `relay`), emits
`icecandidateerror` events with the STUN/TURN response code, and on `connected`
dumps the selected candidate pair so you can tell whether the chat is going
direct or via a relay. Production builds stay quiet.

### What TURN would fix

A **TURN** (Traversal Using Relays around NAT) server is a relay that both peers
connect _outbound_ to (which every NAT permits) and which shuttles encrypted
bytes between them. The chat stays end-to-end private — TURN sees the DTLS
ciphertext, not message content — but the IP-layer path is no longer
peer-to-peer.

Mechanically, `buildIceServers()` in `src/core/rtc.ts` appends a TURN entry to
the base STUN-only list when the three env vars are set:

```ts
return [...BASE_ICE_SERVERS, { urls, username, credential }]
```

A provider that hands you several URL variants for the same server (e.g.
Metered's `:80`, `:80?transport=tcp`, `:443`, `turns:…:443?transport=tcp`) goes
in as a comma-separated `VITE_TURN_URLS` — all four variants share one
username/credential pair, and ICE races them.

### Caveats of step 2 (where we are)

TURN bandwidth costs money, so credentials shipped in client JS get scraped and
abused. We're paying that cost knowingly for the spike: `VITE_TURN_*` vars are
bundled into the client by Vite, so any public deployment of the built bundle
leaks the credentials to anyone viewing source. For `npm run dev` on localhost —
the only context this is currently used in — the creds never leave the dev
machine. The standard production fix is short-lived HMAC-signed credentials
minted by a backend (the "TURN REST API" spec), which is step 3 below.

### Maturity path

Ordered from cheapest to most production-shaped:

1. **Accept and document.** Tell users "if it won't connect, try a phone
   hotspot." Honest, zero infra. Default behavior when no TURN env vars are set.
2. **Hosted TURN with static credentials** (Metered, Xirsys, Twilio free tiers).
   No backend; credentials live in the bundle. Fine for a spike, abuse-prone for
   anything public. **Where we are today** (commit `ce6e25a`, Metered free tier,
   env-var-driven so contributors without creds fall back to step 1).
3. **Cloudflare Worker that mints short-lived TURN tokens** (~20 lines).
   Introduces a server, but one that only hands out 10-minute relay credentials
   — it never sees chat content, so the privacy story stays intact. Cloudflare
   Realtime TURN has a generous free tier and pairs well with the STUN servers
   we already use.
4. **Self-hosted coturn on a small VPS** plus the credential-minting Worker.
   Full control, fixed monthly cost, ops burden.

The intended path is 1 → 2 → 3. We jumped to step 2 once a real VPN'd test on
public Wi-Fi confirmed the symmetric-NAT diagnosis the diagnostics module had
predicted; step 3 is the right move before any public deploy.

### When to revisit

- Anyone reports "the invite link doesn't work" and the cause turns out to be
  NAT topology, not a bug.
- We start using this on guest Wi-Fi, conference Wi-Fi, or carrier mobile
  networks where symmetric NAT is the norm.
- Scope expands beyond two people on home networks.

## Related rough edges (not addressed here)

- `waitForIceComplete` swallows the timeout-vs-complete distinction
  (`src/core/rtc.ts`), so the offerer can't warn the user _before_ sending the
  invite that STUN didn't respond and the link may only work on the same LAN.
  Diagnostics now log "ICE gathering complete in Xms" vs the "no srflx/relay
  candidates" warning in DevTools (commit `ce6e25a`), but that's a developer
  signal — the function itself still returns `void` either way and the user flow
  is unchanged.
- No retry on transient STUN failure during gathering.
- `ICE_GATHERING_TIMEOUT_MS` is hardcoded at 5s and not tunable per network.
