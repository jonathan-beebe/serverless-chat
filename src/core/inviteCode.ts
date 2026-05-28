// FEAT-008 / RFCTR-005: pure helpers for the invite-code paste flow.
//
// Extracted out of `src/screens/Offerer.tsx` so the URL-extraction and SDP-
// classification branches can be regression-pinned without spinning up a
// React render. Both helpers were already pure; this is a missed seam, not
// a behavioural change.
//
// `extractOfferCode` pulls an encoded SDP out of either a bare paste, a
// free-floating `offer=` fragment, or a full invite URL.
// `classifyPastedCode` decodes the SDP and reports whether the paste is an
// expected `answer` or — per the FEAT-008 polite-defer flow — actually
// another peer's `offer`.

import { decode } from './encoding'
import { readHashParam } from './url'

/** Pull the offer code out of a paste that may be either the bare encoded
 *  payload or a full invite URL (`https://…/#offer=<code>`). Whitespace is
 *  trimmed either way. Returns the encoded code unchanged if no `offer=`
 *  param is present — the decoder downstream will surface a malformed-input
 *  error if it really is garbage. */
export function extractOfferCode(raw: string): string {
  const trimmed = raw.trim()
  // `URL` parsing tolerates the full invite shape; fall through to bare-code
  // handling for anything else (including the bare encoded string).
  try {
    const url = new URL(trimmed)
    const fromHash = readHashParam(url.hash, 'offer')
    if (fromHash) return fromHash
  } catch {
    // Not a URL — fall through. The user pasted the bare code (or junk).
  }
  // Also accept a free-floating `offer=…` fragment without a scheme.
  if (trimmed.includes('offer=')) {
    const fromBare = readHashParam(trimmed, 'offer')
    if (fromBare) return fromBare
  }
  return trimmed
}

/** Inspect the pasted reply code and figure out whether it's the expected
 *  answer SDP or — per FEAT-008's polite-peer recovery — the other peer's
 *  offer SDP. Returns `'answer'` / `'offer'` / `null` (decode failed or the
 *  payload isn't an SDP at all; existing submit-answer error path takes
 *  over). Swallows decode errors so callers don't need a try/catch around
 *  this; that's the load-bearing contract for the polite-defer detector. */
export function classifyPastedCode(code: string): 'answer' | 'offer' | null {
  try {
    const decoded = decode<{ type?: unknown }>(code)
    if (decoded && (decoded.type === 'offer' || decoded.type === 'answer')) {
      return decoded.type
    }
  } catch {
    // Malformed input — defer to the existing error path.
  }
  return null
}
