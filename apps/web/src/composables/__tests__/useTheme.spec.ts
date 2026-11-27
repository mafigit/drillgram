import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { THEME_KEY, THEMES, useTheme } from '../useTheme'

function systemPrefersDark(dark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: dark && query === '(prefers-color-scheme: dark)',
  }))
}

const classes = () => [...document.documentElement.classList].sort()
const isDark = () => document.documentElement.classList.contains('dark')

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.className = ''
  })
  afterEach(() => vi.unstubAllGlobals())

  it('is light when nothing is stored and the system does not ask for dark', () => {
    expect(useTheme().theme.value).toBe('light')
    expect(isDark()).toBe(false)
  })

  it('follows the system when nothing is stored', () => {
    systemPrefersDark(true)
    expect(useTheme().theme.value).toBe('dark')
    expect(isDark()).toBe(true)
  })

  it('prefers the stored choice over the system', () => {
    systemPrefersDark(true)
    window.localStorage.setItem(THEME_KEY, 'light')
    expect(useTheme().theme.value).toBe('light')
    expect(isDark()).toBe(false)
  })

  it('ignores a stored value that is not a theme', () => {
    window.localStorage.setItem(THEME_KEY, 'purple')
    expect(useTheme().theme.value).toBe('light')
  })

  it('offers light, dark, the two Solarized and the two Catppuccin themes', () => {
    expect(THEMES.map((theme) => theme.name)).toEqual([
      'Light',
      'Dark',
      'Solarized Light',
      'Solarized Dark',
      'Catppuccin Latte',
      'Catppuccin Mocha',
    ])
  })

  it('sets, applies and remembers the choice', () => {
    const { theme, set } = useTheme()
    set('dark')
    expect(theme.value).toBe('dark')
    expect(classes()).toEqual(['dark'])
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark')
    set('light')
    expect(classes()).toEqual([])
    expect(useTheme().theme.value).toBe('light')
  })

  it('a Solarized theme is light or dark too, so that what follows the dark theme follows it', () => {
    const { set } = useTheme()
    set('solarized-dark')
    expect(classes()).toEqual(['dark', 'solarized'])
    set('solarized-light')
    expect(classes()).toEqual(['solarized'])
    expect(useTheme().theme.value).toBe('solarized-light')
    set('dark')
    expect(classes()).toEqual(['dark'])
  })

  it('a Catppuccin theme is light (Latte) or dark (Mocha) too, and drops the other palette', () => {
    const { set } = useTheme()
    set('solarized-dark')
    set('catppuccin-mocha')
    expect(classes()).toEqual(['catppuccin', 'dark'])
    set('catppuccin-latte')
    expect(classes()).toEqual(['catppuccin'])
    expect(useTheme().theme.value).toBe('catppuccin-latte')
    set('light')
    expect(classes()).toEqual([])
  })
})
