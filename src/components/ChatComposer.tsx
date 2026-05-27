import { FormEvent, forwardRef, KeyboardEvent, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Button } from './Button'
import { Textarea } from './Textarea'

interface Props {
  onSend: (text: string) => void
  disabled?: boolean
}

// FEAT-011: the parent (Chat) refocuses the composer after a successful copy
// via `onCopySuccess`. Expose a minimal imperative handle so callers can
// `composerRef.current?.focus()` without leaking the underlying <textarea>.
export interface ChatComposerHandle {
  focus: (options?: FocusOptions) => void
}

export const ChatComposer = forwardRef<ChatComposerHandle, Props>(function ChatComposer({ onSend, disabled }, ref) {
  const [draft, setDraft] = useState('')
  const composerRef = useRef<HTMLTextAreaElement | null>(null)

  useImperativeHandle(ref, () => ({
    focus: (options?: FocusOptions) => composerRef.current?.focus(options),
  }))

  // Single send path shared by the form's submit handler (click / mouse / touch)
  // and the composer's keydown handler (Enter). Trims to drop the kind of
  // trailing whitespace a stray Shift+Enter at the end produces.
  const sendIfValid = () => {
    const trimmed = draft.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setDraft('')
    // Enter on a textarea keeps focus naturally; clicking Send moves focus
    // to the now-disabled button, leaving keyboard users stranded and
    // dismissing the soft keyboard on touch. Pin focus back to the composer.
    // `preventScroll` keeps the transcript from being yanked by this call
    // (CR-005 scroll-pin behavior).
    composerRef.current?.focus({ preventScroll: true })
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    sendIfValid()
  }

  // FEAT-004: Enter sends, Shift+Enter inserts a newline, IME composition is
  // respected. Empty drafts and disabled state fall through to default
  // behavior (= no-op) so the user can't double-send.
  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    sendIfValid()
  }

  // Auto-focus the composer on initial mount (initial connect) and whenever it
  // transitions from disabled → enabled (reconnect). Skip if some other
  // element is currently focused so we never override an explicit user focus.
  useEffect(() => {
    if (disabled) return
    const active = document.activeElement
    if (active && active !== document.body) return
    composerRef.current?.focus({ preventScroll: true })
  }, [disabled])

  return (
    <form onSubmit={onSubmit} className="flex items-end gap-2">
      <label htmlFor="chat-input" className="sr-only">
        Message
      </label>
      <Textarea
        id="chat-input"
        ref={composerRef}
        rows={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onComposerKeyDown}
        placeholder={disabled ? 'Waiting for connection…' : 'Type a message'}
        disabled={disabled}
        autoComplete="off"
        // `field-sizing: content` auto-grows the textarea with its content
        // on Chrome 123+ / Safari 18+. Older browsers ignore it and render
        // at the explicit `rows={1}` height with internal scroll — still
        // functional, just not auto-growing.
        className="flex-1 resize-none placeholder-stone-500 [field-sizing:content] max-h-40 disabled:opacity-50 dark:placeholder-stone-400"
      />
      <Button type="submit" variant="primary" size="md" disabled={disabled || !draft.trim()}>
        Send
      </Button>
    </form>
  )
})
