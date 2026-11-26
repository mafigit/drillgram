import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SHAPE_LIBRARIES } from '../kinds'

const KEY = 'drillgram.recentShapes'
/** The module afresh, as a new page load finds it. */
const load = async () => {
  vi.resetModules()
  return import('../recentShapes')
}
const shape = (library: string, label: string) => {
  const found = SHAPE_LIBRARIES.find((l) => l.name === library)!.shapes.find((s) => s.label === label)!
  return { ...found, library }
}
const names = (shapes: { library: string; label: string }[]) => shapes.map((s) => `${s.library}: ${s.label}`)

describe('the shapes picked last', () => {
  beforeEach(() => window.localStorage.clear())

  it('are none at first', async () => {
    const { recentShapes } = await load()
    expect(recentShapes.value).toEqual([])
  })

  it('keeps the last six, the latest first, each once', async () => {
    const { recentShapes, rememberShape } = await load()
    for (const label of ['Person', 'Software System', 'Container', 'Component']) rememberShape(shape('C4', label))
    for (const label of ['Database', 'Queue', 'Cloud']) rememberShape(shape('Basic', label))
    expect(names(recentShapes.value)).toEqual(['Basic: Cloud', 'Basic: Queue', 'Basic: Database', 'C4: Component', 'C4: Container', 'C4: Software System'])
    rememberShape(shape('C4', 'Container'))
    expect(names(recentShapes.value)).toEqual(['C4: Container', 'Basic: Cloud', 'Basic: Queue', 'Basic: Database', 'C4: Component', 'C4: Software System'])
  })

  it('are the shapes of the library, with what they start with', async () => {
    const { recentShapes, rememberShape } = await load()
    rememberShape(shape('Basic', 'Database'))
    rememberShape(shape('Code', 'Python'))
    expect(recentShapes.value).toEqual([shape('Code', 'Python'), shape('Basic', 'Database')])
  })

  it('are kept in the browser, and what no library has any more is left out', async () => {
    const first = await load()
    first.rememberShape(shape('Basic', 'Database'))
    const stored = JSON.parse(window.localStorage.getItem(KEY)!)
    window.localStorage.setItem(KEY, JSON.stringify([{ library: 'Gone', label: 'Thing' }, ...stored, 'nonsense']))
    const again = await load()
    expect(names(again.recentShapes.value)).toEqual(['Basic: Database'])
  })

  it('are none when the browser kept something unreadable', async () => {
    window.localStorage.setItem(KEY, '{not json')
    const { recentShapes } = await load()
    expect(recentShapes.value).toEqual([])
  })
})
