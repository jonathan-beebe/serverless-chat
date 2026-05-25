import { Link } from 'react-router-dom'
import { Callout } from '../components/Callout'
import { Heading } from '../components/Heading'
import { ScreenContainer, useScreenChrome } from '../components/ScreenChrome'
import { useFocusOnMount } from '../hooks/useFocusOnMount'
import { usePageTitle } from '../hooks/usePageTitle'

// ARCH-001: rendered for `/conversation/<id>` URLs that don't match a live
// session, an unfinished invite (no `#offer` fragment), or a persisted record.
// A clear empty state with a path back to home — not a silent redirect, not a
// fresh offerer minted from an unknown id.
export function NotFound() {
  usePageTitle('Not found · P2P Chat')
  const { suppressInitialFocus } = useScreenChrome()
  const homeRef = useFocusOnMount<HTMLAnchorElement>([], { skip: suppressInitialFocus })
  return (
    <ScreenContainer label="Conversation not found" className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-12">
      <Heading level={1}>Conversation not found</Heading>
      <Callout variant="info">
        This conversation isn't running and there's no saved transcript for it on this device. The link may be from
        another browser, or the chat has already ended.
      </Callout>
      <Link
        ref={homeRef}
        to="/"
        className="self-start rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50 dark:focus-visible:ring-offset-stone-900">
        Back to home
      </Link>
    </ScreenContainer>
  )
}
