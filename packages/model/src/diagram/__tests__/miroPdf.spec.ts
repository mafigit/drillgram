import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { miroPdfDiagram, miroPdfPagesDiagram } from '../miroPdf'
import type { Drawing, DrawnPath, DrawnText } from '../drawing'
import { validateDiagram } from '../model'
import { emptyWorkspace, importDiagram, ROOT_VIEW_ID, validateWorkspace } from '../workspace'

const rect = (x: number, y: number, w: number, h: number, paint: Partial<DrawnPath>): DrawnPath => ({
  pieces: [{ points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], closed: true, curved: false }],
  ...paint,
})
const polygon = (points: [number, number][], paint: Partial<DrawnPath> = { stroke: '#1a1a1a' }): DrawnPath => ({
  pieces: [{ points: points.map(([x, y]) => ({ x, y })), closed: true, curved: false }],
  ...paint,
})
const line = (from: [number, number], to: [number, number], stroke = '#333333'): DrawnPath => ({
  pieces: [{ points: [from, to].map(([x, y]) => ({ x, y })), closed: false, curved: false }],
  stroke,
})
const text = (words: string, x: number, y: number, height = 8): DrawnText => ({ text: words, x, y, width: words.length * height * 0.5, height })
const ground: DrawnPath = rect(0, 0, 600, 400, { fill: '#f2f2f2' })
const board = (paths: DrawnPath[], texts: DrawnText[] = []): Drawing => ({ width: 600, height: 400, paths: [ground, ...paths], texts })

describe('miroPdfDiagram', () => {
  it('takes a shape drawn filled and then outlined as one box', () => {
    const diagram = miroPdfDiagram(board([rect(100, 100, 60, 60, { fill: '#ffffff' }), rect(100, 100, 60, 60, { stroke: '#1a1a1a' })], [text('API', 115, 125)]))
    expect(diagram.elements).toEqual([{ id: 'p1', kind: 'box', name: 'API' }])
  })

  it('takes the head and body of a container as parts of it, its title its name', () => {
    const diagram = miroPdfDiagram(
      board(
        [rect(100, 100, 200, 150, { stroke: '#a0c4fb' }), rect(100, 100, 200, 30, { fill: '#a0c4fb' }), rect(100, 130, 200, 120, { fill: '#a0c4fb' }), rect(150, 160, 60, 60, { fill: '#fff79e' })],
        [text('Payments', 105, 110), text('Ledger', 160, 185)],
      ),
    )
    expect(diagram.elements).toEqual([
      { id: 'p1', kind: 'box', name: 'Payments' },
      { id: 'p2', kind: 'box', name: 'Ledger', inside: 'p1' },
    ])
  })

  it('names the lines of a box: the first its name, the rest its description', () => {
    const diagram = miroPdfDiagram(board([rect(100, 100, 80, 80, { fill: '#fff79e' })], [text('Shop', 110, 110), text('in', 140, 110), text('sells books', 110, 125)]))
    expect(diagram.elements[0]).toMatchObject({ name: 'Shop in', description: 'sells books' })
  })

  it('gives a connection the way its arrowhead points, wherever the line begins', () => {
    const arrow = polygon([[160, 127], [166, 130], [160, 133]], { fill: '#333333' })
    const diagram = miroPdfDiagram(board([rect(100, 100, 60, 60, { fill: '#fff79e' }), rect(300, 100, 60, 60, { fill: '#fff79e' }), line([166, 130], [300, 130]), arrow], [text('A', 120, 125), text('B', 320, 125)]))
    expect(diagram.relationships).toEqual([{ from: 'p2', to: 'p1' }])
  })

  it('takes a line with a loose end, or one from a box to itself, as no connection', () => {
    const diagram = miroPdfDiagram(board([rect(100, 100, 60, 60, { fill: '#fff79e' }), line([160, 130], [260, 130]), line([100, 110], [100, 150])]))
    expect(diagram.relationships).toEqual([])
  })

  it('knows the outlines it has a shape for', () => {
    const shapes = miroPdfDiagram(
      board([
        polygon([[130, 20], [160, 80], [100, 80]]),
        polygon([[200, 20], [260, 20], [230, 80]]),
        polygon([[330, 20], [360, 50], [330, 80], [300, 50]]),
        polygon([[420, 20], [480, 20], [460, 80], [400, 80]]),
        polygon([[120, 120], [140, 120], [160, 180], [100, 180]]),
        polygon([[220, 120], [260, 120], [280, 150], [260, 180], [220, 180], [200, 150]]),
        rect(300, 120, 60, 60, { stroke: '#1a1a1a' }),
      ]),
    ).elements.map((element) => element.shape)
    expect(shapes).toEqual(['triangle', 'flippedTriangle', 'diamond', 'parallelogram', 'trapezoid', 'hexagon', undefined])
  })

  it('makes a box of a text that stands in no box', () => {
    const diagram = miroPdfDiagram(board([rect(100, 100, 60, 60, { fill: '#fff79e' })], [text('Open questions', 300, 300), text('who pays?', 300, 309)]))
    expect(diagram.elements.find((element) => element.shape === 'text')).toMatchObject({ name: 'Open questions', description: 'who pays?' })
  })

  it('gives a diagram the model takes for any drawing', () => {
    const point = fc.record({ x: fc.double({ min: 0, max: 600, noNaN: true }), y: fc.double({ min: 0, max: 400, noNaN: true }) })
    const path = fc.record(
      {
        pieces: fc.array(fc.record({ points: fc.array(point, { minLength: 1, maxLength: 8 }), closed: fc.boolean(), curved: fc.boolean() }), { minLength: 1, maxLength: 2 }),
        fill: fc.constantFrom('#ffffff', '#fff79e', '#333333'),
        stroke: fc.constantFrom('#1a1a1a', '#e6280f'),
      },
      { requiredKeys: ['pieces'] },
    )
    const words = fc.record({ text: fc.string(), x: fc.double({ min: 0, max: 600, noNaN: true }), y: fc.double({ min: 0, max: 400, noNaN: true }), width: fc.double({ min: 0, max: 80, noNaN: true }), height: fc.double({ min: 1, max: 12, noNaN: true }) })
    fc.assert(
      fc.property(fc.array(path, { maxLength: 15 }), fc.array(words, { maxLength: 10 }), (paths, texts) => {
        const diagram = miroPdfDiagram({ width: 600, height: 400, paths, texts })
        validateDiagram(diagram)
        validateWorkspace(importDiagram(emptyWorkspace(), ROOT_VIEW_ID, diagram))
      }),
    )
  })
})

