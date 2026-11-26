import { shallowRef } from 'vue'
import type { ShallowRef } from 'vue'
import { LayoutEngineError, loadLayoutEngine } from 'tidy-layout'
import type { ArrangeRequest, ArrangeResponse, LayoutEngine } from 'tidy-layout'
import engineUrl from 'tidy-layout/engine.wasm?url'

const engine = shallowRef<LayoutEngine>()
let loading: Promise<void> | undefined

/**
 * The layout engine (packages/layout, WebAssembly). It loads once, in the background; until then,
 * and if loading fails, the value is `undefined` and callers fall back to the model's own rules.
 */
export function useLayoutEngine(): ShallowRef<LayoutEngine | undefined> {
  loading ??= loadLayoutEngine(fetch(engineUrl))
    .then((loaded) => {
      engine.value = loaded
    })
    .catch((error: unknown) => console.warn('The layout engine did not load:', error))
  return engine
}

type Answer = { id: number; answer: ArrangeResponse } | { id: number; error: string }

/** `arrange` asked of a worker (`workers/arrange.worker.ts`): each request gets its own answer. */
export function arrangeThrough(
  worker: Pick<Worker, 'postMessage' | 'addEventListener'>,
): (request: ArrangeRequest) => Promise<ArrangeResponse> {
  const waiting = new Map<number, { resolve: (answer: ArrangeResponse) => void; reject: (error: Error) => void }>()
  let next = 0
  worker.addEventListener('message', (event) => {
    const data = (event as MessageEvent<Answer>).data
    const asker = waiting.get(data.id)
    waiting.delete(data.id)
    if ('error' in data) asker?.reject(new LayoutEngineError(data.error))
    else asker?.resolve(data.answer)
  })
  worker.addEventListener('error', () => {
    for (const asker of waiting.values()) asker.reject(new Error('The layout worker failed'))
    waiting.clear()
  })
  return (request) =>
    new Promise((resolve, reject) => {
      const id = next++
      waiting.set(id, { resolve, reject })
      worker.postMessage({ id, request })
    })
}

let background: ((request: ArrangeRequest) => Promise<ArrangeResponse>) | undefined

/**
 * Arrange a diagram without holding the page up: the engine's `arrange` takes long enough to
 * freeze it, so it runs in a worker, started at the first call.
 */
export function arrangeInBackground(request: ArrangeRequest): Promise<ArrangeResponse> {
  background ??= arrangeThrough(
    new Worker(new URL('../workers/arrange.worker.ts', import.meta.url), { type: 'module' }),
  )
  return background(request)
}
