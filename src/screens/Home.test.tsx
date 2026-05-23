import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { Home } from './Home'
import { ScreenChromeContext, type ScreenChromeValue } from '../components/ScreenChrome'
import { __resetForTests as resetStorage, appendMessage, upsertConversation } from '../core/storage'

const SHOWCASE_CHROME: ScreenChromeValue = {
  landmark: 'region',
  headingLevelOffset: 1,
  suppressInitialFocus: true,
}

beforeEach(() => {
  // FEAT-012: fresh in-memory IDB so persistence side effects don't leak.
  // (`fake-indexeddb` declares the factory globals as writable.)
  ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  resetStorage()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Home focus-on-mount (A11Y-005 + A11Y-022)', () => {
  it('focuses the "Start a chat" button on mount under the default ScreenChrome context', async () => {
    render(<Home onStart={() => {}} />)
    const startButton = screen.getByRole('button', { name: /start a chat/i })

    await waitFor(() => {
      expect(document.activeElement).toBe(startButton)
    })
  })

  it('does NOT focus the "Start a chat" button when rendered inside a showcase context with suppressInitialFocus: true (A11Y-022)', async () => {
    render(
      <ScreenChromeContext.Provider value={SHOWCASE_CHROME}>
        <Home onStart={() => {}} />
      </ScreenChromeContext.Provider>,
    )
    const startButton = screen.getByRole('button', { name: /start a chat/i })

    await waitFor(() => {
      expect(startButton).toBeInTheDocument()
    })

    expect(document.activeElement).not.toBe(startButton)
    expect(document.activeElement?.closest('[role="region"]')).toBeNull()
  })
})

describe('Home empty state (FEAT-012 AC#19)', () => {
  // AC#19: the marketing copy on Home drops the "no history" phrase since
  // history is now an opt-in-by-default local feature. The "no chat server,
  // no accounts" promise stays — that's the actual privacy stance.
  it('renders without the legacy "no history" copy', () => {
    render(<Home onStart={() => {}} />)
    // The exact replacement wording is subject to PR-time bikeshedding, but
    // the AC is unambiguous about the word that must be gone.
    expect(screen.queryByText(/no history/i)).not.toBeInTheDocument()
    expect(screen.getByText(/no chat server, no accounts/i)).toBeInTheDocument()
  })

  it('renders no past-chats section when storage is empty', async () => {
    render(<Home onStart={() => {}} />)
    // Wait for the async listConversations() to resolve and the hook to
    // commit the (empty) list. If the section ever appeared, it'd be in a
    // <section> with this aria-label.
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: /past conversations/i })).not.toBeInTheDocument()
    })
  })
})

