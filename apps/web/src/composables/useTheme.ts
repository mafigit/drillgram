import { ref } from 'vue'
import type { Ref } from 'vue'

export type Theme = 'light' | 'dark' | 'solarized-light' | 'solarized-dark' | 'catppuccin-latte' | 'catppuccin-mocha'

const PALETTES = ['solarized', 'catppuccin'] as const
type Palette = (typeof PALETTES)[number]

/**
 * The themes, as the menu lists them. `dark`: a theme on a dark ground. `palette`: the class of
 * its colours in `assets/main.css`, none for the plain ones. `colours`: what its swatch in the
 * menu shows, the ground and an accent.
 */
export const THEMES: { id: Theme; name: string; dark: boolean; palette?: Palette; colours: [ground: string, accent: string] }[] = [
  { id: 'light', name: 'Light', dark: false, colours: ['#ffffff', '#171717'] },
  { id: 'dark', name: 'Dark', dark: true, colours: ['#171717', '#e5e5e5'] },
  { id: 'solarized-light', name: 'Solarized Light', dark: false, palette: 'solarized', colours: ['#fdf6e3', '#268bd2'] },
  { id: 'solarized-dark', name: 'Solarized Dark', dark: true, palette: 'solarized', colours: ['#002b36', '#2aa198'] },
  { id: 'catppuccin-latte', name: 'Catppuccin Latte', dark: false, palette: 'catppuccin', colours: ['#eff1f5', '#8839ef'] },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', dark: true, palette: 'catppuccin', colours: ['#1e1e2e', '#cba6f7'] },
]

export const THEME_KEY = 'drillgram.theme'

/**
 * The theme: the stored choice, else light or dark as the system asks. A theme is classes on
 * `<html>`, which the tokens in `assets/main.css` switch on: `dark` for every theme on a dark
 * ground (so what is written for the dark theme holds for Solarized Dark too), and the class of
 * its palette (`solarized`, `catppuccin`).
 */
export function useTheme(): { theme: Ref<Theme>; set: (theme: Theme) => void } {
  const theme = ref<Theme>(stored() ?? system())
  apply(theme.value)

  function set(chosen: Theme) {
    theme.value = chosen
    window.localStorage.setItem(THEME_KEY, chosen)
    apply(chosen)
  }

  return { theme, set }
}

function stored(): Theme | undefined {
  const value = window.localStorage.getItem(THEME_KEY)
  return THEMES.find((theme) => theme.id === value)?.id
}

function system(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function apply(id: Theme) {
  const theme = THEMES.find((known) => known.id === id)!
  document.documentElement.classList.toggle('dark', theme.dark)
  for (const palette of PALETTES) document.documentElement.classList.toggle(palette, theme.palette === palette)
}
