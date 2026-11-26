import { describe, it, expect } from 'vitest'
import type { C4Level } from '../index'
import type { DiagramFormat } from './format'
import { DiagramFormatError } from './model'
import type { Diagram } from './model'

/** One diagram per level; the first is the J2 context diagram. */
export const CONTRACT_DIAGRAMS: Diagram[] = [
  {
    level: 'context',
    elements: [
      { id: 'customer', kind: 'person', name: 'Customer' },
      { id: 'shop', kind: 'softwareSystem', name: 'Online Shop' },
    ],
    relationships: [{ from: 'customer', to: 'shop', label: 'Places orders in' }],
  },
  {
    level: 'container',
    title: 'Online Shop containers',
    elements: [
      { id: 'customer', kind: 'person', name: 'Customer', description: 'Buys products' },
      {
        id: 'api',
        kind: 'container',
        name: 'API',
        technology: 'Node.js',
        description: 'Serves the shop',
      },
      { id: 'db', kind: 'container', name: 'Database', technology: 'PostgreSQL' },
      {
        id: 'payments',
        kind: 'softwareSystem',
        name: 'Payment Provider',
        description: 'Takes payments',
        external: true,
      },
    ],
    relationships: [
      { from: 'customer', to: 'api', label: 'Uses', technology: 'HTTPS' },
      { from: 'api', to: 'db', label: 'Reads from and writes to', technology: 'SQL' },
      { from: 'api', to: 'payments', technology: 'REST' },
    ],
  },
  {
    level: 'component',
    elements: [
      {
        id: 'orders',
        kind: 'component',
        name: 'Order Controller',
        technology: 'Express',
        description: 'Accepts orders',
      },
      { id: 'mailer', kind: 'component', name: 'Mailer', description: 'Sends confirmations' },
      { id: 'smtp', kind: 'component', name: 'SMTP Relay', external: true },
    ],
    relationships: [
      { from: 'orders', to: 'mailer', label: 'Sends confirmation with' },
      { from: 'mailer', to: 'smtp' },
    ],
  },
]

/** A Container diagram with its system as a frame around the containers. */
CONTRACT_DIAGRAMS.push({
  level: 'container',
  title: 'Container diagram for Online Shop',
  elements: [
    { id: 'customer', kind: 'person', name: 'Customer' },
    { id: 'web', kind: 'container', name: 'Web App', technology: 'Vue' },
    { id: 'api', kind: 'container', name: 'API', technology: 'Go', description: 'Takes orders' },
    { id: 'mail', kind: 'softwareSystem', name: 'Mail Service', external: true },
  ],
  relationships: [
    { from: 'customer', to: 'web', label: 'Shops in' },
    { from: 'web', to: 'api', label: 'Calls', technology: 'HTTPS' },
    { from: 'api', to: 'mail', label: 'Sends e-mail with' },
  ],
  boundary: { id: 'shop', kind: 'softwareSystem', name: 'Online Shop', members: ['web', 'api'] },
})

export function runDiagramFormatContract(
  format: DiagramFormat,
  capabilities: { levels?: C4Level[] } = {},
): void {
  const { levels = CONTRACT_DIAGRAMS.map((diagram) => diagram.level) } = capabilities
  const diagrams = CONTRACT_DIAGRAMS.filter((diagram) => levels.includes(diagram.level))

  describe(`DiagramFormat contract: ${format.id}`, () => {
    describe.each(diagrams.map((diagram) => [diagram.level, diagram] as const))(
      '%s diagram',
      (_level, diagram) => {
        it('parse(serialize(d)) equals d', () => {
          expect(format.parse(format.serialize(structuredClone(diagram)))).toEqual(diagram)
        })

        it('serialize is stable after a round trip', () => {
          const text = format.serialize(structuredClone(diagram))
          expect(format.serialize(format.parse(text))).toBe(text)
        })
      },
    )

    it('serialize throws DiagramFormatError on a dangling relationship', () => {
      const dangling: Diagram = {
        ...structuredClone(CONTRACT_DIAGRAMS[0]),
        relationships: [{ from: 'customer', to: 'ghost', label: 'Uses' }],
      }
      expect(() => format.serialize(dangling)).toThrow(DiagramFormatError)
    })

    it("parse('') throws DiagramFormatError", () => {
      expect(() => format.parse('')).toThrow(DiagramFormatError)
    })
  })
}
