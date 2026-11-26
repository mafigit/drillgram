import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LIGHT, oklchToHex } from '../palette'

describe('oklchToHex', () => {
  it('gives white, black and greys exactly', () => {
    expect(oklchToHex('oklch(1 0 0)')).toBe('#ffffff')
    expect(oklchToHex('oklch(0 0 0)')).toBe('#000000')
    // Tailwind's neutral-50, which is the canvas.
    expect(oklchToHex('oklch(0.985 0 0)')).toBe('#fafafa')
  })

  it('gives the sRGB colour of a hue', () => {
    // CSS Color 4's red in OKLCH.
    expect(oklchToHex('oklch(0.62796 0.25768 29.2339)')).toBe('#ff0000')
  })

  it('clips what sRGB cannot show', () => {
    expect(oklchToHex('oklch(0.9 0.4 150)')).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('refuses what is not oklch', () => {
    expect(() => oklchToHex('#fff')).toThrow()
  })
})

describe('LIGHT', () => {
  it('is the light theme of main.css', () => {
    const css = readFileSync(resolve(__dirname, '../../assets/main.css'), 'utf8')
    const root = /:root\s*\{([^}]*)\}/.exec(css)![1]!
    const tokens = Object.fromEntries([...root.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim()]))
    for (const [name, value] of Object.entries(LIGHT)) expect([name, tokens[name]]).toEqual([name, value])
  })
})
