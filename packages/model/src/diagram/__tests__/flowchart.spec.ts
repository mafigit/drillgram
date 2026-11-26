import { describe, expect, it } from 'vitest'
import { flowchartFormat, isFlowchart } from '../flowchart'
import { DiagramFormatError, validateDiagram } from '../model'
import { ROOT_VIEW_ID, emptyWorkspace, findViewInside, importDiagram, liftedConnections, validateWorkspace } from '../workspace'

// A flowchart as people write them: stacks of services as subgraphs, some inside others, columns
// that only lay things out, styles, and arrows of several kinds.
const STACKS = `flowchart RL
    classDef app fill:#e0f2fe,stroke:#0284c7
    classDef store fill:#dbeafe,stroke-width:2px
    %% the platform
    subgraph shop [Shop platform]
        subgraph grid[" "]
            direction TB
            subgraph left[" "]
                direction TB
                px[proxy]:::app
                bk[broker]:::app
            end
            subgraph right[" "]
                dash[dashboard]
            end
        end
        ord[orders]:::app
        pay[payments]:::app
        orddb[(orders DB)]:::store
        subgraph planned [Search (planned)]
            idx[indexer]:::app
            sdb[(search DB)]:::store
        end
    end
    subgraph mailing [Mail service]
        mail[mailer]:::app
    end
    ord --> pay
    ord --> orddb
    idx --> sdb
    idx --> ord
    mail --> ord
    ord --> pay
    pay -.-> mail
    left ~~~ right
    orddb ~~~ grid
  linkStyle 0 stroke:#22c55e,stroke-dasharray:8 8
  style shop fill:#e5e5e5
  style grid fill:none
`

