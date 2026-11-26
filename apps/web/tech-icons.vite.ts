import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import allow from './tech-icons.allow.json' with { type: 'json' }
import cloudflare from './tech-icons-cloudflare/SOURCE.json' with { type: 'json' }

// The icon library: the icons of @thesvg/static that tech-icons.allow.json lets in (an open
// licence each, see docs/icon-licences.md). The pictures are served as they are, one file per
// icon under /tech-icons/, never changed and never drawn into the bundle; `virtual:tech-icons`
// is the list to search in.
// A second source beside it: Cloudflare's product icons, from Cloudflare's own docs repository
// under CC BY 4.0 (tech-icons-cloudflare/, fetched by scripts/cloudflare-icons.mjs at one
// commit). theSVG has the logos of Cloudflare, Workers and Pages only.
// Some icons come in more than one drawing of the set's own. A card is a light ground (in the
// dark theme an icon gets a white ground of its own), so where the usual drawing is the one made
// for a dark ground (Go's, Apple's and AWS's are white) the one made for a light ground is served.

export interface TechIcon {
  /** The icon's name, as an object of the model stores it; its picture is /tech-icons/<name>.svg. */
  name: string
  title: string
  /** The set it belongs to: brands, community, aws, azure, gcp, k8s or cloudflare. */
  set: string
  licence: string
}

const require = createRequire(import.meta.url)
const root = join(dirname(require.resolve('@thesvg/static/package.json')), 'dist')
const VIRTUAL = 'virtual:tech-icons'

/** The drawing of an icon that shows on a light ground: its usual one, unless that is its dark-ground one. */
export function forLightGround(variants: Record<string, string>, read = (file: string) => readFileSync(join(root, 'svg', file), 'utf8')): string | undefined {
  const { default: usual, light, dark } = variants
  if (!usual || !light || !dark) return usual
  return usual === dark || read(usual) === read(dark) ? light : usual
}

export function library(): { icons: TechIcon[]; file: Map<string, string> } {
  const manifest: { slug: string; title: string; variants: Record<string, string> }[] = require('@thesvg/static/icons.json')
  const known = new Map(manifest.map((icon) => [icon.slug, icon]))
  const icons: TechIcon[] = []
  const file = new Map<string, string>()
  for (const [set, licences] of Object.entries(allow.icons as Record<string, Record<string, string[]>>)) {
    for (const [licence, names] of Object.entries(licences)) {
      for (const name of names) {
        const icon = known.get(name)
        const picture = icon && forLightGround(icon.variants)
        if (!icon || !picture) continue
        icons.push({ name, title: icon.title, set, licence })
        file.set(name, join(root, 'svg', picture))
      }
    }
  }
  // Cloudflare's own, each under its own name (`cf-`): theSVG's Cloudflare logos stay as they are.
  const folder = join(dirname(fileURLToPath(import.meta.url)), 'tech-icons-cloudflare')
  for (const icon of cloudflare.icons) {
    if (file.has(icon.name)) continue
    icons.push({ name: icon.name, title: icon.title, set: 'cloudflare', licence: cloudflare.licence })
    file.set(icon.name, join(folder, icon.file))
  }
  icons.sort((a, b) => a.title.localeCompare(b.title, 'en'))
  return { icons, file }
}

export const NOTICE = `Icons under /tech-icons/ come from theSVG (https://thesvg.org, ${allow.source}),
and the ones whose names start with "cf-" from Cloudflare's documentation (see below).
They are passed on unchanged. Each keeps its own licence: see the "licence" of the icon in the
app's icon picker and docs/icon-licences.md in the app's repository.

- Cloudflare product icons (cf-*.svg): ${cloudflare.credit}, from
  ${cloudflare.repository}/tree/${cloudflare.commit}/${cloudflare.path}
  licensed under the Creative Commons Attribution 4.0 International Public License
  (https://creativecommons.org/licenses/by/4.0/). No changes were made; the files only have
  "cf-" before their names here. That licence grants no right to Cloudflare's names, logos or
  trademarks.

- AWS Architecture Icons: (c) Amazon Web Services, Inc., CC BY-ND 2.0
  (https://creativecommons.org/licenses/by-nd/2.0/), unmodified.
- Azure icons: (c) Microsoft, as published under the MIT licence by theSVG.
- Google Cloud and Kubernetes icons: Apache License 2.0.
- Brand icons: CC0-1.0, MIT, Apache-2.0 or BSD, as marked.

All names and logos are trademarks of their owners. They are shown to say what a part of a
diagram is made with or runs on, and stand for no endorsement.
`

export function techIcons(): Plugin {
  const { icons, file } = library()
  return {
    name: 'tech-icons',
    resolveId: (id) => (id === VIRTUAL ? `\0${VIRTUAL}` : undefined),
    load: (id) => (id === `\0${VIRTUAL}` ? `export default ${JSON.stringify(icons)}` : undefined),
    // While developing: straight from the package.
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = /^\/tech-icons\/([a-z0-9-]+)\.svg(\?.*)?$/.exec(request.url ?? '')?.[1]
        const path = name === undefined ? undefined : file.get(name)
        if (!path) return next()
        response.setHeader('Content-Type', 'image/svg+xml')
        response.setHeader('Cache-Control', 'max-age=86400')
        response.end(readFileSync(path))
      })
    },
    // In the build: one file per icon beside the app.
    generateBundle() {
      for (const [name, path] of file) {
        this.emitFile({ type: 'asset', fileName: `tech-icons/${name}.svg`, source: readFileSync(path) })
      }
      this.emitFile({ type: 'asset', fileName: 'tech-icons/NOTICE.txt', source: NOTICE })
    },
  }
}
