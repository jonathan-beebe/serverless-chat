import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Chat } from './Chat'
import type { ChatMessage } from '../core/rtc'

// JSDOM doesn't actually lay out scrollable elements. `scrollHeight` /
// `clientHeight` are always 0, and writes to `scrollTop` are real but
// unconstrained. We stub those three properties on the transcript element so
// the component can reason about "is the user near the bottom?" the same way
// it would in a real browser.
function stubScroll(el: Element, { scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight })
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight })
}

function msg(id: string, text: string, from: ChatMessage['from'] = 'them'): ChatMessage {
  return { id, from, text, at: 0 }
}

function getTranscript() {
  return screen.getByRole('list', { name: /chat transcript/i }) as HTMLOListElement
}

describe('Chat auto-scroll', () => {
  it('scrolls to bottom on the initial render (default pinned-to-bottom state)', () => {
    const messages: ChatMessage[] = [msg('a', 'hello'), msg('b', 'world')]
    const { rerender } = render(<Chat messages={messages} onSend={() => {}} />)
    const transcript = getTranscript()
    stubScroll(transcript, { scrollHeight: 800, clientHeight: 200 })

    // Trigger a re-render so the auto-scroll effect runs against stubbed metrics.
    rerender(<Chat messages={[...messages, msg('c', '!')]} onSend={() => {}} />)

    expect(transcript.scrollTop).toBe(transcript.scrollHeight)
  })

  it('auto-scrolls to bottom when a new message arrives and the user is pinned at the bottom', () => {
    const initial: ChatMessage[] = [msg('a', 'one'), msg('b', 'two')]
    const { rerender } = render(<Chat messages={initial} onSend={() => {}} />)
    const transcript = getTranscript()

    // Simulate "user is at the bottom": scrollTop is at the very end.
    stubScroll(transcript, { scrollHeight: 400, clientHeight: 200 })
    transcript.scrollTop = 200 // 400 - 200 = 0px from bottom
    fireEvent.scroll(transcript)

    // New message grows the scroll height; effect should pin to the new bottom.
    stubScroll(transcript, { scrollHeight: 460, clientHeight: 200 })
    rerender(<Chat messages={[...initial, msg('c', 'three')]} onSend={() => {}} />)

    expect(transcript.scrollTop).toBe(460)
  })

  it('does NOT auto-scroll when the user has scrolled up to read history', () => {
    const initial: ChatMessage[] = [msg('a', 'one'), msg('b', 'two')]
    const { rerender } = render(<Chat messages={initial} onSend={() => {}} />)
    const transcript = getTranscript()

    // Simulate "user scrolled up": well above the bottom threshold.
    stubScroll(transcript, { scrollHeight: 400, clientHeight: 200 })
    transcript.scrollTop = 0 // 400px from bottom — clearly reading history
    fireEvent.scroll(transcript)

    // New message arrives; scroll position must be preserved.
    stubScroll(transcript, { scrollHeight: 460, clientHeight: 200 })
    rerender(<Chat messages={[...initial, msg('c', 'three')]} onSend={() => {}} />)

    expect(transcript.scrollTop).toBe(0)
  })

  it('treats "within ~32px of the bottom" as still pinned (forgives small mis-scrolls)', () => {
    const initial: ChatMessage[] = [msg('a', 'one')]
    const { rerender } = render(<Chat messages={initial} onSend={() => {}} />)
    const transcript = getTranscript()

    stubScroll(transcript, { scrollHeight: 400, clientHeight: 200 })
    transcript.scrollTop = 180 // 20px from bottom — still "near"
    fireEvent.scroll(transcript)

    stubScroll(transcript, { scrollHeight: 460, clientHeight: 200 })
    rerender(<Chat messages={[...initial, msg('b', 'two')]} onSend={() => {}} />)

    expect(transcript.scrollTop).toBe(460)
  })
})
