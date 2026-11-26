import { beforeEach, describe, expect, it } from 'vitest'
import { agentActive, askToLeave, leaving, leavesWorkspace, mayLeave } from '../agentSharing'

const at = (params: Record<string, string>) => ({ params })
const workspace = (id: string, view?: string) => at(view === undefined ? { workspace: id } : { workspace: id, viewId: view })

describe('leaving a workspace an agent is connected to', () => {
  beforeEach(() => {
    agentActive.value = false
    leaving.value?.answer(false)
  })

  it('is leaving when the workspace is another one, or none', () => {
    expect(leavesWorkspace(workspace('b'), workspace('a'))).toBe(true)
    expect(leavesWorkspace(at({}), workspace('a'))).toBe(true)
    // A shared session is a place like a workspace.
    expect(leavesWorkspace(workspace('a'), at({ room: 'r' }))).toBe(true)
  })

  it('is not leaving to go to another diagram of the same workspace, nor to arrive at one', () => {
    expect(leavesWorkspace(workspace('a', 'inside-Shop'), workspace('a'))).toBe(false)
    expect(leavesWorkspace(workspace('a'), workspace('a', 'inside-Shop'))).toBe(false)
    expect(leavesWorkspace(at({ room: 'r', viewId: 'v' }), at({ room: 'r' }))).toBe(false)
    expect(leavesWorkspace(workspace('a'), at({}))).toBe(false)
  })

  it('lets everybody go who has no agent connected, without a question', async () => {
    expect(await mayLeave(workspace('b'), workspace('a'), () => true)).toBe(true)
    expect(leaving.value).toBeUndefined()
  })

  it('asks before the workspace is left with an agent connected, and goes by the answer', async () => {
    agentActive.value = true
    const stays = mayLeave(workspace('b'), workspace('a'), () => true)
    expect(leaving.value).toBeDefined()
    leaving.value!.answer(false)
    expect(await stays).toBe(false)
    expect(leaving.value).toBeUndefined()

    const goes = mayLeave(workspace('b'), workspace('a'), () => true)
    leaving.value!.answer(true)
    expect(await goes).toBe(true)
  })

  it('asks nothing for another diagram of the workspace, and nothing when the workspace is gone', async () => {
    agentActive.value = true
    expect(await mayLeave(workspace('a', 'inside-Shop'), workspace('a'), () => true)).toBe(true)
    // Deleted a moment ago: there is nothing to stay in.
    expect(await mayLeave(at({}), workspace('a'), () => false)).toBe(true)
    expect(leaving.value).toBeUndefined()
  })

  it('takes a second question as the answer "stay" to the first', async () => {
    const first = askToLeave()
    const second = askToLeave()
    expect(await first).toBe(false)
    leaving.value!.answer(true)
    expect(await second).toBe(true)
  })
})
