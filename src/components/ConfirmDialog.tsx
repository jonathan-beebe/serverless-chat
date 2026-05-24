import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import { Button } from './Button'

interface Props {
  open: boolean
  title: string
  body: string
  confirmLabel?: string
  cancelLabel?: string
  /** Style the confirm action as destructive (red). Otherwise it renders as
   *  the standard `Button` primary. */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
  /** Element to restore focus to when the dialog closes. If omitted, focus
   *  returns to whichever element was focused at the moment the dialog
   *  opened. The dialog never returns focus to itself. */
  returnFocusTo?: RefObject<HTMLElement | null>
}

// A11Y-033: an alertdialog-shaped confirm primitive. Uses the native
// `<dialog>` element so top-layer rendering, inert-background, and ESC
// handling come for free; we layer in the WAI-ARIA APG alertdialog
// behaviours `<dialog>` does not provide on its own:
//   - role="alertdialog" (so SRs announce the dialog with assertive
//     urgency rather than the generic "dialog" role)
//   - aria-labelledby / aria-describedby pointing at the visible title
//     and body, so the accessible name and description are programmatic
//   - initial focus on Cancel (safest default for destructive flows;
//     matches APG)
//   - Tab / Shift+Tab cycle within the two action buttons (focus trap)
//   - ESC dismisses as Cancel (we preventDefault on the dialog's native
//     `cancel` event and route the dismiss through onCancel so React
//     state stays in sync)
//   - focus returns to `returnFocusTo` on close, or to the
//     previously-focused element if no anchor was supplied
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
  returnFocusTo,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  // Whether the dialog has been open at least once since mount. We use this
  // to gate the close-side cleanup (the `dialog.close()` and the focus
  // restoration) so a freshly-mounted dialog with `open={false}` does NOT
  // steal focus from whatever the page just auto-focused — that initial
  // false→false "transition" isn't a real close.
  const wasOpenRef = useRef(false)
  const titleId = useId()
  const bodyId = useId()

  // Open/close the native dialog and manage focus return. `showModal()` puts
  // the dialog in the top layer and applies inert to the background; `close()`
  // tears it down. jsdom 29 implements both, but we still guard the calls so
  // a future test environment that omits the API doesn't crash the render.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      wasOpenRef.current = true
      previousFocusRef.current = document.activeElement as HTMLElement | null
      if (typeof dialog.showModal === 'function' && !dialog.open) {
        try {
          dialog.showModal()
        } catch {
          dialog.setAttribute('open', '')
        }
      } else if (!dialog.open) {
        dialog.setAttribute('open', '')
      }
      // Focus Cancel by default — destructive flows should require an
      // intentional pointer/keystroke for the confirm side.
      cancelRef.current?.focus()
    } else if (wasOpenRef.current) {
      // Real open→close transition: tear down and restore focus.
      if (typeof dialog.close === 'function' && dialog.open) {
        try {
          dialog.close()
        } catch {
          dialog.removeAttribute('open')
        }
      } else {
        dialog.removeAttribute('open')
      }
      const target = returnFocusTo?.current ?? previousFocusRef.current
      target?.focus()
      wasOpenRef.current = false
    }
  }, [open, returnFocusTo])

  // ESC closes the native dialog and fires a `cancel` event before close.
  // Preventing the default keeps the dialog open until React drives the
  // close via the `open` prop — otherwise the dialog and React state could
  // drift, and the second Open call would have nothing to do.
  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return
    const onCancelEvent = (e: Event) => {
      e.preventDefault()
      onCancel()
    }
    dialog.addEventListener('cancel', onCancelEvent)
    return () => dialog.removeEventListener('cancel', onCancelEvent)
  }, [open, onCancel])

  // Focus trap. With only two focusable elements this is a small wrap-around
  // — at the first button Shift+Tab goes to the last, and at the last Tab
  // goes to the first.
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== 'Tab') return
    const first = cancelRef.current
    const last = confirmRef.current
    if (!first || !last) return
    const active = document.activeElement
    if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  // Destructive confirm uses the same red tokens already used by the Delete
  // chat menu item in Home.tsx — keeps the visual language consistent without
  // forcing a new `danger` variant into the Button primitive in this ticket.
  const destructiveClass =
    'bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-300 dark:bg-red-800 dark:hover:bg-red-700'

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onKeyDown={handleKeyDown}
      className="m-auto max-w-md rounded-md border border-stone-300 bg-white p-4 text-stone-900 shadow-md backdrop:bg-black/40 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100">
      <h2 id={titleId} className="text-base font-semibold">
        {title}
      </h2>
      <p id={bodyId} className="mt-2 text-sm text-stone-700 dark:text-stone-300">
        {body}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          ref={confirmRef}
          variant="primary"
          onClick={onConfirm}
          className={destructive ? destructiveClass : undefined}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}
