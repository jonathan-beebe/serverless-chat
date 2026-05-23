# Known limitations

Things the spike does not handle yet, with notes on how we'd close each gap if
this graduated from "two-tab demo" to something real.

## No TURN relay — strict-NAT peers can't connect

The browser is configured with STUN only (`ICE_CONFIG` in `src/core/rtc.ts`).
STUN tells each peer its public IP as seen from the internet, which is enough
for most home networks. It is **not** enough when both peers sit behind
**symmetric NATs** — common on corporate guest Wi-Fi, some carrier-grade NAT,
and strict firewalls — because the public IP/port each side discovers via STUN
won't accept inbound traffic from the other peer.

When this happens today: ICE gathering finishes, the SDPs exchange fine, and
then `pc.connectionState` transitions to `failed` after connectivity checks time
out. The user sees the generic "Try a different network" UI (see `BUG-005`) with
no signal that the issue is structural rather than transient.

### What TURN would fix

A **TURN** (Traversal Using Relays around NAT) server is a relay that both peers
connect _outbound_ to (which every NAT permits) and which shuttles encrypted
bytes between them. The chat stays end-to-end private — TURN sees the DTLS
ciphertext, not message content — but the IP-layer path is no longer
peer-to-peer.

Mechanically the change is one line in `ICE_CONFIG`:

```ts
iceServers: [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'turn:turn.example.com:3478', username: '…', credential: '…' },
],
```

### Why we haven't done it

TURN bandwidth costs money, so static credentials shipped in client JS get
scraped and abused. The standard pattern is short-lived HMAC-signed credentials
minted by a backend (the "TURN REST API" spec). That conflicts with the spike's
thesis that _no server sees the chat_.

### Maturity path

Ordered from cheapest to most production-shaped:

1. **Accept and document.** Tell users "if it won't connect, try a phone
   hotspot." Honest, zero infra. Where we are today.
2. **Hosted TURN with static credentials** (Metered, Xirsys, Twilio free tiers).
   No backend; credentials live in the bundle. Fine for a spike, abuse-prone for
   anything public.
3. **Cloudflare Worker that mints short-lived TURN tokens** (~20 lines).
   Introduces a server, but one that only hands out 10-minute relay credentials
   — it never sees chat content, so the privacy story stays intact. Cloudflare
   Realtime TURN has a generous free tier and pairs well with the STUN servers
   we already use.
4. **Self-hosted coturn on a small VPS** plus the credential-minting Worker.
   Full control, fixed monthly cost, ops burden.

The intended path is 1 → 3. Step 2 is a useful waypoint if we want to prove the
connection works on a strict-NAT network before standing up the Worker.

### When to revisit

- Anyone reports "the invite link doesn't work" and the cause turns out to be
  NAT topology, not a bug.
- We start using this on guest Wi-Fi, conference Wi-Fi, or carrier mobile
  networks where symmetric NAT is the norm.
- Scope expands beyond two people on home networks.

## Related rough edges (not addressed here)

- `waitForIceComplete` swallows the timeout-vs-complete distinction
  (`src/core/rtc.ts:50-69`), so the offerer can't warn the user _before_ sending
  the invite that STUN didn't respond and the link may only work on the same
  LAN.
- No retry on transient STUN failure during gathering.
- `ICE_GATHERING_TIMEOUT_MS` is hardcoded at 5s and not tunable per network.
