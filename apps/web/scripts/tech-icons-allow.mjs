// Writes tech-icons.allow.json: the icons of @thesvg/static the app may ship, with the licence
// of each. Run it again when @thesvg/static is upgraded:
//
//   curl -sL "https://raw.githubusercontent.com/glincker/thesvg/thesvg@<version>/src/data/icons.json" -o /tmp/icons.json
//   node scripts/tech-icons-allow.mjs /tmp/icons.json
//
// The npm package has the pictures but not the licences; theSVG's own manifest (the file above,
// at the tag of the same version) has a licence for every icon. Only an icon with one of the
// licences below gets in: each lets the picture be passed on, unchanged, in an app like this.
// Left out on purpose: icons marked as trademark or fair use only, proprietary or unknown,
// copyleft code licences (GPL, AGPL), share-alike, and the sets nobody attaches to a card
// (flags, sign-in badges). See docs/icon-licences.md.
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const LICENCES = ['CC0-1.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC-BY-ND-2.0']
const SETS = ['brands', 'community', 'aws', 'azure', 'gcp', 'k8s']

const require = createRequire(import.meta.url)
const shipped = new Set(require('@thesvg/static/icons.json').map((icon) => icon.slug))
const { version } = require('@thesvg/static/package.json')
const manifest = JSON.parse(readFileSync(process.argv[2], 'utf8'))

const icons = {}
const counts = {}
for (const icon of manifest) {
  if (!shipped.has(icon.slug) || !SETS.includes(icon.collection) || !LICENCES.includes(icon.license)) continue
  // The form the model asks of an icon's name.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(icon.slug)) continue
  ;((icons[icon.collection] ??= {})[icon.license] ??= []).push(icon.slug)
  counts[icon.collection] = (counts[icon.collection] ?? 0) + 1
}
for (const set of Object.values(icons)) for (const names of Object.values(set)) names.sort()
const out = { source: `@thesvg/static ${version}, licences from thesvg@${version} src/data/icons.json`, icons }
writeFileSync(new URL('../tech-icons.allow.json', import.meta.url), JSON.stringify(out, null, 1) + '\n')
console.log(counts, 'of', manifest.length)
