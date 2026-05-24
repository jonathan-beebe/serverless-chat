interface Props {
  className?: string
}

// IMPRV-016: sighted-only motion cue for in-flight states (currently used
// alongside the "(gathering network candidates)…" callouts). aria-hidden
// is mandatory — the persistent role="status" live region from A11Y-012
// owns AT announcements; this glyph must not duplicate them. `currentColor`
// on stroke so the parent text color (light/dark) flows through without a
// per-mode class.
export function Spinner({ className = '' }: Props) {
  const composed = ['h-4 w-4 animate-spin', className].filter(Boolean).join(' ')
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={composed}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}
