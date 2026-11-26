// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NOTICE, forLightGround, library } from '../../tech-icons.vite'

describe('the drawing of an icon that is served', () => {
  const files: Record<string, string> = { 'go/default.svg': '<svg fill="#fff"/>', 'go/dark.svg': '<svg fill="#fff"/>', 'go/light.svg': '<svg fill="#000"/>', 'vue/default.svg': '<svg fill="#42b883"/>', 'vue/dark.svg': '<svg fill="#fff"/>', 'vue/light.svg': '<svg fill="#000"/>' }
  const read = (file: string) => files[file]!

  it('is the usual one', () => {
    expect(forLightGround({ default: 'python/default.svg' }, read)).toBe('python/default.svg')
    expect(forLightGround({ default: 'vue/default.svg', dark: 'vue/dark.svg', light: 'vue/light.svg' }, read)).toBe('vue/default.svg')
  })

  it('is the one for a light ground where the usual one is drawn for a dark ground: a card is light', () => {
    expect(forLightGround({ default: 'go/default.svg', dark: 'go/dark.svg', light: 'go/light.svg' }, read)).toBe('go/light.svg')
  })

  it('is none for an icon without a drawing', () => {
    expect(forLightGround({}, read)).toBeUndefined()
  })

  it('shows the Go logo of the real set on a light ground', () => {
    const real = forLightGround({ default: 'go/default.svg', dark: 'go/dark.svg', light: 'go/light.svg' })
    expect(real).toBe('go/light.svg')
  })
})

describe('the Cloudflare icons', () => {
  const folder = join(dirname(fileURLToPath(import.meta.url)), '../../tech-icons-cloudflare')
  const source: { repository: string; path: string; commit: string; licence: string; icons: { name: string; title: string; file: string; blob: string }[]; leftOut: Record<string, string> } = JSON.parse(
    readFileSync(join(folder, 'SOURCE.json'), 'utf8'),
  )
  /** The id git gives a file's content: what the repository lists for the file at that commit. */
  const blob = (content: Buffer) => createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex')

  it('say where they are from: Cloudflare\'s docs repository at one commit, under CC BY 4.0', () => {
    expect(source.repository).toBe('https://github.com/cloudflare/cloudflare-docs')
    expect(source.path).toBe('src/icons')
    expect(source.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(source.licence).toBe('CC-BY-4.0')
  })

  it('are the files of that commit, unchanged, and nothing else is in the folder', () => {
    expect(source.icons.length).toBeGreaterThan(100)
    for (const icon of source.icons) expect(blob(readFileSync(join(folder, icon.file))), icon.file).toBe(icon.blob)
    expect(readdirSync(folder).filter((file) => file.endsWith('.svg')).sort()).toEqual(source.icons.map((icon) => icon.file).sort())
  })

  it('are pictures only: no script in them, nothing loaded from elsewhere', () => {
    for (const icon of source.icons) {
      const svg = readFileSync(join(folder, icon.file), 'utf8')
      expect(svg, icon.file).toMatch(/^\s*<svg[\s>]/)
      expect(svg, icon.file).not.toMatch(/<script|<foreignObject|\son\w+\s*=|href\s*=\s*["'](?!#)/i)
    }
  })

  it('have names of their own in the library, and the products people ask for', () => {
    const names = source.icons.map((icon) => icon.name)
    for (const name of names) expect(name).toMatch(/^cf-[a-z0-9][a-z0-9-]*$/)
    expect(new Set(names).size).toBe(names.length)
    const titles = Object.fromEntries(source.icons.map((icon) => [icon.name, icon.title]))
    expect(titles).toMatchObject({
      'cf-r2': 'Cloudflare R2',
      'cf-d1': 'Cloudflare D1',
      'cf-kv': 'Cloudflare KV',
      'cf-durable-objects': 'Cloudflare Durable Objects',
      'cf-workers-ai': 'Cloudflare Workers AI',
      'cf-ai-gateway': 'Cloudflare AI Gateway',
      'cf-dns': 'Cloudflare DNS',
      'cf-waf': 'Cloudflare WAF',
      'cf-cloudflare-one': 'Cloudflare One',
      'cf-1-1-1-1': 'Cloudflare 1.1.1.1',
    })
  })

  it('leave out what is not Cloudflare\'s to pass on, and say why', () => {
    expect(Object.keys(source.leftOut).sort()).toEqual(['cf', 'devin', 'google-tag-gateway', 'pulumi', 'terraform'])
    for (const name of Object.keys(source.leftOut)) expect(source.icons.some((icon) => icon.file === `${name}.svg`)).toBe(false)
  })

  it('are in the library beside theSVG\'s, as a set of their own with their licence', () => {
    const { icons, file } = library()
    const r2 = icons.find((icon) => icon.name === 'cf-r2')
    expect(r2).toEqual({ name: 'cf-r2', title: 'Cloudflare R2', set: 'cloudflare', licence: 'CC-BY-4.0' })
    expect(file.get('cf-r2')).toBe(join(folder, 'r2.svg'))
    // theSVG's own Cloudflare icons stay.
    expect(icons.some((icon) => icon.name === 'cloudflare-workers' && icon.set === 'brands')).toBe(true)
    expect(new Set(icons.map((icon) => icon.name)).size).toBe(icons.length)
  })

  it('are named in the notice that goes out with the icons', () => {
    expect(NOTICE).toContain('Cloudflare, Inc.')
    expect(NOTICE).toContain('https://creativecommons.org/licenses/by/4.0/')
    expect(NOTICE).toContain(source.commit)
  })
})

