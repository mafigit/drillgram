// @vitest-environment node
import { describe, expect, it } from 'vitest'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { miroPdfDiagram, validateDiagram } from '@drillgram/model'
import { drawingOfPage } from '../pdfDrawing'
import type { PdfOps, PdfPage } from '../pdfDrawing'
import { madeUpBoardPdf } from '../../../e2e/support/madeUpBoardPdf'

async function drawing() {
  const document = await pdfjs.getDocument({ data: madeUpBoardPdf(), verbosity: 0 }).promise
  return drawingOfPage((await document.getPage(1)) as unknown as PdfPage, pdfjs.OPS as unknown as PdfOps)
}

describe('drawingOfPage', () => {
  it('gives the paths and texts of a page from its top-left corner, y down', async () => {
    const page = await drawing()
    expect(page).toMatchObject({ width: 600, height: 400 })
    // The frame: white, 220 wide, its top 400 - 340 = 60 from the top of the page.
    const frame = page.paths.find((path) => path.fill === '#ffffff')!
    const xs = frame.pieces[0]!.points.map((p) => p.x)
    const ys = frame.pieces[0]!.points.map((p) => p.y)
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([300, 520, 60, 340])
    const line = page.paths.find((path) => path.stroke === '#333333' && !path.pieces[0]!.closed)!
    expect(line.pieces[0]!.points).toEqual([{ x: 380, y: 110 }, { x: 434, y: 110 }])
    const cart = page.texts.find((text) => text.text === 'Cart')!
    expect(cart.x).toBeCloseTo(340)
    expect(cart.y).toBeCloseTo(400 - 287 - 8)
  })

  it('gives a drawing in which the board is found', async () => {
    const diagram = miroPdfDiagram(await drawing())
    validateDiagram(diagram)
    const named = (name: string) => diagram.elements.find((element) => element.name === name)
    expect(named('Frame')).toBeDefined()
    expect(named('Cart')?.inside).toBe(named('Frame')!.id)
    expect(named('Pay')?.inside).toBe(named('Frame')!.id)
    expect(named('Orders DB')).toMatchObject({ shape: 'circle' })
    expect(named('Decide')).toMatchObject({ shape: 'diamond' })
    expect(named('Notes for later')).toMatchObject({ shape: 'text' })
    expect(diagram.relationships).toEqual(
      expect.arrayContaining([
        { from: named('Cart')!.id, to: named('Pay')!.id, label: 'Goes to' },
        { from: named('Orders DB')!.id, to: named('Cart')!.id, colour: 'red' },
      ]),
    )
    expect(diagram.relationships).toHaveLength(2)
  })
})
