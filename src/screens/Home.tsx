import { useFocusOnMount } from '../hooks/useFocusOnMount'
import { usePageTitle } from '../hooks/usePageTitle'

interface Props {
  onStart: () => void
}

export function Home({ onStart }: Props) {
  usePageTitle('P2P Chat')
  const headingRef = useFocusOnMount<HTMLHeadingElement>()
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-12 text-center">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-3xl font-semibold tracking-tight text-slate-100 focus:outline-none">
        Serverless P2P Chat
      </h1>
      <p className="text-slate-300">
        Two people, one shared link. Real-time chat directly between your browsers — no chat server, no accounts, no
        history.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="rounded-md bg-sky-600 px-5 py-2.5 text-base font-medium text-white hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
        Start a chat
      </button>
      <details className="w-full rounded-md border border-slate-700 bg-slate-900/50 p-3 text-left text-sm text-slate-300 open:bg-slate-900">
        <summary className="cursor-pointer text-slate-200">How does this work?</summary>
        <p className="mt-2">
          You'll get an invite URL to send to your friend via any channel you already use (Teams, SMS, email). They open
          the URL, send back a short reply code, and your browsers connect directly over WebRTC. The chat itself never
          touches a server.
        </p>
      </details>
    </main>
  )
}
