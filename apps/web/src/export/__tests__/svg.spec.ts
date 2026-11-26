import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { diagramSvg, escapeXml, truncate, wrap } from '../svg'
import type { Scene } from '../svg'
import { COLOURS } from '../palette'

/** Every character is 7 px wide, whatever the font. */
const measure = (text: string) => text.length * 7

function parse(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
  return doc
}

const texts = (doc: Document) => [...doc.getElementsByTagName('text')].map((t) => t.textContent)

const SCENE: Scene = {
  title: 'System Landscape',
  cards: [
    { x: 40, y: 40, width: 220, height: 120, name: 'Customer', kind: 'person', external: false, icons: [] },
    {
      x: 400,
      y: 40,
      width: 220,
      height: 120,
      name: 'Online Shop',
      kind: 'softwareSystem',
      description: 'Sells books',
      technology: 'Vue',
      external: false,
      icons: ['postgresql', 'unknown'],
    },
  ],
  connectors: [
    {
      path: 'M 260 100 L 400 100',
      points: [
        { x: 260, y: 100 },
        { x: 400, y: 100 },
      ],
      label: 'Places orders in',
      labelAt: { x: 330, y: 100 },
    },
  ],
  key: { kinds: ['person', 'softwareSystem'], external: false, relationships: true },
}

describe('wrap', () => {
  it('breaks at spaces and keeps what fits on a line', () => {
    expect(wrap('Sells books online', 84, 2, '', measure)).toEqual(['Sells books', 'online'])
  })

  it('ends the last line with "…" when the text goes on', () => {
    expect(wrap('one two three four', 35, 2, '', measure)).toEqual(['one', 'two…'])
  })

  it('breaks a word too long for a line', () => {
    expect(wrap('abcdefghij', 35, 3, '', measure)).toEqual(['abcde', 'fghij'])
  })

  it('never gives more lines than asked, nor a line wider than asked', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), fc.integer({ min: 2, max: 30 }), fc.integer({ min: 1, max: 3 }), (text, letters, most) => {
        const lines = wrap(text, letters * 7, most, '', measure)
        expect(lines.length).toBeLessThanOrEqual(most)
        for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(letters * 7)
      }),
    )
  })
})

describe('truncate', () => {
  it('keeps a text that fits', () => expect(truncate('Container', 100, '', measure)).toBe('Container'))
  it('cuts with "…"', () => expect(truncate('Container: Vue', 42, '', measure)).toBe('Conta…'))
})

describe('escapeXml', () => {
  it('escapes what XML reserves', () => expect(escapeXml(`<a & "b" 'c'>`)).toBe('&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;'))
})

describe('diagramSvg', () => {
  const icons = new Map([['postgresql', 'data:image/svg+xml;base64,PHN2Zy8+']])

  it('is a standalone SVG with the title, the cards, the label and the key as text', () => {
    const doc = parse(diagramSvg(SCENE, { measure, icons }))
    expect(doc.documentElement.localName).toBe('svg')
    expect(doc.documentElement.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg')
    expect(texts(doc)).toEqual(
      expect.arrayContaining([
        'System Landscape',
        'Customer',
        'Person',
        'Online Shop',
        'Sells books',
        'Software system: Vue',
        'Places orders in',
        'KEY',
        'Software System',
        'Relationship',
      ]),
    )
    expect(doc.getElementsByTagName('title')[0]?.textContent).toBe('System Landscape')
  })

  it('has whole-pixel sizes that hold the diagram with room around it', () => {
    const doc = parse(diagramSvg(SCENE, { measure }))
    const width = Number(doc.documentElement.getAttribute('width'))
    const height = Number(doc.documentElement.getAttribute('height'))
    expect(Number.isInteger(width) && Number.isInteger(height)).toBe(true)
    // From the left of the first card to the right of the second, and a margin on both sides.
    expect(width).toBe(580 + 2 * 32)
    expect(height).toBeGreaterThan(120 + 2 * 32)
  })

  it('puts the icons it has a picture of inside the file, and leaves the others out', () => {
    const doc = parse(diagramSvg(SCENE, { measure, icons }))
    expect([...doc.getElementsByTagName('image')].map((i) => i.getAttribute('href'))).toEqual([icons.get('postgresql')])
  })

  it('carries the font when it is given', () => {
    expect(diagramSvg(SCENE, { measure, font: 'data:font/woff2;base64,AAAA' })).toContain(
      "src:url(data:font/woff2;base64,AAAA) format('woff2')",
    )
    expect(diagramSvg(SCENE, { measure })).not.toContain('@font-face')
  })

  it('escapes names, so any name gives a valid file', () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        const cleaned = name.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]|[\ud800-\udfff]/g, '')
        const scene: Scene = { ...SCENE, title: cleaned, cards: [{ ...SCENE.cards[0]!, name: cleaned }] }
        parse(diagramSvg(scene, { measure }))
      }),
    )
  })

  it('draws the frame of the opened object with its name and kind', () => {
    const doc = parse(
      diagramSvg(
        {
          ...SCENE,
          title: 'Containers of Online Shop',
          boundary: { name: 'Online Shop', kind: 'softwareSystem', x: 0, y: 0, width: 700, height: 300 },
        },
        { measure },
      ),
    )
    expect(texts(doc)).toEqual(expect.arrayContaining(['Online Shop', '[Software System]']))
    expect(doc.querySelector('rect[stroke-dasharray]')).not.toBeNull()
  })

  it('draws an empty diagram as its title alone', () => {
    const doc = parse(diagramSvg({ title: 'Empty', cards: [], connectors: [], key: { kinds: [], external: false, relationships: false } }, { measure }))
    expect(texts(doc)).toEqual(['Empty'])
  })
})

