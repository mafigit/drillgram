import geistLatin from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'
import { d2Format, mermaidFormat, writableAsMermaid } from '@drillgram/model'
import type { Diagram } from '@drillgram/model'
import { iconUrl } from '../composables/useTechIcons'
import { diagramSvg } from './svg'
import type { Scene } from './svg'

export type ExportFormat = 'svg' | 'png' | 'mermaid' | 'd2'

/** The file extension of each format. */
const EXTENSION: Record<ExportFormat, string> = { svg: 'svg', png: 'png', mermaid: 'mmd', d2: 'd2' }

/** A file name from a diagram's title: "Online Shop" gives "online-shop". */
export function fileName(title: string, format: ExportFormat): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'diagram'}.${EXTENSION[format]}`
}

export function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000))
  return btoa(binary)
}

async function fetchAsDataUrl(url: string, type: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return `data:${type};base64,${toBase64(await response.arrayBuffer())}`
}

/** The icons of the cards as `data:` URLs. One that does not load is left out of the file. */
async function iconPictures(scene: Scene): Promise<Map<string, string>> {
  const names = [...new Set(scene.cards.flatMap((card) => card.icons))]
  const pictures = await Promise.all(
    names.map((name) =>
      fetchAsDataUrl(iconUrl(name), 'image/svg+xml').catch((error: unknown) => {
        console.warn(`The icon ${name} is left out of the export:`, error)
        return undefined
      }),
    ),
  )
  return new Map(names.flatMap((name, i) => (pictures[i] ? [[name, pictures[i]] as const] : [])))
}

/** Measures text in the fonts of the canvas, once they are loaded. */
async function measurer(): Promise<(text: string, font: string) => number> {
  await Promise.all(['400', '500', '600'].map((weight) => document.fonts.load(`${weight} 12px "Geist Variable"`)))
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return (text, font) => text.length * (Number(/(\d+)px/.exec(font)?.[1] ?? 12) * 0.6)
  return (text, font) => {
    context.font = font
    return context.measureText(text).width
  }
}

/** The open diagram as an SVG document that stands on its own. */
export async function svgOf(scene: Scene): Promise<string> {
  const [measure, font, icons] = await Promise.all([
    measurer(),
    fetchAsDataUrl(geistLatin, 'font/woff2').catch((error: unknown) => {
      console.warn('The font is left out of the export:', error)
      return undefined
    }),
    iconPictures(scene),
  ])
  return diagramSvg(scene, { measure, font, icons })
}

/** The largest picture every browser can draw: Safari stops at 16.7 million pixels. */
const MOST_PIXELS = 16_000_000
const MOST_SIDE = 16_000

/** How much larger than the diagram the PNG is: twice, for screens with dense pixels, if it fits. */
export function pngScale(width: number, height: number): number {
  return Math.min(2, Math.sqrt(MOST_PIXELS / (width * height)), MOST_SIDE / width, MOST_SIDE / height)
}

/** An SVG document painted into a PNG, at `pngScale` times its size. */
export async function pngOfSvg(svg: string): Promise<Blob> {
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await image.decode()
  const scale = pngScale(image.naturalWidth, image.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.naturalWidth * scale)
  canvas.height = Math.round(image.naturalHeight * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No canvas to paint the PNG on')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return new Promise((done, fail) =>
    canvas.toBlob((blob) => (blob ? done(blob) : fail(new Error('The PNG could not be made'))), 'image/png'),
  )
}

/** Hand a file to the browser to save. */
function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  // The browser has taken the file by then.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** The open diagram as text: Mermaid's C4 diagram or D2. */
export function textOf(diagram: Diagram, format: 'mermaid' | 'd2'): string {
  return format === 'mermaid' ? mermaidFormat.serialize(writableAsMermaid(diagram)) : d2Format.serialize(diagram)
}

/**
 * Make the file of the open diagram in a format and save it: a picture of the scene, or the
 * diagram as text.
 */
export async function exportDiagram(open: { scene: Scene; diagram: Diagram }, format: ExportFormat): Promise<void> {
  const name = fileName(open.scene.title, format)
  if (format === 'mermaid' || format === 'd2') {
    save(new Blob([textOf(open.diagram, format)], { type: 'text/plain;charset=utf-8' }), name)
    return
  }
  const svg = await svgOf(open.scene)
  save(format === 'svg' ? new Blob([svg], { type: 'image/svg+xml' }) : await pngOfSvg(svg), name)
}
