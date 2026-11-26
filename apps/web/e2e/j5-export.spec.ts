import { readFile } from 'node:fs/promises'
import { test, expect } from './fixtures.ts'

/** Width and height of a PNG, from its header. */
function pngSize(png: Buffer): { width: number; height: number } {
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

// J5 Export: docs/journeys.md#j5-export
test('J5 Export the diagram as PNG, SVG, Mermaid and D2', async ({ editor, consoleErrors }) => {
  await editor.open()
  await editor.addElement('Person', 'Customer')
  await editor.addElement('Software System', 'Online Shop', { description: 'Sells books online' })
  await editor.connect('Customer', 'Online Shop', 'Places orders in')
  // An icon on a card goes into the file too.
  await editor.openIconPicker('Online Shop')
  await editor.iconPicker.getByRole('combobox', { name: 'Find an icon' }).fill('postgres')
  await editor.iconPicker.getByRole('option', { name: 'PostgreSQL', exact: true }).click()
  await editor.page.keyboard.press('Escape')
  await expect(editor.element('Online Shop').getByRole('img', { name: 'PostgreSQL' })).toBeVisible()

  // SVG: a drawing of the whole diagram that stands on its own. Its texts are text, and the icon
  // and the font are inside the file, not links to the app. The press shows at once.
  const busy = await editor.recordAttribute(editor.exportButton, 'aria-busy')
  const svgDownload = await editor.exportAs('SVG')
  expect(svgDownload.suggestedFilename()).toBe('overview.svg')
  await expect.poll(busy).toEqual(['true', 'false'])
  const svg = await readFile(await svgDownload.path(), 'utf8')
  const parsed = await editor.page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
    const root = doc.documentElement
    return {
      root: root.localName,
      broken: doc.getElementsByTagName('parsererror').length > 0,
      width: Number(root.getAttribute('width')),
      height: Number(root.getAttribute('height')),
      texts: [...doc.getElementsByTagName('text')].map((t) => t.textContent),
      images: [...doc.getElementsByTagName('image')].map((i) => i.getAttribute('href')?.slice(0, 26)),
    }
  }, svg)
  expect(parsed.broken).toBe(false)
  expect(parsed.root).toBe('svg')
  expect(parsed.texts).toEqual(
    expect.arrayContaining(['Overview', 'Customer', 'Online Shop', 'Sells books online', 'Places orders in']),
  )
  expect(parsed.images).toEqual(['data:image/svg+xml;base64,'])
  expect(svg).toContain('@font-face')
  expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)|\/tech-icons\//)

  // PNG: the same drawing at twice its size, sharp on a high-density screen, and not blank.
  const pngDownload = await editor.exportAs('PNG')
  expect(pngDownload.suggestedFilename()).toBe('overview.png')
  const png = await readFile(await pngDownload.path())
  expect(pngSize(png)).toEqual({ width: parsed.width * 2, height: parsed.height * 2 })
  const colours = await editor.page.evaluate(async (data) => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    const seen = new Set<number>()
    for (let i = 0; i < pixels.length; i += 4) seen.add((pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!)
    return seen.size
  }, png.toString('base64'))
  // Text, borders and the icon's colours: far more than a blank or one-coloured picture.
  expect(colours).toBeGreaterThan(50)

  // Mermaid and D2: the diagram as text, in C4's notation, with its title.
  const mermaid = await editor.exportAs('Mermaid')
  expect(mermaid.suggestedFilename()).toBe('overview.mmd')
  expect(await readFile(await mermaid.path(), 'utf8')).toBe(
    'C4Context\n' +
      '  title Overview\n' +
      '  Person(Customer, "Customer")\n' +
      '  System(OnlineShop, "Online Shop", "Sells books online")\n' +
      '  Rel(Customer, OnlineShop, "Places orders in")\n',
  )
  const d2 = await editor.exportAs('D2')
  expect(d2.suggestedFilename()).toBe('overview.d2')
  const d2Text = await readFile(await d2.path(), 'utf8')
  expect(d2Text).toContain('diagram-title: "Overview" {')
  expect(d2Text).toContain('"Customer": "Customer\\n[Person]" {\n  shape: c4-person\n')
  expect(d2Text).toContain('"OnlineShop": "Online Shop\\n[Software System]\\n\\nSells books online" {')
  expect(d2Text).toContain('"Customer" -> "OnlineShop": "Places orders in"\n')
  expect(consoleErrors).toEqual([])
})
