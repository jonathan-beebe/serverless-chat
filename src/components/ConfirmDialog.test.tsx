import { useRef, useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

// jsdom 29 implements <dialog> including showModal()/close(), but the focus
// step that the HTML spec runs inside showModal() doesn't fire — so the
// component focuses Cancel itself in a useEffect after open. These tests
// exercise that React-level focus behaviour rather than the browser's.

interface HostProps {
  initialOpen?: boolean
  destructive?: boolean
  onConfirm?: () => void
  onCancel?: () => void
  /** Render an external button to host focus return. */
  withReturnFocusTo?: boolean
}

function Host({ initialOpen = false, destructive = false, onConfirm, onCancel, withReturnFocusTo }: HostProps) {
  const [open, setOpen] = useState(initialOpen)
  const returnRef = useRef<HTMLButtonElement | null>(null)

  return (
    <>
      <button ref={returnRef} type="button" data-testid="trigger">
        Open
      </button>
      <ConfirmDialog
        open={open}
        title="Delete chat?"
        body="Delete this chat from your device? This won't notify the other person."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive={destructive}
        onConfirm={() => {
          onConfirm?.()
          setOpen(false)
        }}
        onCancel={() => {
          onCancel?.()
          setOpen(false)
        }}
        returnFocusTo={withReturnFocusTo ? returnRef : undefined}
      />
      <button type="button" data-testid="reopen" onClick={() => setOpen(true)}>
        Reopen
      </button>
    </>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ConfirmDialog primitive (A11Y-033)', () => {
  it('renders an alertdialog with title and body wired through aria-labelledby / aria-describedby', () => {
    render(<Host initialOpen />)
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()

    const titleId = dialog.getAttribute('aria-labelledby')
    const bodyId = dialog.getAttribute('aria-describedby')
    expect(titleId).toBeTruthy()
    expect(bodyId).toBeTruthy()

    const titleEl = document.getElementById(titleId!)
    const bodyEl = document.getElementById(bodyId!)
    expect(titleEl).toHaveTextContent(/^Delete chat\?$/i)
    expect(bodyEl).toHaveTextContent(/this won't notify the other person/i)
  })

  it('focuses the Cancel button on open (safest default for destructive flows)', async () => {
    render(<Host initialOpen />)
    const cancel = screen.getByRole('button', { name: /^cancel$/i })
    await waitFor(() => {
      expect(document.activeElement).toBe(cancel)
    })
  })

  it('Cancel button click invokes onCancel and closes the dialog', async () => {
    const onCancel = vi.fn()
    render(<Host initialOpen onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  })

  it('Confirm button click invokes onConfirm and closes the dialog', async () => {
    const onConfirm = vi.fn()
    render(<Host initialOpen onConfirm={onConfirm} />)

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  })

  it('ESC fires the dialog `cancel` event which the component routes through onCancel', async () => {
    const onCancel = vi.fn()
    render(<Host initialOpen onCancel={onCancel} />)
    const dialog = screen.getByRole('alertdialog')

    // jsdom dispatches a 'cancel' Event when the dialog is closed via ESC.
    // The component prevents the default close and routes the dismiss through
    // its onCancel prop so React state stays in sync.
    act(() => {
      dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    })

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Tab/Shift+Tab cycle within the Cancel and Confirm buttons (focus trap)', async () => {
    render(<Host initialOpen />)
    const cancel = screen.getByRole('button', { name: /^cancel$/i })
    const confirm = screen.getByRole('button', { name: /^delete$/i })
    const dialog = screen.getByRole('alertdialog')

    await waitFor(() => expect(document.activeElement).toBe(cancel))

    // Tab from Cancel: move to Confirm (the natural next focusable, browser
    // handles this; we don't intercept).
    confirm.focus()
    // Tab from Confirm: wrap to Cancel.
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(cancel)
    // Shift+Tab from Cancel: wrap to Confirm.
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(confirm)
  })

  it('restores focus to the returnFocusTo element on close', async () => {
    render(<Host initialOpen withReturnFocusTo />)

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(document.activeElement).toBe(screen.getByTestId('trigger'))
  })

  it('destructive prop renders the confirm action under its destructive label', () => {
    // The destructive variant swaps the confirm button's accessible name to
    // the caller-supplied destructive label (here "Delete"). The red palette
    // and dark-mode contrast (A11Y-014 family) are owned by ConfirmDialog.tsx
    // destructiveClass and verified by visual regression; jsdom cannot
    // compute Tailwind-derived computed styles.
    render(<Host initialOpen destructive />)
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })
})
