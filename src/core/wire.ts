// FEAT-010: versioned JSON wire envelope for the data channel. Before this,
// every payload sent over `channel.send` was a bare chat string. Adding
// telemetry (sync probes, delivered receipts) requires distinguishing chat
// bytes from non-chat bytes — and now that we have a discriminator, we make
// the protocol explicit so future features (typing indicators, reactions,
// file chunks) can extend the union without another round of "now we need to
// differentiate X from Y."
//
// `v: 1` is the protocol-version literal. Both peers ship from the same
// deployment so v1 doesn't *negotiate* the version — but the field is here so
// a future v2 can detect a mismatch and warn cleanly instead of crashing.

export type WireEnvelope = ChatEnvelope | SyncProbeEnvelope | SyncAckEnvelope | SyncDoneEnvelope | ReceiptEnvelope

interface BaseEnvelope {
  /** Protocol version literal. */
  v: 1
  /** Discriminator. */
  t: 'chat' | 'sync-probe' | 'sync-ack' | 'sync-done' | 'receipt'
  /** UUID for the envelope itself. For `chat` this doubles as the ChatMessage id. */
  id: string
  /** Sender's `Date.now()` at the moment `channel.send` was called. */
  sentAt: number
}

export interface ChatEnvelope extends BaseEnvelope {
  t: 'chat'
  /** Trimmed chat text. */
  text: string
}

export interface SyncProbeEnvelope extends BaseEnvelope {
  t: 'sync-probe'
}

export interface SyncAckEnvelope extends BaseEnvelope {
  t: 'sync-ack'
  /** The probe id this is acking. */
  replyTo: string
  /** Receiver's clock (t2) at the moment the probe was received. */
  probeReceivedAt: number
}

export interface SyncDoneEnvelope extends BaseEnvelope {
  t: 'sync-done'
  /** The ack id this is completing. */
  replyTo: string
  /** The four NTP-style timestamps the offerer collected. The answerer reads
   *  them to derive its own (rtt, offset) without "trust the peer's math." */
  t1: number
  t2: number
  t3: number
  t4: number
}

export interface ReceiptEnvelope extends BaseEnvelope {
  t: 'receipt'
  /** The chat message id this receipt acknowledges. */
  replyTo: string
  /** Receiver's clock at the moment the chat envelope was decoded. */
  messageReceivedAt: number
}

export function encode(env: WireEnvelope): string {
  return JSON.stringify(env)
}

/**
 * Best-effort decode. Returns `null` (and emits a single `console.warn`) on
 * any malformed input: non-JSON, missing required fields, unknown `t`,
 * mismatched `v`, wrong field types. The receiver's `onmessage` handler is
 * expected to short-circuit on null so a confused peer never crashes the
 * session. See FEAT-010 AC#3.
 */
export function decode(raw: string): WireEnvelope | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.warn('[wire] dropping non-JSON payload')
    return null
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.warn('[wire] dropping non-object payload')
    return null
  }
  const obj = parsed as Record<string, unknown>
  if (obj.v !== 1) {
    console.warn('[wire] dropping payload with unsupported version', obj.v)
    return null
  }
  if (typeof obj.id !== 'string' || typeof obj.sentAt !== 'number') {
    console.warn('[wire] dropping payload missing id/sentAt')
    return null
  }
  switch (obj.t) {
    case 'chat':
      if (typeof obj.text !== 'string') {
        console.warn('[wire] dropping chat envelope missing text')
        return null
      }
      return { v: 1, t: 'chat', id: obj.id, sentAt: obj.sentAt, text: obj.text }
    case 'sync-probe':
      return { v: 1, t: 'sync-probe', id: obj.id, sentAt: obj.sentAt }
    case 'sync-ack':
      if (typeof obj.replyTo !== 'string' || typeof obj.probeReceivedAt !== 'number') {
        console.warn('[wire] dropping sync-ack envelope missing replyTo/probeReceivedAt')
        return null
      }
      return {
        v: 1,
        t: 'sync-ack',
        id: obj.id,
        sentAt: obj.sentAt,
        replyTo: obj.replyTo,
        probeReceivedAt: obj.probeReceivedAt,
      }
    case 'sync-done':
      if (
        typeof obj.replyTo !== 'string' ||
        typeof obj.t1 !== 'number' ||
        typeof obj.t2 !== 'number' ||
        typeof obj.t3 !== 'number' ||
        typeof obj.t4 !== 'number'
      ) {
        console.warn('[wire] dropping sync-done envelope missing timestamps')
        return null
      }
      return {
        v: 1,
        t: 'sync-done',
        id: obj.id,
        sentAt: obj.sentAt,
        replyTo: obj.replyTo,
        t1: obj.t1,
        t2: obj.t2,
        t3: obj.t3,
        t4: obj.t4,
      }
    case 'receipt':
      if (typeof obj.replyTo !== 'string' || typeof obj.messageReceivedAt !== 'number') {
        console.warn('[wire] dropping receipt envelope missing replyTo/messageReceivedAt')
        return null
      }
      return {
        v: 1,
        t: 'receipt',
        id: obj.id,
        sentAt: obj.sentAt,
        replyTo: obj.replyTo,
        messageReceivedAt: obj.messageReceivedAt,
      }
    default:
      console.warn('[wire] dropping payload with unknown discriminator', obj.t)
      return null
  }
}

/**
 * NTP-style derivation: given the four timestamps from a probe → ack → done
 * exchange, computes (rtt, offset). `offset` is "peer - us" in milliseconds —
 * positive means the peer's clock is ahead of ours.
 *
 * The originating side (offerer) collects t1 (probe sentAt), t2 (probe
 * received-at on answerer, returned in ack), t3 (ack sentAt), t4 (ack
 * received-at on offerer). The answerer learns t1/t3/t4 from a follow-up
 * sync-done envelope and runs the same math against its own t2 — but mirrored:
 * from the answerer's vantage the role labels swap, so its offset is the
 * negation of the offerer's. We implement that mirror explicitly in the hook;
 * this function is the canonical formula either side uses.
 */
export function deriveSync(t1: number, t2: number, t3: number, t4: number): { rtt: number; offset: number } {
  const rtt = t4 - t1 - (t3 - t2)
  const offset = (t2 - t1 + (t3 - t4)) / 2
  return { rtt, offset }
}
