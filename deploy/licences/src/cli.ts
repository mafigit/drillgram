// `pnpm licences`: the licence gate, run by bin/ci-check. Lists the packages (npm, through pnpm)
// and the crates of the layout engine (through cargo, or from the list the check's image was
// built with) and fails when one is under a licence that licences.allow.json does not allow.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { judge } from './licences.ts'
import type { Allowed, Package } from './licences.ts'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../../..')
const allowed = JSON.parse(readFileSync(join(here, '../licences.allow.json'), 'utf8')) as Allowed
const run = (command: string, args: string[]) => execFileSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] })

/** Every package of the workspace's node_modules, as pnpm lists them: by licence. */
function npmPackages(): Package[] {
  const listed = JSON.parse(run('pnpm', ['licenses', 'list', '--json'])) as Record<string, { name: string; versions: string[]; license?: string }[]>
  return Object.values(listed).flatMap((group) =>
    group.flatMap((found) => found.versions.map((version) => ({ name: found.name, version, licence: found.license === 'Unknown' ? undefined : found.license, from: 'npm' as const }))),
  )
}

/**
 * Every crate of the layout engine, the engine among them, as `cargo metadata` lists them. The
 * check's image has no cargo: there the list was written while the engine was built
 * (apps/web/e2e/Dockerfile), and DRILLGRAM_CRATES says where.
 */
function crates(): Package[] {
  const given = process.env.DRILLGRAM_CRATES
  const text = given && existsSync(given) ? readFileSync(given, 'utf8') : run('cargo', ['metadata', '--format-version', '1', '--locked', '--manifest-path', 'packages/layout/Cargo.toml'])
  const listed = JSON.parse(text) as { packages: { name: string; version: string; license?: string | null }[] }
  return listed.packages.map((found) => ({ name: found.name, version: found.version, licence: found.license ?? undefined, from: 'crates' as const }))
}

const packages = [...npmPackages(), ...crates()]
const { problems, unused } = judge(packages, allowed)
for (const problem of problems) console.error(`Licence: ${problem}`)
for (const pattern of unused) console.error(`Licence: the exception for ${pattern} is needed by no package: take it out of licences.allow.json`)
if (problems.length > 0 || unused.length > 0) {
  console.error('Allow the licence or except the package in deploy/licences/licences.allow.json, with the reason; see docs/agents/licences.md.')
  process.exit(1)
}
console.log(`Licences: ${packages.filter((found) => found.from === 'npm').length} npm packages and ${packages.filter((found) => found.from === 'crates').length} crates are under allowed licences.`)
