import { describe, expect, it } from 'vitest'
import type { ArrangeRequest } from 'tidy-layout'
import { arrangeThrough } from '../useLayoutEngine'

/** A worker that answers when the test says so. */
function fakeWorker() {
  const target = new EventTarget()
  const asked: { id: number; request: ArrangeRequest }[] = []
  return {
    asked,
    postMessage: (message: { id: number; request: ArrangeRequest }) => void asked.push(message),
    addEventListener: target.addEventListener.bind(target),
    answer: (data: unknown) => target.dispatchEvent(new MessageEvent('message', { data })),
    fail: () => target.dispatchEvent(new Event('error')),
  }
}

const request: ArrangeRequest = { cards: [], connections: [] }

describe('arrangeThrough', () => {
  it('gives each request its own answer, in whatever order they come', async () => {
    const worker = fakeWorker()
    const arrange = arrangeThrough(worker)
    const first = arrange(request)
    const second = arrange(request)
    expect(worker.asked.map((message) => message.request)).toEqual([request, request])
    const [a, b] = worker.asked
    worker.answer({ id: b!.id, answer: { cards: [], seed: 2 } })
    worker.answer({ id: a!.id, answer: { cards: [], seed: 1 } })
    expect(await first).toEqual({ cards: [], seed: 1 })
    expect(await second).toEqual({ cards: [], seed: 2 })
  })

  it('rejects with the engine’s reason', async () => {
    const worker = fakeWorker()
    const answer = arrangeThrough(worker)(request)
    worker.answer({ id: worker.asked[0]!.id, error: 'no layout' })
    await expect(answer).rejects.toThrow('no layout')
  })

  it('rejects everything that waits when the worker breaks', async () => {
    const worker = fakeWorker()
    const answer = arrangeThrough(worker)(request)
    worker.fail()
    await expect(answer).rejects.toThrow('The layout worker failed')
  })
})
