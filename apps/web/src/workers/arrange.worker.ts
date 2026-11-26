// "Arrange" off the main thread: TALA's whole pipeline, three times, takes too long to run where
// the page is drawn. This worker has its own engine and answers one request at a time.
import { loadLayoutEngine } from 'tidy-layout'
import type { ArrangeRequest } from 'tidy-layout'
import engineUrl from 'tidy-layout/engine.wasm?url'

const engine = loadLayoutEngine(fetch(engineUrl))

addEventListener('message', async ({ data }: MessageEvent<{ id: number; request: ArrangeRequest }>) => {
  try {
    postMessage({ id: data.id, answer: (await engine).arrange(data.request) })
  } catch (error) {
    postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) })
  }
})
