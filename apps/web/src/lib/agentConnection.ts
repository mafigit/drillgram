import {
  AGENT_CALL_TIMEOUT_MS,
  AGENT_SESSION_MS,
  AGENT_SOCKET_PATH,
  AGENT_SOCKET_PROTOCOL,
  hashCredential,
  MCP_PATH,
  toHex,
} from './agentProtocol'
import type { AgentCall, AgentReply, AgentTool } from './agentProtocol'

export interface AgentConnection {
  url: string
  token: string
}

/** Open a same-origin socket only after the user has chosen to share. */
export async function connectAgent(
  run: (tool: AgentTool, signal: AbortSignal) => Promise<Record<string, unknown>>,
  onClose: (reason: string) => void,
  signal: AbortSignal,
): Promise<AgentConnection> {
  const secret = toHex(crypto.getRandomValues(new Uint8Array(32)))
  const token = await hashCredential(secret)
  signal.throwIfAborted()

  const endpoint = new URL(AGENT_SOCKET_PATH, location.href)
  endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:'

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint, [AGENT_SOCKET_PROTOCOL, secret])
    let opened = false
    let lease: ReturnType<typeof setTimeout> | undefined
    const timeout = setTimeout(() => close(), 10_000)

    const close = () => {
      clearTimeout(timeout)
      clearTimeout(lease)
      signal.removeEventListener('abort', close)
      socket.close()
    }

    signal.addEventListener('abort', close, { once: true })
    socket.onopen = () => {
      opened = true
      clearTimeout(timeout)
      lease = setTimeout(() => {
        socket.close(1000, 'Sharing expired')
      }, AGENT_SESSION_MS)
      resolve({ url: new URL(MCP_PATH, location.href).href, token })
    }
    socket.onclose = (event) => {
      close()
      if (opened) onClose(event.reason)
      else reject(new Error('Could not start agent sharing. Check your connection and try again.'))
    }
    let pending = Promise.resolve()
    socket.onmessage = ({ data }) => {
      const callSignal = AbortSignal.any([signal, AbortSignal.timeout(AGENT_CALL_TIMEOUT_MS)])
      pending = pending.then(async () => {
        if (callSignal.aborted || socket.readyState !== WebSocket.OPEN) return
        let call: AgentCall
        try {
          call = JSON.parse(data) as AgentCall
        } catch {
          socket.close(1008, 'Invalid MCP tool call')
          return
        }
        const { id, tool } = call
        let reply: AgentReply
        try {
          reply = { id, value: await run(tool, callSignal) }
        } catch (error) {
          reply = { id, error: error instanceof Error ? error.message : 'Drillgram could not run that tool.' }
        }
        if (!callSignal.aborted && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(reply))
      })
    }
  })
}
