import { useEffect } from 'react'

// SPA route changes never reload the document, so the static `<title>` from
// index.html persists across every screen. That violates WCAG 2.4.2 (Page
// Titled) and leaves screen-reader users and tab indicators with no signal
// that the user has moved between Home / Invite / Connected, etc.
//
// Each screen calls this hook with the title for its current branch. The
// cleanup restores the previous title so unmounting (Strict Mode double
// invoke, tests, the rare case where no other screen mounts immediately)
// doesn't leave a stale title behind.
export function usePageTitle(title: string): void {
  useEffect(() => {
    const prev = document.title
    document.title = title
    return () => {
      document.title = prev
    }
  }, [title])
}
