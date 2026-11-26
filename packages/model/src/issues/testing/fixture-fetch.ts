/** One recorded HTTP exchange. Fixture files are JSON arrays of these. */
export interface FixtureInteraction {
  request: { method: string; url: string }
  response: { status: number; headers?: Record<string, string>; body: unknown }
}

/** A fake `fetch` that also records every request it was called with. */
export type FixtureFetch = typeof fetch & { requests: Request[] }

/**
 * Builds a `fetch` that serves recorded interactions, matched on exact method and URL, and
 * throws on any unrecorded request. It never falls through to the network.
 */
export function createFixtureFetch(...fixtures: FixtureInteraction[][]): FixtureFetch {
  const interactions = fixtures.flat()
  const requests: Request[] = []

  const fake = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    requests.push(request)
    const match = interactions.find(
      (interaction) =>
        interaction.request.method.toUpperCase() === request.method &&
        interaction.request.url === request.url,
    )
    if (!match) {
      const recorded = interactions
        .map((interaction) => `  ${interaction.request.method} ${interaction.request.url}`)
        .join('\n')
      throw new Error(
        `Unrecorded request: ${request.method} ${request.url}\nRecorded:\n${recorded}`,
      )
    }
    const { status, headers, body } = match.response
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    })
  }

  return Object.assign(fake, { requests }) as FixtureFetch
}

/** The envelope every recorded fixture file uses. */
export interface RecordedResponse {
  status: number
  headers?: Record<string, string>
  body: unknown
}

export interface FixtureRequest {
  url: URL
  method: string
  headers: Headers
}

export type FixtureHandler = (request: FixtureRequest) => RecordedResponse | undefined

/** A stub `fetch` for tests that serves recorded responses and never touches the network. */
export function fixtureFetch(handler: FixtureHandler): {
  fetch: typeof fetch
  calls: FixtureRequest[]
} {
  const calls: FixtureRequest[] = []
  const stub = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const call: FixtureRequest = {
      url: new URL(request.url),
      method: request.method,
      headers: request.headers,
    }
    calls.push(call)
    const recorded = handler(call)
    if (recorded === undefined) {
      throw new Error(`No fixture for ${call.method} ${call.url.href}`)
    }
    return new Response(JSON.stringify(recorded.body), {
      status: recorded.status,
      headers: { 'content-type': 'application/json', ...recorded.headers },
    })
  }
  return { fetch: stub as typeof fetch, calls }
}