describe('a description written as Markdown', () => {
  const card = (description: string, height: number): Scene => ({
    ...SCENE,
    cards: [{ x: 40, y: 40, width: 220, height, name: 'Notes', kind: 'box', external: false, icons: [], description }],
    connectors: [],
  })
  const TEXT = '# Plan\n\nShip **fast**.\n\n- [x] Model\n- [ ] Editor\n\n`pnpm test`'

  it('is drawn as plain lines, without its marks, as many as the card has room for', () => {
    const drawn = texts(parse(diagramSvg(card(TEXT, 200), { measure })))
    expect(drawn).toEqual(expect.arrayContaining(['Plan', 'Ship fast.', '☑ Model', '☐ Editor', 'pnpm test']))
    expect(drawn.join(' ')).not.toMatch(/[#*`]|\[x\]/)
  })

  it('ends with an ellipsis where the card is too small for all of it', () => {
    const drawn = texts(parse(diagramSvg(card(`${TEXT}\n\nAnd a good deal more that has no room here.`, 120), { measure })))
    expect(drawn).toContain('Plan')
    expect(drawn).not.toContain('pnpm test')
    expect(drawn.some((line) => line?.endsWith('…'))).toBe(true)
  })
})

describe('a connector to the frame', () => {
  const scene: Scene = {
    ...SCENE,
    connectors: [...SCENE.connectors, { path: 'M 150 40 L 150 0', points: [], label: 'Buys from', labelAt: { x: 150, y: 20 }, toFrame: true }],
    key: { ...SCENE.key, toFrame: true },
  }

  it('is red, line, arrow and label, and the key says what red means', () => {
    const doc = parse(diagramSvg(scene, { measure }))
    const line = doc.querySelector('path[d="M 150 40 L 150 0"]')!
    expect(line.getAttribute('stroke')).toBe(COLOURS.destructive)
    expect(line.getAttribute('marker-end')).toBe('url(#arrow-to-frame)')
    expect(doc.querySelector('#arrow-to-frame polyline')?.getAttribute('fill')).toBe(COLOURS.destructive)
    const label = [...doc.querySelectorAll('text')].find((el) => el.textContent === 'Buys from')!
    expect(label.getAttribute('fill')).toBe(COLOURS.destructive)
    expect(texts(doc)).toContain('Not yet to a part')
  })

  it('leaves the other connectors and a diagram without one as they were', () => {
    const doc = parse(diagramSvg(SCENE, { measure }))
    expect(doc.querySelector('#arrow-to-frame')).toBeNull()
    expect(texts(doc)).not.toContain('Not yet to a part')
    expect(doc.querySelector('path[d="M 260 100 L 400 100"]')?.getAttribute('stroke')).toBe(COLOURS['muted-foreground'])
  })
})

describe('a connector with a colour', () => {
  const scene: Scene = {
    ...SCENE,
    connectors: [...SCENE.connectors, { path: 'M 150 40 L 150 0', points: [], label: 'Publishes to', labelAt: { x: 150, y: 20 }, colour: 'orange' }],
  }

  it('is drawn in that colour, line and arrowhead, with its label as any other', () => {
    const doc = parse(diagramSvg(scene, { measure }))
    const line = doc.querySelector('path[d="M 150 40 L 150 0"]')!
    expect(line.getAttribute('stroke')).toBe('#ea580c')
    expect(line.getAttribute('marker-end')).toBe('url(#arrow-orange)')
    expect(doc.querySelector('#arrow-orange polyline')?.getAttribute('fill')).toBe('#ea580c')
    const label = [...doc.querySelectorAll('text')].find((el) => el.textContent === 'Publishes to')!
    expect(label.getAttribute('fill')).toBe(COLOURS.foreground)
    // An arrowhead only for the colours the diagram uses.
    expect(doc.querySelector('#arrow-blue')).toBeNull()
    expect(parse(diagramSvg(SCENE, { measure })).querySelector('#arrow-orange')).toBeNull()
  })
})

describe('a table', () => {
  const table: Scene = {
    ...SCENE,
    cards: [
      {
        x: 40,
        y: 40,
        width: 220,
        height: 120,
        name: 'orders',
        kind: 'box',
        external: false,
        icons: [],
        shape: 'table',
        columns: [{ name: 'id', type: 'uuid', key: 'primary' }, { name: 'customer_id', type: 'uuid', key: 'foreign' }, { name: 'total' }],
      },
    ],
    connectors: [],
  }

  it('is drawn with its name over a line and a row per column: key, name, and the type at the right', () => {
    const doc = parse(diagramSvg(table, { measure }))
    expect(texts(doc)).toEqual(expect.arrayContaining(['orders', 'PK', 'id', 'uuid', 'FK', 'customer_id', 'total']))
    const at = (words: string) => [...doc.querySelectorAll('text')].find((el) => el.textContent === words)!
    // Under each other, 20 apart, as on the canvas; names from the left, types to the right.
    expect(Number(at('customer_id').getAttribute('y')) - Number(at('id').getAttribute('y'))).toBe(20)
    expect(Number(at('total').getAttribute('y')) - Number(at('customer_id').getAttribute('y'))).toBe(20)
    expect(at('id').getAttribute('text-anchor')).toBe('start')
    expect(at('uuid').getAttribute('text-anchor')).toBe('end')
    expect(Number(at('orders').getAttribute('y'))).toBeLessThan(Number(at('id').getAttribute('y')))
    // The line under the name, from border to border.
    expect([...doc.querySelectorAll('line')].some((line) => line.getAttribute('x1') === '40' && line.getAttribute('x2') === '260')).toBe(true)
  })

  it('leaves out the rows the card has no room for', () => {
    const many = { ...table, cards: [{ ...table.cards[0]!, columns: Array.from({ length: 12 }, (_, at) => ({ name: `column_${at}` })) }] }
    const drawn = texts(parse(diagramSvg(many, { measure })))
    expect(drawn).toContain('column_0')
    expect(drawn).not.toContain('column_11')
  })
})

describe('a code element', () => {
  const code = (over: Partial<Scene['cards'][number]> = {}): Scene => ({
    ...SCENE,
    cards: [
      { x: 40, y: 40, width: 220, height: 160, name: 'Order', kind: 'code', technology: 'Go struct', external: false, icons: [], description: 'ID string\nTotal **Money**\n---\nPlace() error', ...over },
    ],
    connectors: [],
  })
  const attrs = (el: Element | undefined, ...names: string[]) => names.map((name) => el?.getAttribute(name))

  it('is drawn as a class box: square corners, what it is in guillemets, a badge with its letter, its name', () => {
    const doc = parse(diagramSvg(code(), { measure }))
    expect(doc.querySelector('rect[width="219"]')?.getAttribute('rx')).toBe('4')
    expect(texts(doc)).toEqual(expect.arrayContaining(['«Go struct»', 'S', 'Order']))
    expect(doc.querySelectorAll('circle[fill-opacity]')).toHaveLength(1)
    const name = [...doc.querySelectorAll('text')].find((el) => el.textContent === 'Order')
    expect(name?.getAttribute('font-style')).toBeNull()
  })

  it('lists its members from the left in a fixed-width font, with a line under the name and one for every rule', () => {
    const doc = parse(diagramSvg(code(), { measure }))
    const members = [...doc.querySelectorAll('text')].filter((el) => ['ID string', 'Total Money', 'Place() error'].includes(el.textContent ?? ''))
    expect(members).toHaveLength(3)
    for (const member of members) {
      expect(attrs(member, 'text-anchor')).toEqual(['start'])
      expect(member.getAttribute('font-family')).toContain('monospace')
      expect(member.getAttribute('x')).toBe('52')
    }
    const lines = [...doc.querySelectorAll('line')]
    expect(lines.map((line) => attrs(line, 'x1', 'x2'))).toEqual([
      ['40', '260'],
      ['40', '260'],
    ])
    // Top to bottom: the line under the name, the fields, the rule, the method.
    const y = (el: Element, name: string) => Number(el.getAttribute(name))
    const order = [y(lines[0]!, 'y1'), y(members[0]!, 'y'), y(members[1]!, 'y'), y(lines[1]!, 'y1'), y(members[2]!, 'y')]
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(order.at(-1)).toBeLessThan(200)
  })

  it('writes the name of an interface slanted, and leaves out members the box has no room for', () => {
    const doc = parse(diagramSvg(code({ technology: 'Java interface', height: 120, description: Array.from({ length: 12 }, (_, i) => `m${i}()`).join('\n') }), { measure }))
    expect(texts(doc)).toEqual(expect.arrayContaining(['«Java interface»', 'I']))
    const name = [...doc.querySelectorAll('text')].find((el) => el.textContent === 'Order')
    expect(name?.getAttribute('font-style')).toBe('italic')
    const drawn = texts(doc).filter((line) => /^m\d+\(\)$|…$/.test(line ?? ''))
    expect(drawn.length).toBeLessThan(12)
    expect(drawn.at(-1)).toMatch(/…$/)
    for (const el of doc.querySelectorAll('text[font-size="10.5"]')) expect(Number(el.getAttribute('y'))).toBeLessThan(160)
  })
})

describe('a box with a shape', () => {
  const shaped = (shape: Scene['cards'][number]['shape'], over: Partial<Scene['cards'][number]> = {}): Scene => ({
    ...SCENE,
    cards: [{ x: 40, y: 40, width: 220, height: 120, name: 'Orders DB', kind: 'container', technology: 'PostgreSQL', external: false, icons: [], description: 'Holds the orders.', shape, ...over }],
    connectors: [],
  })

  it('is drawn as its outline where the card would be, with its lines, and no rectangle', () => {
    const doc = parse(diagramSvg(shaped('cylinder'), { measure }))
    expect(doc.querySelector('rect[width="219"]')).toBeNull()
    const group = doc.querySelector('g[transform="translate(40.5 40.5)"]')!
    const [outline, rim] = [...group.querySelectorAll('path')]
    // The cylinder of a 219 by 119 box: its cap is 12 high.
    expect(outline!.getAttribute('d')).toBe('M0 12A109.5 12 0 0 1 219 12V107A109.5 12 0 0 1 0 107Z')
    expect(outline!.getAttribute('fill')).toBe(COLOURS.card)
    expect(outline!.getAttribute('stroke')).toBe(COLOURS.border)
    expect(rim!.getAttribute('fill')).toBe('none')
    expect(texts(doc)).toEqual(expect.arrayContaining(['Orders DB', 'Holds the orders.', 'Container: PostgreSQL']))
  })

  it('keeps its text clear of the outline: lower under the cap of a cylinder, narrower in a diamond', () => {
    const y = (scene: Scene) => Number([...parse(diagramSvg(scene, { measure })).querySelectorAll('text')].find((el) => el.textContent === 'Orders DB')!.getAttribute('y'))
    expect(y(shaped('cylinder'))).toBeGreaterThan(y(shaped(undefined)))
    const long = 'A sentence that is too long for a narrow box and has to go on a second line'
    // The lines of the description: the only text of its size.
    const lines = (scene: Scene) => parse(diagramSvg(scene, { measure })).querySelectorAll('text[font-size="11"]').length
    expect(lines(shaped('diamond', { description: long, height: 200 }))).toBeGreaterThan(lines(shaped(undefined, { description: long, height: 200 })))
  })

  it('is grey when it is not ours, as a plain card is', () => {
    const doc = parse(diagramSvg(shaped('hexagon', { kind: 'softwareSystem', technology: undefined, external: true }), { measure }))
    expect(doc.querySelector('g[transform="translate(40.5 40.5)"] path')?.getAttribute('fill')).toBe(COLOURS.muted)
  })
})
