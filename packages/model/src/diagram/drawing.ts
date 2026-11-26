import type { Point } from './workspace'

/**
 * What a page of a vector PDF draws, without the PDF: its paths and its texts, in points from
 * the page's top-left corner, y down. Made from a PDF by the web app (`lib/pdfDrawing.ts`, with
 * pdf.js); read here, where no PDF library is needed.
 */
export interface Drawing {
  width: number
  height: number
  paths: DrawnPath[]
  texts: DrawnText[]
}

export interface DrawnPath {
  /** Its pieces: each a list of points; a curve is given by its end points and control points. */
  pieces: { points: Point[]; closed: boolean; curved: boolean }[]
  /** `#rrggbb`, where the path is filled. */
  fill?: string
  /** `#rrggbb`, where the path is stroked. */
  stroke?: string
  lineWidth?: number
}

export interface DrawnText {
  text: string
  /** The top-left corner of the run of text and its size. */
  x: number
  y: number
  width: number
  height: number
}