describe('Home conversation list (FEAT-012 AC#18 / #20 / #21 / #26)', () => {
  function seed(id: string, opts: { label?: string; createdAt?: number; lastActivityAt?: number } = {}) {
    return upsertConversation({
      id,
      createdAt: opts.createdAt ?? Date.now() - 60_000,
      lastActivityAt: opts.lastActivityAt ?? Date.now() - 60_000,
      label: opts.label,
    })
  }

  it('renders a row per past conversation with the label and a Resume button', async () => {
    await seed('aaa', { label: 'Lunch chat' })
    await seed('bbb', { label: 'Project sync' })

    render(<Home onStart={() => {}} />)

    // Find the rows via the test id our row component stamps on its <li>.
    const rowA = await screen.findByTestId('conversation-row-aaa')
    const rowB = await screen.findByTestId('conversation-row-bbb')
    expect(within(rowA).getByText('Lunch chat')).toBeInTheDocument()
    expect(within(rowB).getByText('Project sync')).toBeInTheDocument()
    // Both rows expose a primary Resume affordance (AC#18).
    expect(within(rowA).getByRole('button', { name: /^resume$/i })).toBeInTheDocument()
    expect(within(rowB).getByRole('button', { name: /^resume$/i })).toBeInTheDocument()
  })

  it('Resume forwards the row`s conversation id to onStart (AC#26)', async () => {
    await seed('aaa', { label: 'Lunch chat' })
    const onStart = vi.fn()
    render(<Home onStart={onStart} />)

    const row = await screen.findByTestId('conversation-row-aaa')
    fireEvent.click(within(row).getByRole('button', { name: /^resume$/i }))

    expect(onStart).toHaveBeenCalledWith('aaa')
  })

  it('"No messages yet" peek shows for an empty conversation (AC#18)', async () => {
    await seed('aaa', { label: 'Empty stub' })
    render(<Home onStart={() => {}} />)
    const row = await screen.findByTestId('conversation-row-aaa')
    expect(within(row).getByText(/no messages yet/i)).toBeInTheDocument()
  })

  it('shows the last message body (truncated to ~50 chars) as the peek (AC#18)', async () => {
    await seed('aaa', { label: 'With history' })
    const longBody = 'x'.repeat(120)
    await appendMessage('aaa', { id: 'm1', from: 'me', text: longBody, at: Date.now() })

    render(<Home onStart={() => {}} />)
    const row = await screen.findByTestId('conversation-row-aaa')
    // Truncation is "first 47 + ellipsis" for bodies over 50 chars per AC#18.
    const peek = await within(row).findByText(/^x+…$/u)
    expect(peek.textContent?.length).toBeLessThanOrEqual(50)
  })

  it('Delete with confirm removes the row and the underlying record (AC#20)', async () => {
    await seed('aaa', { label: 'Goodbye' })
    // window.confirm is the pragmatic v1 confirm primitive per the ticket.
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Home onStart={() => {}} />)

    const row = await screen.findByTestId('conversation-row-aaa')
    fireEvent.click(within(row).getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /delete chat/i }))

    expect(confirm).toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByTestId('conversation-row-aaa')).not.toBeInTheDocument()
    })
  })

  it('Delete cancel leaves the row in place (AC#20)', async () => {
    await seed('aaa', { label: 'Stays' })
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Home onStart={() => {}} />)

    const row = await screen.findByTestId('conversation-row-aaa')
    fireEvent.click(within(row).getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /delete chat/i }))

    // No re-fetch should ever fire, but waitFor a tick so any erroneous
    // remove() call has time to commit.
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.getByTestId('conversation-row-aaa')).toBeInTheDocument()
  })

  it('Rename inline edits the row`s label (AC#21)', async () => {
    await seed('aaa', { label: 'Old name' })
    render(<Home onStart={() => {}} />)

    const row = await screen.findByTestId('conversation-row-aaa')
    fireEvent.click(within(row).getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^rename$/i }))

    const input = await within(row).findByLabelText(/rename chat/i)
    fireEvent.change(input, { target: { value: 'New name' } })
    fireEvent.click(within(row).getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(within(row).getByText('New name')).toBeInTheDocument()
    })
  })
})