describe('flowchartFormat.parse', () => {
  const diagram = flowchartFormat.parse(STACKS)
  const element = (id: string) => diagram.elements.find((e) => e.id === id)

  it('reads a valid diagram of boxes', () => {
    validateDiagram(diagram)
    expect(new Set(diagram.elements.map((e) => e.kind))).toEqual(new Set(['box']))
  })

  it('makes a box of every node, named by its label, whatever its shape', () => {
    expect(element('px')).toEqual({ id: 'px', kind: 'box', name: 'proxy', inside: 'shop' })
    expect(element('orddb')).toEqual({ id: 'orddb', kind: 'box', name: 'orders DB', shape: 'cylinder', inside: 'shop' })
    expect(element('mail')).toEqual({ id: 'mail', kind: 'box', name: 'mailer', inside: 'mailing' })
  })

  it('makes a box of every subgraph with a name, and puts what is in it inside', () => {
    expect(element('shop')).toEqual({ id: 'shop', kind: 'box', name: 'Shop platform' })
    expect(element('planned')).toEqual({ id: 'planned', kind: 'box', name: 'Search (planned)', inside: 'shop' })
    expect(element('idx')?.inside).toBe('planned')
    expect(diagram.elements.filter((e) => e.inside === undefined).map((e) => e.id)).toEqual(['shop', 'mailing'])
  })

  it('sees through a subgraph without a name: it only lays out, its nodes stand in the one around it', () => {
    for (const id of ['grid', 'left', 'right']) expect(element(id)).toBeUndefined()
    expect(['px', 'bk', 'dash'].map((id) => element(id)?.inside)).toEqual(['shop', 'shop', 'shop'])
  })

  it('reads the arrows as connections, each once, and leaves out the links that only lay out', () => {
    expect(diagram.relationships).toEqual([
      // Drawn twice, once in green: one connection, in green.
      { from: 'ord', to: 'pay', colour: 'green' },
      { from: 'ord', to: 'orddb' },
      { from: 'idx', to: 'sdb' },
      { from: 'idx', to: 'ord' },
      { from: 'mail', to: 'ord' },
      { from: 'pay', to: 'mail' },
    ])
  })

  it('reads the text on an arrow, written either way, chains, and several nodes at once', () => {
    const read = flowchartFormat.parse('graph TD\n  a[Shop] -->|orders| b(Billing)\n  b -- pays --> c{Bank}\n  c ==> d --> e\n  f & g --> a\n  a -. "in the night" .-> e')
    expect(read.elements.map((e) => [e.id, e.name])).toEqual([['a', 'Shop'], ['b', 'Billing'], ['c', 'Bank'], ['d', 'd'], ['e', 'e'], ['f', 'f'], ['g', 'g']])
    expect(read.elements.find((e) => e.id === 'c')?.shape).toBe('diamond')
    expect(read.relationships).toEqual([
      { from: 'a', to: 'b', label: 'orders' },
      { from: 'b', to: 'c', label: 'pays' },
      { from: 'c', to: 'd' },
      { from: 'd', to: 'e' },
      { from: 'f', to: 'a' },
      { from: 'g', to: 'a' },
      { from: 'a', to: 'e', label: 'in the night' },
    ])
  })

  it('reads labels in quotes, with brackets and line breaks in them, and every usual shape', () => {
    const read = flowchartFormat.parse('flowchart LR\n  a["Shop (new)<br/>v2"]\n  b([Start])\n  c[[Sub]]\n  d((Dot))\n  e{{Hex}}\n  f[/In/]\n  g>Flag]\n  h(((Twice)))')
    expect(read.elements.map((e) => e.name)).toEqual(['Shop (new) v2', 'Start', 'Sub', 'Dot', 'Hex', 'In', 'Flag', 'Twice'])
    // The shape it draws the node in is kept where there is one of ours.
    expect(read.elements.map((e) => e.shape)).toEqual([undefined, 'stadium', 'subroutine', 'circle', 'hexagon', 'parallelogram', 'odd', 'doubleCircle'])
  })

  it('tells the slanted boxes apart: leaning right or left, wider at the bottom or at the top', () => {
    const read = flowchartFormat.parse('flowchart LR\n  a[/In/]\n  b[\\Out\\]\n  c[/Priority\\]\n  d[\\Manual/]')
    expect(read.elements.map((e) => [e.name, e.shape])).toEqual([
      ['In', 'parallelogram'],
      ['Out', 'leanLeft'],
      ['Priority', 'trapezoid'],
      ['Manual', 'invTrapezoid'],
    ])
  })

  it('reads a node written with its shape by name, by any of the names Mermaid has for it', () => {
    const read = flowchartFormat.parse(
      [
        'flowchart TD',
        '  a@{ shape: cyl, label: "Orders DB" }',
        '  b@{ shape: database }',
        '  c@{ label: "Plain, with a comma", shape: rect }',
        '  d@{ shape: manual-file, label: "File Handling"}',
        '  e@{ shape: docs, label: "Reports" } --> f@{ shape: bow-rect, label: "Archive" }',
        '  g@{ shape: lin-cyl } & h@{ shape: stop } --> a',
        '  i@{ shape: person, label: "Customer" }',
        '  j@{ shape: no-such-shape, label: "Unknown" }',
        '  k@{ shape: hourglass, label: "Collate" }',
        '  l@{ shape: bolt }',
        '  m@{ shape: f-circ }',
        '  n@{ shape: cross-circ }',
      ].join('\n'),
    )
    validateDiagram(read)
    expect(read.elements.map((e) => [e.id, e.kind, e.name, e.shape])).toEqual([
      ['a', 'box', 'Orders DB', 'cylinder'],
      ['b', 'box', 'b', 'cylinder'],
      ['c', 'box', 'Plain, with a comma', undefined],
      ['d', 'box', 'File Handling', 'flippedTriangle'],
      ['e', 'box', 'Reports', 'documents'],
      ['f', 'box', 'Archive', 'storedData'],
      ['g', 'box', 'g', 'disk'],
      ['h', 'box', 'h', 'doubleCircle'],
      // A person is a person here, not a box with a shape.
      ['i', 'person', 'Customer', undefined],
      // A shape nobody knows: a plain box.
      ['j', 'box', 'Unknown', undefined],
      ['k', 'box', 'Collate', 'hourglass'],
      ['l', 'box', 'l', 'bolt'],
      ['m', 'box', 'm', 'filledCircle'],
      ['n', 'box', 'n', 'circleCross'],
    ])
    expect(read.relationships).toEqual([
      { from: 'e', to: 'f' },
      { from: 'g', to: 'a' },
      { from: 'h', to: 'a' },
    ])
  })

  it('knows every shape name of Mermaid: none stops the import', () => {
    const names = 'bang browser bucket notch-rect card cloud hourglass collate bolt com-link lightning-bolt brace brace-l comment brace-r braces console lean-r in-out lean-right lean-l lean-left out-in datastore data-store cyl cylinder database db diam decision diamond question delay half-rounded-rectangle h-cyl das horizontal-cylinder lin-cyl disk lined-cylinder curv-trap curved-trapezoid display div-rect div-proc divided-process divided-rectangle doc document rounded event tri extract triangle folder directory fork join win-pane internal-storage window-pane f-circ filled-circle junction lin-doc lined-document lin-rect lin-proc lined-process lined-rectangle shaded-process notch-pent loop-limit notched-pentagon flip-tri flipped-triangle manual-file sl-rect manual-input sloped-rectangle trap-t inv-trapezoid manual trapezoid-top docs documents st-doc stacked-document st-rect processes procs stacked-rectangle odd flag paper-tape person hex hexagon prepare trap-b priority trapezoid trapezoid-bottom rect proc process rectangle circle circ sm-circ small-circle start dbl-circ double-circle fr-circ framed-circle stop bow-rect bow-tie-rectangle stored-data fr-rect framed-rectangle subproc subprocess subroutine cross-circ crossed-circle summary tag-doc tagged-document tag-rect tag-proc tagged-process tagged-rectangle stadium pill terminal text'.split(' ')
    const read = flowchartFormat.parse(['flowchart TD', ...names.map((name, at) => `  n${at}@{ shape: ${name} }`)].join('\n'))
    validateDiagram(read)
    expect(read.elements).toHaveLength(names.length)
    // Most have an outline of ours; the rest are plain boxes and the person.
    expect(read.elements.filter((e) => e.shape !== undefined).length).toBeGreaterThan(names.length * 0.8)
    const shapeOf = (name: string) => read.elements[names.indexOf(name)]!.shape
    expect([shapeOf('flag'), shapeOf('folder'), shapeOf('datastore'), shapeOf('braces'), shapeOf('text')]).toEqual(['paperTape', 'folder', 'dataStore', 'braces', 'text'])
  })

  it('gives an arrow the colour its linkStyle draws it in: the nearest of ours, none for a grey', () => {
    const read = flowchartFormat.parse(
      [
        'flowchart LR',
        '  a --> b',
        '  a -->|mq| c',
        '  a ~~~ d',
        '  b & c --> d',
        '  d -.-> a',
        '  linkStyle 0 stroke:#22c55e,stroke-dasharray:8 8',
        '  linkStyle 1 stroke:#f97316',
        '  linkStyle 3,4 stroke:#1d4ed8,stroke-width:3px',
        '  linkStyle 5 stroke:#888888',
        '  linkStyle 99 stroke:#ff0000',
      ].join('\n'),
    )
    validateDiagram(read)
    expect(read.relationships).toEqual([
      { from: 'a', to: 'b', colour: 'green' },
      { from: 'a', to: 'c', label: 'mq', colour: 'orange' },
      // The link that is not drawn counts as one all the same: 3 and 4 are these two.
      { from: 'b', to: 'd', colour: 'blue' },
      { from: 'c', to: 'd', colour: 'blue' },
      { from: 'd', to: 'a' },
    ])
  })

  it('colours every arrow that has none of its own with the default, by name too', () => {
    const read = flowchartFormat.parse('flowchart LR\n  a --> b\n  b --> c\n  linkStyle default stroke:red\n  linkStyle 1 stroke:#00f')
    expect(read.relationships.map((r) => r.colour)).toEqual(['red', 'blue'])
  })

  it('keeps two arrows between the same boxes when they differ in colour', () => {
    const read = flowchartFormat.parse('flowchart LR\n  a --> b\n  a --> b\n  a --> b\n  linkStyle 0 stroke:#22c55e\n  linkStyle 1 stroke:#f97316\n  linkStyle 2 stroke:#f97316')
    expect(read.relationships).toEqual([
      { from: 'a', to: 'b', colour: 'green' },
      { from: 'a', to: 'b', colour: 'orange' },
    ])
  })

  it('reads an icon or a picture as a plain box, and what is said about an arrow as nothing', () => {
    const read = flowchartFormat.parse(
      'flowchart LR\n  a@{ icon: "fa:user", form: "square", label: "User", pos: "t", h: 60 }\n  a e1@--> b\n  e1@{ animate: true }\n  b e2@-->|sends| c\n  e2@{ curve: linear }',
    )
    expect(read.elements).toEqual([
      { id: 'a', kind: 'box', name: 'User' },
      { id: 'b', kind: 'box', name: 'b' },
      { id: 'c', kind: 'box', name: 'c' },
    ])
    expect(read.relationships).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c', label: 'sends' },
    ])
  })

  it('gives a node whose id is no id of ours one that is, and keeps its connections', () => {
    const read = flowchartFormat.parse('flowchart LR\n  1st[First] --> my-node[Second]\n  my-node --> 1st')
    validateDiagram(read)
    expect(read.elements.map((e) => e.name)).toEqual(['First', 'Second'])
    const [first, second] = read.elements.map((e) => e.id)
    expect(read.relationships).toEqual([{ from: first, to: second }, { from: second, to: first }])
  })

  it('reads an arrow to a subgraph as a connection to its box, and none to one it sees through', () => {
    const read = flowchartFormat.parse('flowchart LR\n  subgraph one [One]\n    a\n  end\n  subgraph two[" "]\n    b\n  end\n  x --> one\n  x --> two')
    expect(read.relationships).toEqual([{ from: 'x', to: 'one' }])
    expect(read.elements.find((e) => e.id === 'b')).toEqual({ id: 'b', kind: 'box', name: 'b' })
  })

  it('says where a text is no flowchart, or a subgraph is not closed', () => {
    expect(() => flowchartFormat.parse('C4Context\n  Person(a, "A")')).toThrow(DiagramFormatError)
    expect(() => flowchartFormat.parse('flowchart LR\n  subgraph one [One]\n    a --> b')).toThrow('A subgraph is not closed')
    try {
      flowchartFormat.parse('flowchart LR\n  a --> b\n  end')
      expect.unreachable()
    } catch (error) {
      expect((error as DiagramFormatError).line).toBe(3)
    }
  })

  it('knows a flowchart by its first word', () => {
    expect(isFlowchart(STACKS)).toBe(true)
    expect(isFlowchart('\n%% note\n```mermaid\ngraph TD;\n a-->b\n```')).toBe(true)
    expect(isFlowchart('C4Context\n')).toBe(false)
    expect(isFlowchart('"graph": "Graph database" {\n}')).toBe(false)
  })
})

