import { useRef } from 'react'
import { ChatComposer, type ChatComposerHandle } from './ChatComposer'
import { ChatCopyToolbar } from './ChatCopyToolbar'
import { ChatTranscript } from './ChatTranscript'
import type { ChatMessage } from '../core/rtc'

interface Props {
  messages: ChatMessage[]
  onSend: (text: string) => void
  disabled?: boolean
  /** FEAT-012: when true, the transcript inserts a one-line "Resumed here"
   *  divider between the last persisted message (above) and the first live
   *  message of this session (below). Driven by the hook's `hasResumed`
   *  latch — see `useChatSession.hasResumed`. */
  hasResumed?: boolean
}

export function Chat({ messages, onSend, disabled, hasResumed }: Props) {
  const composerRef = useRef<ChatComposerHandle | null>(null)

  return (
    // CR-007: outer wrapper must be a flex-1 + min-h-0 child of its bounded
    // flex-column parent (Offerer/Joiner connected `<ScreenContainer>`). The
    // previous `h-full` shape didn't participate in the parent's flex
    // distribution, so intrinsic transcript content could push the wrapper
    // past its allotted slot and the document — not just the transcript —
    // gained a scrollbar. `min-h-0` overrides the flex default of
    // `min-height: auto`, the same pattern the transcript already uses
    // internally via `flex-1 overflow-y-auto`.
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ChatCopyToolbar
        messages={messages}
        // FEAT-002 parallel: the Copy action is incidental, the composer is
        // the user's primary surface. `preventScroll` so this focus call
        // doesn't yank the transcript.
        onCopySuccess={() => composerRef.current?.focus({ preventScroll: true })}
      />
      <ChatTranscript messages={messages} hasResumed={hasResumed} />
      <ChatComposer ref={composerRef} onSend={onSend} disabled={disabled} />
    </div>
  )
}