describe('Home row menu dismissal (CR-008)', () => {
  async function seedRow(id: string, label: string) {
    return upsertConversation({
      id,
      createdAt: Date.now() - 60_000,
      lastActivityAt: Date.now() - 60_000,
      label,
    })
  }

  it('closes the open menu on pointerdown outside the row', async () => {
    await seedRow('aaa', 'Row A')
    render(<Home onStart={() => {}} />)

    const row = await screen.findByTestId('conversation-row-aaa')
    fireEvent.click(within(row).getByRole('button', { name: /more actions/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    // pointerdown on a sibling element outside the row+menu wrapper.
    const heading = screen.getByRole('heading', { name: /serverless p2p chat/i })
    fireEvent.pointerDown(heading)

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })

  it('closes the open menu on Escape and restores focus to the ⋯ trigger', async () => {
    await seedRow('aaa', 'Row A')
    render(<Home onStart={() => {}} />)

    const row = await screen.findByTestId('conversation-row-aaa')
    const trigger = within(row).getByRole('button', { name: /more actions/i })
    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
    expect(document.activeElement).toBe(trigger)
  })

  it('opening row B`s menu closes row A`s (single-open invariant)', async () => {
    await seedRow('aaa', 'Row A')
    await seedRow('bbb', 'Row B')
    render(<Home onStart={() => {}} />)

    const rowA = await screen.findByTestId('conversation-row-aaa')
    const rowB = await screen.findByTestId('conversation-row-bbb')

    fireEvent.click(within(rowA).getByRole('button', { name: /more actions/i }))
    expect(within(rowA).getByRole('menu')).toBeInTheDocument()

    fireEvent.click(within(rowB).getByRole('button', { name: /more actions/i }))

    await waitFor(() => {
      expect(within(rowA).queryByRole('menu')).not.toBeInTheDocument()
    })
    expect(within(rowB).getByRole('menu')).toBeInTheDocument()
    expect(screen.getAllByRole('menu')).toHaveLength(1)
  })

  it('toggles closed when the same ⋯ trigger is clicked again (no re-open race)', async () => {
    await seedRow('aaa', 'Row A')
    render(<Home onStart={() => {}} />)

    const row = await screen.findByTestId('conversation-row-aaa')
    const trigger = within(row).getByRole('button', { name: /more actions/i })

    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })
})

describe('Home row menu Copy transcript (CR-009)', () => {
  // Clipboard / execCommand stubs mirror the Chat.test.tsx patterns.
  function setClipboardWriteText(impl: (text: string) => Promise<void>) {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: impl },
    })
  }

  function setExecCommand(impl: (cmd: string) => boolean) {
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: impl,
    })
  }

  async function seedWithMessages(id: string, count: number) {
    await upsertConversation({
      id,
      createdAt: Date.now() - 60_000,
      lastActivityAt: Date.now() - 60_000,
      label: 'A chat',
    })
    for (let i = 0; i < count; i += 1) {
      await appendMessage(id, {
        id: `m${i}`,
        from: i % 2 === 0 ? 'me' : 'them',
        text: `message ${i}`,
        at: Date.now() - (count - i) * 1000,
      })
    }
  }

  it('renders Copy transcript between Rename and Delete in the row menu', async () => {
    await seedWithMessages('aaa', 1)
    render(<Home onStart={() => {}} />)

    const row = await screen.findByTestId('conversation-row-aaa')
    // Wait for the preview-load to settle so the disabled/enabled state of
    // the Copy transcript item is stable before we open the menu.
    await within(row).findByText(/message 0/i)
    fireEvent.click(within(row).getByRole('button', { name: /more actions/i }))

    const items = screen.getAllByRole('menuitem').map((el) => el.textContent)
    expect(items).toEqual(['Rename', 'Copy transcript', 'Delete chat'])
  })

  it('Copy transcript writes the formatted (timestamped) markdown to the clipboard', async () => {
    await seedWithMessages('aaa', 2)
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboardWriteText(writeText)
    render(<Home onStart={() => {}} />)

    const row = await screen.findByTestId('conversation-row-aaa')
    await within(row).findByText(/message 1/i)
    fireEvent.click(within(row).getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /copy transcript/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const written = writeText.mock.calls[0][0] as string
    // Default matches Chat's default (includeTimestamps: true): opens with `# `
    // and includes both per-message headings.
    expect(written).toMatch(/^# /)
    expect(written).toContain('**You** · ')
    expect(written).toContain('**Them** · ')
    expect(written).toContain('message 0')
    expect(written).toContain('message 1')
  })

  it('Copy transcript closes the menu after a successful copy', async () => {
    await seedWithMessages('aaa', 1)
    setClipboardWriteText(vi.fn().mockResolvedValue(undefined))
    render(<Home onStart={() => {}} />)

    const row = await screen.findByTestId('conversation-row-aaa')
    await within(row).findByText(/message 0/i)
    fireEvent.click(within(row).getByRole('button', { name: /more actions/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /copy transcript/i }))

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('Copy transcript falls back to execCommand when writeText rejects', async () => {
    await seedWithMessages('aaa', 1)
    setClipboardWriteText(vi.fn().mockRejectedValue(new Error('blocked')))
    const execCommand = vi.fn().mockReturnValue(true)
    setExecCommand(execCommand)
    render(<Home onStart={() => {}} />)

    const row = await screen.findByTestId('conversation-row-aaa')
    await within(row).findByText(/message 0/i)
    fireEvent.click(within(row).getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /copy transcript/i }))

    await waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'))
  })

  it('Copy transcript surfaces the manual-copy hint when both paths fail', async () => {
    await seedWithMessages('aaa', 1)
    setClipboardWriteText(vi.fn().mockRejectedValue(new Error('blocked')))
    setExecCommand(vi.fn().mockReturnValue(false))
    render(<Home onStart={() => {}} />)

    const row = await screen.findByTestId('conversation-row-aaa')
    await within(row).findByText(/message 0/i)
    fireEvent.click(within(row).getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /copy transcript/i }))

    // The "Press Ctrl+C / Cmd+C to copy" hint matches Chat's wording — one
    // shared pattern across the app.
    await waitFor(() => expect(screen.getByText(/Ctrl\+C/)).toBeInTheDocument())
    // And the LiveRegion announces the manual-copy state.
    const live = document.querySelector('[role="status"]') as HTMLElement
    expect(live.textContent).toMatch(/Control C or Command C/i)
  })

  it('Copy transcript announces success via the live region', async () => {
    await seedWithMessages('aaa', 1)
    setClipboardWriteText(vi.fn().mockResolvedValue(undefined))
    render(<Home onStart={() => {}} />)

    const row = await screen.findByTestId('conversation-row-aaa')
    await within(row).findByText(/message 0/i)
    fireEvent.click(within(row).getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /copy transcript/i }))

    await waitFor(() => {
      const live = document.querySelector('[role="status"]') as HTMLElement
      expect(live.textContent).toMatch(/transcript copied to clipboard/i)
    })
  })

  it('Copy transcript is disabled when the conversation has no messages', async () => {
    // Seed the conversation but no messages — preview shows "No messages yet".
    await upsertConversation({
      id: 'aaa',
      createdAt: Date.now() - 60_000,
      lastActivityAt: Date.now() - 60_000,
      label: 'Empty',
    })
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboardWriteText(writeText)
    render(<Home onStart={() => {}} />)

    const row = await screen.findByTestId('conversation-row-aaa')
    await within(row).findByText(/no messages yet/i)
    fireEvent.click(within(row).getByRole('button', { name: /more actions/i }))

    const copyItem = screen.getByRole('menuitem', { name: /copy transcript/i })
    expect(copyItem).toBeDisabled()

    // Clicking a disabled menuitem must not invoke the clipboard.
    fireEvent.click(copyItem)
    await new Promise((r) => setTimeout(r, 10))
    expect(writeText).not.toHaveBeenCalled()
  })
})

describe('Home "Start a chat" (FEAT-012 AC#25)', () => {
  it('calls onStart with a fresh UUID', () => {
    const onStart = vi.fn()
    render(<Home onStart={onStart} />)
    fireEvent.click(screen.getByRole('button', { name: /start a chat/i }))
    expect(onStart).toHaveBeenCalledTimes(1)
    const arg = onStart.mock.calls[0][0]
    // Loose UUID check — we don't need to assert the v4 layout, just that
    // a non-empty string was passed (Home uses crypto.randomUUID()).
    expect(typeof arg).toBe('string')
    expect(arg.length).toBeGreaterThan(0)
  })
})
