import { Button } from '../components/Button'
import { Heading } from '../components/Heading'
import { ScreenContainer, useScreenChrome } from '../components/ScreenChrome'
import { useFocusOnMount } from '../hooks/useFocusOnMount'
import { usePageTitle } from '../hooks/usePageTitle'

interface Props {
  onStart: () => void
}

export function Home({ onStart }: Props) {
  usePageTitle('P2P Chat')
  // In a showcase context the host page owns initial focus; the screen
  // would otherwise race siblings to programmatically focus its heading and
  // teleport AT users mid-page. See A11Y-022.
  const { suppressInitialFocus } = useScreenChrome()
  const startRef = useFocusOnMount<HTMLButtonElement>([], { skip: suppressInitialFocus })
  return (
    <ScreenContainer label="Home" className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-12 text-center">
      <Heading level={1}>Serverless P2P Chat</Heading>
      <p className="text-slate-700 dark:text-slate-300">
        Two people, one shared link. Real-time chat directly between your browsers — no chat server, no accounts, no
        history.
      </p>
      <Button ref={startRef} variant="primary" size="lg" onClick={onStart}>
        Start a chat
      </Button>
      <details className="w-full rounded-md border border-slate-300 bg-white/50 p-3 text-left text-sm text-slate-700 open:bg-white dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:open:bg-slate-900">
        <summary className="cursor-pointer text-slate-800 dark:text-slate-200">How does this work?</summary>
        <p className="mt-2">
          You'll get an invite URL to send to your friend via any channel you already use (Teams, SMS, email). They open
          the URL, send back a short reply code, and your browsers connect directly over WebRTC. The chat itself never
          touches a server.
        </p>
      </details>
    </ScreenContainer>
  )
}
