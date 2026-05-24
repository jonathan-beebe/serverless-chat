// @vitest-environment jsdom
// CR-013: `src/core/**` runs under `node` by default; this file uses
// `document` / `navigator.clipboard`, so opt back into jsdom explicitly.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyTextToClipboard } from './clipboard'

// jsdom doesn't implement either `navigator.clipboard` or `document.execCommand`,
// so each test wires the impl it cares about. `restoreAllMocks` resets spies;
// `defineProperty` writes need explicit configurable: true so re-defining works
// between tests (same pattern as Chat.test.tsx).
function setClipboardWriteText(impl: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: impl ? { writeText: impl } : undefined,
  })
}

function setExecCommand(impl: (cmd: string) => boolean) {
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: impl,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('copyTextToClipboard', () => {
  it('modern path success → returns "copied" and does not touch the fallback textarea', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboardWriteText(writeText)
    const ta = document.createElement('textarea')
    const selectSpy = vi.spyOn(ta, 'select')

    const result = await copyTextToClipboard('hello', ta)

    expect(result).toBe('copied')
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(selectSpy).not.toHaveBeenCalled()
  })

  it('modern path rejects → falls through to execCommand and returns "copied"', async () => {
    setClipboardWriteText(vi.fn().mockRejectedValue(new Error('blocked')))
    const execCommand = vi.fn().mockReturnValue(true)
    setExecCommand(execCommand)
    const ta = document.createElement('textarea')

    const result = await copyTextToClipboard('hello', ta)

    expect(result).toBe('copied')
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(ta.value).toBe('hello')
  })

  it('both paths fail → returns "manual" with the textarea selected for keyboard finishing', async () => {
    setClipboardWriteText(vi.fn().mockRejectedValue(new Error('blocked')))
    setExecCommand(vi.fn().mockReturnValue(false))
    const ta = document.createElement('textarea')
    // Without attaching to the DOM, select() still mutates selection state in
    // jsdom — but does need the element to exist. The spy is what we assert.
    document.body.appendChild(ta)
    const selectSpy = vi.spyOn(ta, 'select')

    const result = await copyTextToClipboard('hello', ta)

    expect(result).toBe('manual')
    expect(ta.value).toBe('hello')
    expect(selectSpy).toHaveBeenCalled()
  })

  it('navigator.clipboard undefined → falls through cleanly to execCommand', async () => {
    setClipboardWriteText(undefined)
    const execCommand = vi.fn().mockReturnValue(true)
    setExecCommand(execCommand)
    const ta = document.createElement('textarea')

    const result = await copyTextToClipboard('hello', ta)

    expect(result).toBe('copied')
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('no fallback textarea + modern path fails → returns "manual"', async () => {
    setClipboardWriteText(vi.fn().mockRejectedValue(new Error('blocked')))

    const result = await copyTextToClipboard('hello', null)

    expect(result).toBe('manual')
  })

  it('execCommand throws → returns "manual"', async () => {
    setClipboardWriteText(vi.fn().mockRejectedValue(new Error('blocked')))
    setExecCommand(() => {
      throw new Error('SecurityError')
    })
    const ta = document.createElement('textarea')

    const result = await copyTextToClipboard('hello', ta)

    expect(result).toBe('manual')
  })
})