describe('miroPdfPagesDiagram', () => {
  it('takes every page, each box once', () => {
    const page = board([rect(100, 100, 60, 60, { fill: '#fff79e' }), rect(300, 100, 60, 60, { fill: '#fff79e' }), line([160, 130], [300, 130])], [text('A', 120, 125)])
    const diagram = miroPdfPagesDiagram([page, page])
    validateDiagram(diagram)
    expect(diagram.elements.map((element) => element.id)).toEqual(['page1_p1', 'page1_p2', 'page2_p1', 'page2_p2'])
    expect(diagram.relationships).toEqual([
      { from: 'page1_p1', to: 'page1_p2' },
      { from: 'page2_p1', to: 'page2_p2' },
    ])
    expect(miroPdfPagesDiagram([page])).toEqual(miroPdfDiagram(page))
  })
})

describe('the outlines of Miro, in its vector PDF', () => {
  /** A drawing of one shape 100 wide and 60 high at 100, 100: its outline and what is on it. */
  const at = (points: [number, number][]) => points.map(([x, y]) => ({ x: 100 + x * 100, y: 100 + y * 60 }))
  const outline = (points: [number, number][], paint: Partial<DrawnPath> = { stroke: '#1a1a1a' }): DrawnPath => ({ pieces: [{ points: at(points), closed: true, curved: false }], ...paint })
  const mark = (points: [number, number][], curved = false): DrawnPath => ({ pieces: [{ points: at(points), closed: false, curved }], stroke: '#1a1a1a' })
  const round = (inset = 0, paint: Partial<DrawnPath> = { stroke: '#1a1a1a' }): DrawnPath => ({
    pieces: [{ points: Array.from({ length: 64 }, (_, i) => ({ x: 150 + (50 - inset) * Math.cos((i / 64) * 2 * Math.PI), y: 130 + (30 - inset * 0.6) * Math.sin((i / 64) * 2 * Math.PI) })), closed: true, curved: true }],
    ...paint,
  })
  const arc = (y: number): [number, number][] => Array.from({ length: 9 }, (_, i) => [i / 8, y + 0.1 * Math.sin((i / 8) * Math.PI)])
  const rect: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]
  const shapeOf = (...paths: DrawnPath[]) => miroPdfDiagram({ width: 600, height: 400, paths, texts: [] }).elements.map((element) => element.shape)

  it.each<[string, DrawnPath[], string | undefined]>([
    ['star', [outline([[0.5, 0], [0.62, 0.35], [1, 0.38], [0.7, 0.6], [0.8, 1], [0.5, 0.78], [0.2, 1], [0.3, 0.6], [0, 0.38], [0.38, 0.35]])], 'star'],
    ['arrow right', [outline([[0, 0.2], [0.7, 0.2], [0.7, 0], [1, 0.5], [0.7, 1], [0.7, 0.8], [0, 0.8]])], 'arrowRight'],
    ['arrow left', [outline([[0, 0.5], [0.3, 0], [0.3, 0.2], [1, 0.2], [1, 0.8], [0.3, 0.8], [0.3, 1]])], 'arrowLeft'],
    ['arrow both ways', [outline([[0, 0.5], [0.3, 0], [0.3, 0.2], [0.7, 0.2], [0.7, 0], [1, 0.5], [0.7, 1], [0.7, 0.8], [0.3, 0.8], [0.3, 1]])], 'arrowBoth'],
    ['cross', [outline([[0.3, 0], [0.7, 0], [0.7, 0.3], [1, 0.3], [1, 0.7], [0.7, 0.7], [0.7, 1], [0.3, 1], [0.3, 0.7], [0, 0.7], [0, 0.3], [0.3, 0.3]])], 'cross'],
    ['octagon', [outline([[0.3, 0], [0.7, 0], [1, 0.3], [1, 0.7], [0.7, 1], [0.3, 1], [0, 0.7], [0, 0.3]])], 'octagon'],
    ['pentagon', [outline([[0.5, 0], [1, 0.4], [0.8, 1], [0.2, 1], [0, 0.4]])], 'pentagon'],
    ['tag', [outline([[0, 0], [0.8, 0], [1, 0.5], [0.8, 1], [0, 1]])], 'tag'],
    ['chevron', [outline([[0, 0], [0.8, 0], [1, 0.5], [0.8, 1], [0, 1], [0.2, 0.5]])], 'step'],
    ['off-page link', [outline([[0, 0], [1, 0], [1, 0.6], [0.5, 1], [0, 0.6]])], 'offPage'],
    ['hourglass', [outline([[0, 0], [1, 0], [0.5, 0.5], [1, 1], [0, 1], [0.5, 0.5]])], 'hourglass'],
    ['lightning bolt', [outline([[0.8, 0], [0.4, 0.45], [1, 0.45], [0.2, 1], [0.6, 0.55], [0, 0.55]])], 'bolt'],
    ['circle', [round()], 'circle'],
    ['or', [round(), mark([[0.5, 0], [0.5, 1]]), mark([[0, 0.5], [1, 0.5]])], 'circlePlus'],
    ['summing junction', [round(), mark([[0.15, 0.15], [0.85, 0.85]]), mark([[0.85, 0.15], [0.15, 0.85]])], 'circleCross'],
    ['magnetic tape', [round(), mark([[0.5, 1], [1, 1]])], 'magneticTape'],
    ['double circle', [round(), round(4)], 'doubleCircle'],
    ['junction', [round(0, { fill: '#050038' })], 'filledCircle'],
    ['subroutine', [outline(rect), mark([[0.1, 0], [0.1, 1]]), mark([[0.9, 0], [0.9, 1]])], 'subroutine'],
    ['lined process', [outline(rect), mark([[0.1, 0], [0.1, 1]])], 'linedProcess'],
    ['divided', [outline(rect), mark([[0, 0.2], [1, 0.2]])], 'divided'],
    ['internal storage', [outline(rect), mark([[0.1, 0], [0.1, 1]]), mark([[0, 0.15], [1, 0.15]])], 'internalStorage'],
    ['database', [outline(rect), mark(arc(0.05), true)], 'cylinder'],
    ['plain', [outline(rect)], undefined],
  ])('reads a %s', (_, paths, shape) => {
    expect(shapeOf(...paths)).toEqual([shape])
  })

  it('reads a lone curly brace or bracket as a comment, two braces facing each other as one', () => {
    const brace = (x: number, way: 1 | -1): DrawnPath => mark([[x + way * 0.08, 0], [x + way * 0.04, 0.05], [x + way * 0.04, 0.45], [x, 0.5], [x + way * 0.04, 0.55], [x + way * 0.04, 0.95], [x + way * 0.08, 1]])
    const bracket = mark([[0.08, 0], [0, 0], [0, 1], [0.08, 1]])
    expect(shapeOf(brace(0, 1))).toEqual(['brace'])
    expect(shapeOf(brace(0.08, -1))).toEqual(['braceRight'])
    expect(shapeOf(bracket)).toEqual(['bracket'])
    expect(shapeOf(brace(0, 1), brace(1, -1))).toEqual(['braces'])
  })
})
