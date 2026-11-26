// Fetches Cloudflare's product icons into tech-icons-cloudflare/, unchanged, with SOURCE.json
// that says where each is from. Run it again to take a newer commit:
//
//   node scripts/cloudflare-icons.mjs <commit of cloudflare/cloudflare-docs>
//
// The icons are the ones Cloudflare's own documentation shows beside its products
// (github.com/cloudflare/cloudflare-docs, src/icons). Cloudflare licenses that repository's
// content under CC BY 4.0, which lets the files be passed on with a credit; its names and logos
// stay its trademarks. See docs/icon-licences.md. Left out: marks of other owners that the docs
// show, and Cloudflare's own logo.
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'

const REPOSITORY = 'cloudflare/cloudflare-docs'
const PATH = 'src/icons'
const LEFT_OUT = {
  cf: "Cloudflare's own logo: a logo, not a product's drawing; theSVG has it",
  devin: "Another owner's mark (Cognition)",
  'google-tag-gateway': "Carries another owner's mark (Google)",
  pulumi: "Another owner's mark (Pulumi)",
  terraform: "Another owner's mark (HashiCorp)",
}
/** Words of a file name that are written their own way. */
const WORDS = {
  ai: 'AI', api: 'API', byoip: 'BYOIP', casb: 'CASB', d1: 'D1', ddos: 'DDoS', dex: 'DEX', dmarc: 'DMARC', dns: 'DNS', kv: 'KV', moq: 'MoQ',
  r2: 'R2', sase: 'SASE', sfu: 'SFU', sql: 'SQL', ssl: 'SSL', turn: 'TURN', vpc: 'VPC', waf: 'WAF', wan: 'WAN', warp: 'WARP', web3: 'Web3', for: 'for',
}

const commit = process.argv[2]
if (!/^[0-9a-f]{40}$/.test(commit ?? '')) {
  console.error('Give the full commit of cloudflare/cloudflare-docs to take the icons from.')
  process.exit(1)
}
const headers = { 'User-Agent': 'icon-fetch' }
const listed = await (await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/${PATH}?ref=${commit}`, { headers })).json()
if (!Array.isArray(listed)) throw new Error(`No list of icons: ${JSON.stringify(listed).slice(0, 200)}`)

const folder = new URL('../tech-icons-cloudflare/', import.meta.url)
mkdirSync(folder, { recursive: true })
for (const file of readdirSync(folder)) if (file.endsWith('.svg')) rmSync(new URL(file, folder))

const title = (name) => {
  const words = name === '1.1.1.1' ? ['1.1.1.1'] : name.split('-').map((word) => WORDS[word] ?? word[0].toUpperCase() + word.slice(1))
  return words[0] === 'Cloudflare' ? words.join(' ') : `Cloudflare ${words.join(' ')}`
}
const icons = []
for (const entry of listed.filter((found) => found.type === 'file' && found.name.endsWith('.svg')).sort((a, b) => (a.name < b.name ? -1 : 1))) {
  const name = entry.name.slice(0, -4)
  if (Object.hasOwn(LEFT_OUT, name)) continue
  const content = Buffer.from(await (await fetch(`https://raw.githubusercontent.com/${REPOSITORY}/${commit}/${PATH}/${entry.name}`, { headers })).arrayBuffer())
  // The file as the repository has it: its content gives the id the repository lists for it.
  const blob = createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex')
  if (blob !== entry.sha) throw new Error(`${entry.name} is not the file of the commit`)
  writeFileSync(new URL(entry.name, folder), content)
  icons.push({ name: `cf-${name.replace(/[^a-z0-9]+/g, '-')}`, title: title(name), file: entry.name, blob })
}
const source = {
  repository: `https://github.com/${REPOSITORY}`,
  path: PATH,
  commit,
  licence: 'CC-BY-4.0',
  credit: '(c) Cloudflare, Inc. and contributors',
  leftOut: LEFT_OUT,
  icons,
}
writeFileSync(new URL('SOURCE.json', folder), JSON.stringify(source, null, 1) + '\n')
console.log(icons.length, 'icons of', listed.length, 'at', commit)
