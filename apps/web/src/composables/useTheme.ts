import { ref } from 'vue'
import type { Ref } from 'vue'

export type Theme = 'light' | 'dark' | 'solarized-light' | 'solarized-dark'

/**
 * The themes, as the menu lists them. `dark`: a theme on a dark ground. `colours`: what its
 * swatch in the menu shows, the ground and an accent.
 */
export const THEMES: { id: Theme; name: string; dark: boolean; solarized: boolean; colours: [ground: string, accent: string] }[] = [
  { id: 'light', name: 'Light', dark: false, solarized: false, colours: ['#ffffff', '#171717'] },
  { id: 'dark', name: 'Dark', dark: true, solarized: false, colours: ['#171717', '#e5e5e5'] },
  { id: 'solarized-light', name: 'Solarized Light', dark: false, solarized: true, colours: ['#fdf6e3', '#268bd2'] },
  { id: 'solarized-dark', name: 'Solarized Dark', dark: true, solarized: true, colours: ['#002b36', '#2aa198'] },
]

export const THEME_KEY = 'drillgram.theme'

/**
 * The theme: the stored choice, else light or dark as the system asks. A theme is classes on
 * `<html>`, which the tokens in `assets/main.css` switch on: `dark` for every theme on a dark
 * ground (so what is written for the dark theme holds for Solarized Dark too), `solarized` for
 * the Solarized colours.
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
  document.documentElement.classList.toggle('solarized', theme.solarized)
}