describe('importing a flowchart', () => {
  const ws = importDiagram(emptyWorkspace(), ROOT_VIEW_ID, flowchartFormat.parse(STACKS))

  it('puts the outermost boxes on the diagram and every other box inside its own', () => {
    validateWorkspace(ws)
    const root = ws.views.find((v) => v.id === ROOT_VIEW_ID)!
    expect(Object.keys(root.positions)).toEqual(['Shopplatform', 'Mailservice'])
    const parentOf = (name: string) => ws.model.objects.find((o) => o.name === name)?.parent
    expect(parentOf('proxy')).toBe('Shopplatform')
    expect(parentOf('Search (planned)')).toBe('Shopplatform')
    expect(parentOf('indexer')).toBe('Searchplanned')
    expect(parentOf('mailer')).toBe('Mailservice')
  })

  it('gives every box with something inside a diagram of its own, with those cards on it, each in its place', () => {
    const inside = findViewInside(ws, 'Shopplatform')!
    const names = Object.keys(inside.positions).map((id) => ws.model.objects.find((o) => o.id === id)!.name)
    expect(names).toEqual(['proxy', 'broker', 'dashboard', 'orders', 'payments', 'orders DB', 'Search (planned)'])
    const places = Object.values(inside.positions).map((p) => `${p.x},${p.y}`)
    expect(new Set(places).size).toBe(places.length)
    expect(Object.keys(findViewInside(ws, 'Searchplanned')!.positions)).toHaveLength(2)
    // What is connected on that level is drawn there.
    const drawn = ws.model.connections.filter((c) => inside.connections.includes(c.id)).map((c) => `${c.from} ${c.to}`)
    expect(drawn).toEqual(['orders payments', 'orders ordersDB'])
  })

  it('shows on the diagram above that two boxes are connected by what is inside them', () => {
    expect(liftedConnections(ws, ROOT_VIEW_ID).map((l) => `${l.from} ${l.to}`)).toEqual(['Mailservice Shopplatform', 'Shopplatform Mailservice'])
  })
})
