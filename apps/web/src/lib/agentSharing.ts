import { ref, shallowRef } from 'vue'

// What the rest of the app knows of agent sharing (J7): whether an MCP client is connected to
// the open workspace, and the question that is asked before that workspace is left, which
// ends the connection. The connection itself is `AgentConnectionDialog.vue`'s.

/** An MCP client is paired with the open workspace. */
export const agentActive = ref(false)
/** How many tool calls of the agent are being worked on right now. */
export const agentCalls = ref(0)

/** The question whether to leave the workspace, while it is asked (`AgentPresence.vue` asks it). */
export const leaving = shallowRef<{ answer: (leave: boolean) => void }>()

/** Asks whether to leave. A question that is still open is answered with "stay" first. */
export function askToLeave(): Promise<boolean> {
  leaving.value?.answer(false)
  return new Promise((resolve) => {
    const asked = {
      answer(leave: boolean) {
        if (leaving.value === asked) leaving.value = undefined
        resolve(leave)
      },
    }
    leaving.value = asked
  })
}

type Place = { params: Record<string, unknown> }
/** Where an address is: in a workspace, in a shared session, or in neither. */
const placeOf = (route: Place) => route.params.workspace ?? route.params.room

/** Whether going from one address to another leaves the workspace; another diagram of it does not. */
export function leavesWorkspace(to: Place, from: Place): boolean {
  const here = placeOf(from)
  return here !== undefined && placeOf(to) !== here
}

/**
 * Whether the app may go from one address to another: with an agent connected, leaving the
 * workspace ends its connection, and is asked first. `stillThere`: whether the workspace of an
 * address exists; one that was just deleted is left without a question.
 */
export async function mayLeave(to: Place, from: Place, stillThere: (place: string) => boolean): Promise<boolean> {
  if (!agentActive.value || !leavesWorkspace(to, from) || !stillThere(String(placeOf(from)))) return true
  return askToLeave()
}
