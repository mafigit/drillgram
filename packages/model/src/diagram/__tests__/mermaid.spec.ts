import { describe, it, expect } from 'vitest'
import { CONTRACT_DIAGRAMS, runDiagramFormatContract } from '../contract'
import { mermaidFormat, writableAsMermaid } from '../mermaid'
import { DiagramFormatError } from '../model'
import type { Diagram } from '../model'

runDiagramFormatContract(mermaidFormat)

const J2_MERMAID =
  'C4Context\n' +
  '  Person(customer, "Customer")\n' +
  '  System(shop, "Online Shop")\n' +
  '  Rel(customer, shop, "Places orders in")\n'

function errorOf(fn: () => unknown): DiagramFormatError {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(DiagramFormatError)
    return error as DiagramFormatError
  }
  throw new Error('expected a throw')
}

describe('mermaidFormat', () => {
  it('describes itself', () => {
    expect(mermaidFormat.id).toBe('mermaid')
    expect(mermaidFormat.name).toBe('Mermaid')
    expect(mermaidFormat.fileExtension).toBe('.mmd')
  })

  describe('serialize', () => {
    it('writes the J2 diagram in canonical form', () => {
      expect(mermaidFormat.serialize(CONTRACT_DIAGRAMS[0])).toBe(J2_MERMAID)
    })

    it('writes the title, external elements, empty middle arguments and technology', () => {
      const diagram: Diagram = {
        level: 'container',
        title: 'Shop containers',
        elements: [
          { id: 'admin', kind: 'person', name: 'Admin', description: 'Runs the shop', external: true },
          { id: 'pay', kind: 'softwareSystem', name: 'Payments', external: true },
          { id: 'api', kind: 'container', name: 'API', description: 'Serves the shop' },
          { id: 'db', kind: 'container', name: 'Database', technology: 'PostgreSQL' },
          { id: 'ext', kind: 'container', name: 'CDN', external: true },
        ],
        relationships: [
          { from: 'api', to: 'pay', technology: 'HTTPS' },
          { from: 'api', to: 'db', label: 'Reads from' },
        ],
      }
      expect(mermaidFormat.serialize(diagram)).toBe(
        'C4Container\n' +
          '  title Shop containers\n' +
          '  Person_Ext(admin, "Admin", "Runs the shop")\n' +
          '  System_Ext(pay, "Payments")\n' +
          '  Container(api, "API", "", "Serves the shop")\n' +
          '  Container(db, "Database", "PostgreSQL")\n' +
          '  Container_Ext(ext, "CDN")\n' +
          '  Rel(api, pay, "", "HTTPS")\n' +
          '  Rel(api, db, "Reads from")\n',
      )
    })

    it('writes component diagrams', () => {
      const diagram: Diagram = {
        level: 'component',
        elements: [
          { id: 'ctrl', kind: 'component', name: 'Controller', technology: 'Spring' },
          { id: 'mail', kind: 'component', name: 'Mailer', external: true },
        ],
        relationships: [{ from: 'ctrl', to: 'mail' }],
      }
      expect(mermaidFormat.serialize(diagram)).toBe(
        'C4Component\n' +
          '  Component(ctrl, "Controller", "Spring")\n' +
          '  Component_Ext(mail, "Mailer")\n' +
          '  Rel(ctrl, mail, "")\n',
      )
    })

    it('throws for the code level', () => {
      const error = errorOf(() =>
        mermaidFormat.serialize({ level: 'code', elements: [], relationships: [] }),
      )
      expect(error.message).toBe('Mermaid has no C4 code diagram')
    })

    it('throws for a double quote in a name', () => {
      errorOf(() =>
        mermaidFormat.serialize({
          level: 'context',
          elements: [{ id: 'shop', kind: 'softwareSystem', name: 'The "Shop"' }],
          relationships: [],
        }),
      )
    })

    it('throws for a newline in a description, label or title', () => {
      errorOf(() =>
        mermaidFormat.serialize({
          level: 'context',
          elements: [{ id: 'shop', kind: 'softwareSystem', name: 'Shop', description: 'a\nb' }],
          relationships: [],
        }),
      )
      errorOf(() =>
        mermaidFormat.serialize({
          level: 'context',
          elements: [{ id: 'shop', kind: 'softwareSystem', name: 'Shop' }],
          relationships: [{ from: 'shop', to: 'shop', label: 'a\nb' }],
        }),
      )
      errorOf(() =>
        mermaidFormat.serialize({ level: 'context', title: 'a\nb', elements: [], relationships: [] }),
      )
    })
  })

  describe('parse', () => {
    it('reads the J2 canonical string', () => {
      expect(mermaidFormat.parse(J2_MERMAID)).toEqual(CONTRACT_DIAGRAMS[0])
    })

    it('reads hand-written input with comments, blank lines and odd spacing', () => {
      const text = [
        '%% the shop',
        '',
        'C4Container',
        '%% people',
        '    title   Shop containers  ',
        '',
        '\tPerson_Ext( admin ,"Admin" , "Runs the shop" )',
        'System_Ext(pay, Payments)',
        '      Container(api, "API", "", "Serves the shop")',
        '  Container(db,Database,PostgreSQL)',
        '  Rel(api , db , "Reads from" )',
        '  Rel(api, pay, "", "HTTPS")',
        '',
      ].join('\n')
      const expected: Diagram = {
        level: 'container',
        title: 'Shop containers',
        elements: [
          { id: 'admin', kind: 'person', name: 'Admin', description: 'Runs the shop', external: true },
          { id: 'pay', kind: 'softwareSystem', name: 'Payments', external: true },
          { id: 'api', kind: 'container', name: 'API', description: 'Serves the shop' },
          { id: 'db', kind: 'container', name: 'Database', technology: 'PostgreSQL' },
        ],
        relationships: [
          { from: 'api', to: 'db', label: 'Reads from' },
          { from: 'api', to: 'pay', technology: 'HTTPS' },
        ],
      }
      expect(mermaidFormat.parse(text)).toEqual(expected)
    })

    it('accepts CRLF line endings', () => {
      expect(mermaidFormat.parse(J2_MERMAID.replace(/\n/g, '\r\n'))).toEqual(CONTRACT_DIAGRAMS[0])
    })

    it('throws on empty input', () => {
      errorOf(() => mermaidFormat.parse(''))
      errorOf(() => mermaidFormat.parse('\n%% only a comment\n'))
    })

    it('throws on a missing header with the line number', () => {
      const error = errorOf(() => mermaidFormat.parse('\n  Person(customer, "Customer")\n'))
      expect(error.line).toBe(2)
    })

    it.each(['C4Dynamic', 'C4Deployment', 'flowchart TD', 'C4Code'])(
      'throws on the unsupported header %j',
      (header) => {
        const error = errorOf(() => mermaidFormat.parse(`%% x\n${header}\n`))
        expect(error.line).toBe(2)
      },
    )

    it.each([
      'Boundary(b, "B") {',
      'Enterprise_Boundary(b, "B") {',
      '}',
      'Rel_U(customer, shop, "Uses")',
      'Rel_D(customer, shop, "Uses")',
      'Rel_L(customer, shop, "Uses")',
      'Rel_R(customer, shop, "Uses")',
      'BiRel(customer, shop, "Uses")',
      'SystemDb(db, "DB")',
      'SystemQueue(q, "Q")',
      'SystemDb_Ext(db, "DB")',
      'ContainerDb(db, "DB")',
      'ContainerQueue(q, "Q")',
      'ComponentDb(db, "DB")',
      'Person(admin, "Admin", $sprite="x")',
      'UpdateElementStyle(customer, $fontColor="red")',
      'UpdateRelStyle(customer, shop, $textColor="red")',
      'UpdateLayoutConfig($c4ShapeInRow="3")',
      'Deployment_Node(n, "Node")',
      'whatever',
    ])('throws on the unsupported statement %j with its line', (statement) => {
      const text =
        'C4Context\n' +
        '  Person(customer, "Customer")\n' +
        '  System(shop, "Online Shop")\n' +
        `  ${statement}\n`
      expect(errorOf(() => mermaidFormat.parse(text)).line).toBe(4)
    })

    it.each([
      'Person(customer)',
      'Person(customer, "Customer", "Buys", "extra")',
      'System(shop)',
      'System(shop, "Shop", "A", "B")',
      'Container(api)',
      'Container(api, "API", "Node", "Serves", "extra")',
      'Rel(customer)',
      'Rel(customer, shop)',
      'Rel(customer, shop, "a", "b", "c")',
    ])('throws on the wrong argument count in %j', (statement) => {
      const text = 'C4Container\n  Person(customer, "Customer")\n  System(shop, "Shop")\n' + `  ${statement}\n`
      expect(errorOf(() => mermaidFormat.parse(text)).line).toBe(4)
    })

    it('throws on a malformed statement', () => {
      expect(errorOf(() => mermaidFormat.parse('C4Context\n  Person(customer, "Customer"\n')).line).toBe(2)
      expect(errorOf(() => mermaidFormat.parse('C4Context\n  Person(customer, "Cust\n')).line).toBe(2)
    })

    it('throws on a second header', () => {
      expect(errorOf(() => mermaidFormat.parse('C4Context\nC4Container\n')).line).toBe(2)
    })

    it('throws on a relationship to an unknown id', () => {
      errorOf(() => mermaidFormat.parse('C4Context\n  Person(customer, "Customer")\n  Rel(customer, shop, "Uses")\n'))
    })

    it('throws on an empty name', () => {
      expect(errorOf(() => mermaidFormat.parse('C4Context\n  Person(customer, "")\n')).line).toBe(2)
    })
  })

  describe('boundary', () => {
    const FRAMED =
      'C4Container\n' +
      '  title Container diagram for Online Shop\n' +
      '  Person(customer, "Customer")\n' +
      '  System_Boundary(shop, "Online Shop") {\n' +
      '    Container(web, "Web App", "Vue")\n' +
      '    Container(api, "API", "Go", "Takes orders")\n' +
      '  }\n' +
      '  System_Ext(mail, "Mail Service")\n' +
      '  Rel(customer, web, "Shops in")\n' +
      '  Rel(web, api, "Calls", "HTTPS")\n' +
      '  Rel(api, mail, "Sends e-mail with")\n'

    it('writes the members inside the boundary, where the first of them stands', () => {
      expect(mermaidFormat.serialize(CONTRACT_DIAGRAMS[3]!)).toBe(FRAMED)
    })

    it('reads them back', () => {
      expect(mermaidFormat.parse(FRAMED)).toEqual(CONTRACT_DIAGRAMS[3])
    })

    it('writes a container as a Container_Boundary', () => {
      const diagram: Diagram = {
        level: 'component',
        elements: [{ id: 'orders', kind: 'component', name: 'Orders' }],
        relationships: [],
        boundary: { id: 'api', kind: 'container', name: 'API', members: ['orders'] },
      }
      const text = mermaidFormat.serialize(diagram)
      expect(text).toContain('  Container_Boundary(api, "API") {\n    Component(orders, "Orders")\n  }\n')
      expect(mermaidFormat.parse(text)).toEqual(diagram)
    })

    it('refuses a relationship to the boundary, which Mermaid cannot draw', () => {
      const diagram = structuredClone(CONTRACT_DIAGRAMS[3]!)
      diagram.relationships.push({ from: 'customer', to: 'shop', label: 'Buys from' })
      expect(() => mermaidFormat.serialize(diagram)).toThrow(DiagramFormatError)
    })

    it('throws on a boundary that is not closed, a second one or a relationship inside', () => {
      expect(errorOf(() => mermaidFormat.parse('C4Container\n  System_Boundary(b, "B") {\n')).line).toBe(3)
      expect(
        errorOf(() => mermaidFormat.parse('C4Container\n  System_Boundary(a, "A") {\n  }\n  System_Boundary(b, "B") {\n  }\n')).line,
      ).toBe(4)
      expect(
        errorOf(() =>
          mermaidFormat.parse('C4Container\n  Container(x, "X")\n  System_Boundary(b, "B") {\n  Rel(x, x, "a")\n  }\n'),
        ).line,
      ).toBe(4)
      expect(errorOf(() => mermaidFormat.parse('C4Container\n  }\n')).line).toBe(2)
    })
  })

  describe('writableAsMermaid', () => {
    it('writes a plain box as a software system, which Mermaid knows', () => {
      const diagram: Diagram = { level: 'context', elements: [{ id: 'a', kind: 'box', name: 'Idea' }], relationships: [] }
      expect(() => mermaidFormat.serialize(diagram)).toThrow(DiagramFormatError)
      expect(mermaidFormat.serialize(writableAsMermaid(diagram))).toBe('C4Context\n  System(a, "Idea")\n')
    })

    it('makes any diagram writable: quotes, line breaks and relationships to the boundary', () => {
      const diagram = structuredClone(CONTRACT_DIAGRAMS[3]!)
      diagram.title = '  The "best" shop  '
      diagram.elements[1]!.name = 'Web "App"'
      diagram.elements[2]!.description = 'Takes\norders'
      diagram.relationships.push({ from: 'customer', to: 'shop', label: 'Buys from' })
      const safe = writableAsMermaid(diagram)
      expect(safe.title).toBe("The 'best' shop")
      expect(safe.elements[1]!.name).toBe("Web 'App'")
      expect(safe.elements[2]!.description).toBe('Takes orders')
      expect(safe.relationships).toHaveLength(3)
      expect(mermaidFormat.parse(mermaidFormat.serialize(safe))).toEqual(safe)
    })
  })
})
