import type { AgentTool } from './agentTools'
export type { AgentTool } from './agentTools'

/** Messages between the opt-in browser tab and the Cloudflare relay. */
export const AGENT_SOCKET_PATH = '/api/agent/socket'
export const MCP_PATH = '/mcp'
export const AGENT_SOCKET_PROTOCOL = 'drillgram-agent'
export const AGENT_SESSION_MS = 60 * 60 * 1000
export const AGENT_CALL_TIMEOUT_MS = 30_000

export type AgentCall = { id: string; tool: AgentTool }
export type AgentReply = { id: string } & ({ value: Record<string, unknown> } | { error: string })

export const CREDENTIAL = /^[a-f0-9]{64}$/

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** The client gets the hash of the tab's secret, so it cannot impersonate the tab. */
export async function hashCredential(secret: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))))
}
