import type { Drawing, DrawnPath, DrawnText, Point } from '@drillgram/model'

// A page of a vector PDF as a `Drawing`: its paths, each with the colours it is painted in, and
// its texts, in points from the top-left corner. Read from pdf.js's list of drawing operations,
// following the transforms as a renderer does. Only what is needed to find boxes, lines and
// their words: no clips, no images, no patterns.

type Matrix = [number, number, number, number, number, number]

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]
const apply = (m: Matrix, x: number, y: number): Point => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] })

/** The parts of pdf.js this needs: a page and the numbers of its operations. */
export interface PdfPage {
  getViewport(options: { scale: number }): { width: number; height: number; transform: number[] }
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>
  getTextContent(): Promise<{ items: unknown[] }>
}
export type PdfOps = Record<string, number>

/** Points along a Bézier curve of any degree (de Casteljau), the first one left out. */
function along(control: Point[], steps = 8): Point[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = (i + 1) / steps
    let level = control
    while (level.length > 1) level = level.slice(1).map((p, j) => ({ x: level[j]!.x + (p.x - level[j]!.x) * t, y: level[j]!.y + (p.y - level[j]!.y) * t }))
    return level[0]!
  })
}

/** pdf.js's codes for the pieces of a path (`DrawOPS`). */
const MOVE = 0
const LINE = 1
const CURVE = 2
const QUADRATIC = 3
const CLOSE = 4

export async function drawingOfPage(page: PdfPage, OPS: PdfOps): Promise<Drawing> {
  const viewport = page.getViewport({ scale: 1 })
  const base = viewport.transform as Matrix
  const { fnArray, argsArray } = await page.getOperatorList()
  const paths: DrawnPath[] = []
  let state = { ctm: base, fill: '#000000', stroke: '#000000', lineWidth: 1 }
  const saved: (typeof state)[] = []
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]
    const args = argsArray[i] ?? []
    if (fn === OPS.save || fn === OPS.paintFormXObjectBegin) {
      saved.push(state)
      state = { ...state }
      const matrix = fn === OPS.paintFormXObjectBegin ? (args[0] as Matrix | null) : null
      if (matrix) state.ctm = multiply(state.ctm, Array.from(matrix) as Matrix)
    } else if (fn === OPS.restore || fn === OPS.paintFormXObjectEnd) {
      state = saved.pop() ?? state
    } else if (fn === OPS.transform) {
      state.ctm = multiply(state.ctm, args.map(Number) as Matrix)
    } else if (fn === OPS.setFillRGBColor && typeof args[0] === 'string') {
      state.fill = args[0]
    } else if (fn === OPS.setStrokeRGBColor && typeof args[0] === 'string') {
      state.stroke = args[0]
    } else if (fn === OPS.setLineWidth) {
      state.lineWidth = Number(args[0])
    } else if (fn === OPS.constructPath) {
      const paint = args[0] as number
      const data = (args[1] as ArrayLike<number>[] | undefined)?.[0]
      if (!data || paint === OPS.endPath) continue
      const fills = [OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(paint)
      const strokes = [OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(paint)
      const pieces: DrawnPath['pieces'] = []
      let piece: DrawnPath['pieces'][number] | undefined
      const at = (x: number, y: number) => apply(state.ctm, x, y)
      for (let k = 0; k < data.length; ) {
        const code = data[k++]
        if (code === MOVE) {
          piece = { points: [at(data[k]!, data[k + 1]!)], closed: false, curved: false }
          pieces.push(piece)
          k += 2
        } else if (code === LINE) {
          piece?.points.push(at(data[k]!, data[k + 1]!))
          k += 2
        } else if (code === CURVE || code === QUADRATIC) {
          // Points along the curve, not its handles: the outline goes through them.
          const count = code === CURVE ? 6 : 4
          if (piece) {
            const p0 = piece.points.at(-1)!
            const handles = Array.from({ length: count / 2 }, (_, i) => at(data[k + 2 * i]!, data[k + 2 * i + 1]!))
            piece.points.push(...along([p0, ...handles]))
            piece.curved = true
          }
          k += count
        } else if (code === CLOSE) {
          if (piece) piece.closed = true
        } else break
      }
      // The scale of the transform, for the width of the line on the page.
      const scale = Math.hypot(state.ctm[0], state.ctm[1])
      if (pieces.length > 0) {
        paths.push({
          pieces,
          ...(fills && { fill: state.fill }),
          ...(strokes && { stroke: state.stroke, lineWidth: state.lineWidth * scale }),
        })
      }
    }
  }
  const texts: DrawnText[] = []
  for (const item of (await page.getTextContent()).items) {
    const { str, transform, width, height } = item as { str?: unknown; transform?: number[]; width?: number; height?: number }
    if (typeof str !== 'string' || str.trim() === '' || !transform) continue
    const m = multiply(base, transform as Matrix)
    const size = Math.hypot(m[2], m[3]) || Math.abs(height ?? 0)
    // A run of text stands on its baseline: its top is one size above.
    const origin = apply(base, transform[4]!, transform[5]!)
    texts.push({ text: str, x: origin.x, y: origin.y - size, width: (width ?? 0) * Math.abs(base[0] || 1), height: size })
  }
  return { width: viewport.width, height: viewport.height, paths, texts }
}

/** Every page of a PDF file as a drawing. pdf.js comes only when a PDF is read. */
export async function readPdfDrawings(data: ArrayBuffer): Promise<Drawing[]> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const loading = pdfjs.getDocument({ data: new Uint8Array(data), verbosity: 0 })
  const document = await loading.promise
  try {
    const drawings: Drawing[] = []
    for (let n = 1; n <= document.numPages; n++) {
      drawings.push(await drawingOfPage((await document.getPage(n)) as unknown as PdfPage, pdfjs.OPS as unknown as PdfOps))
    }
    return drawings
  } finally {
    await loading.destroy()
  }
}
