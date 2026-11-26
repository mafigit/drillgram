import { shallowRef } from 'vue'
import type { ShallowRef } from 'vue'

/** An icon of the library (tech-icons.vite.ts): a product, a service or a brand. */
export interface TechIcon {
  name: string
  title: string
  set: string
  licence: string
}

export const ICON_SETS: Record<string, string> = {
  brands: 'Brands and tools',
  community: 'Community',
  aws: 'AWS',
  azure: 'Azure',
  gcp: 'Google Cloud',
  k8s: 'Kubernetes',
  cloudflare: 'Cloudflare',
}

/** Where an icon's picture is. It is shown as it is: never recoloured, cropped or redrawn. */
export const iconUrl = (name: string) => `/tech-icons/${name}.svg`

const icons = shallowRef<Map<string, TechIcon>>(new Map())
let loading: Promise<void> | undefined

/**
 * The icon library, by name. Its list is large, so it loads when first asked for; until then
 * the map is empty and an icon is known by its name only.
 */
export function useTechIcons(): ShallowRef<Map<string, TechIcon>> {
  loading ??= import('virtual:tech-icons')
    .then((module) => {
      icons.value = new Map(module.default.map((icon) => [icon.name, icon]))
    })
    .catch((error: unknown) => console.warn('The icon library did not load:', error))
  return icons
}
