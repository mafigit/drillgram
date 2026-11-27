/**
 * The colours of an exported diagram: always the light theme of `assets/main.css` (a test keeps
 * them equal), as a picture goes into documents, wikis and slides, which are mostly light. They
 * are written as hex, which every program that opens an SVG understands; `oklch()` is not.
 */
export const LIGHT = {
  canvas: 'oklch(0.985 0 0)',
  foreground: 'oklch(0.145 0 0)',
  card: 'oklch(1 0 0)',
  'card-foreground': 'oklch(0.145 0 0)',
  popover: 'oklch(1 0 0)',
  muted: 'oklch(0.97 0 0)',
  'muted-foreground': 'oklch(0.556 0 0)',
  border: 'oklch(0.922 0 0)',
  destructive: 'oklch(0.577 0.245 27.325)',
  'kind-box': 'oklch(0.556 0 0)',
  'kind-person': 'oklch(0.62 0.17 240)',
  'kind-softwareSystem': 'oklch(0.55 0.22 275)',
  'kind-container': 'oklch(0.6 0.12 185)',
  'kind-component': 'oklch(0.68 0.16 60)',
  'kind-code': 'oklch(0.55 0.02 260)',
  note: 'oklch(0.924 0.12 95.746)',
  'note-ink': 'oklch(0.268 0.007 34.298)',
  'note-pin': 'oklch(0.577 0.245 27.325)',
} as const

export type Colour = keyof typeof LIGHT

/** An `oklch(L C H)` colour as `#rrggbb`, clipped to sRGB. */
export function oklchToHex(css: string): string {
  const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(css)
  if (!match) throw new Error(`Not an oklch colour: ${css}`)
  const [lightness, chroma, hue] = match.slice(1).map(Number) as [number, number, number]
  const a = chroma * Math.cos((hue * Math.PI) / 180)
  const b = chroma * Math.sin((hue * Math.PI) / 180)
  // OKLab to linear sRGB (Björn Ottosson's matrices).
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return `#${linear
    .map((value) => {
      const clipped = Math.min(1, Math.max(0, value))
      const gamma = clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055
      return Math.round(gamma * 255)
        .toString(16)
        .padStart(2, '0')
    })
    .join('')}`
}

/** The export's colours, as hex. */
export const COLOURS: Record<Colour, string> = Object.fromEntries(
  Object.entries(LIGHT).map(([name, css]) => [name, oklchToHex(css)]),
) as Record<Colour, string>
