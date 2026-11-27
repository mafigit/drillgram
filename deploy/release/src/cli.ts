// `pnpm --filter @drillgram/release next` (or `node deploy/release/src/cli.ts`): prints the
// version of the next release of the Helm chart and the hosted image, from the commits since the
// last `helm-v<version>` tag that HEAD has; prints nothing when they make no release. The Helm
// workflow (.github/workflows/helm.yml) asks it after every green commit on main. Needs the
// tags and the history: a clone of depth 1 has neither.
import { execFileSync } from 'node:child_process'
import { nextVersion } from './version.ts'

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

let last: string | undefined
try {
  last = git('describe', '--tags', '--abbrev=0', '--match', 'helm-v*').trim()
} catch {
  // No release yet: every commit counts, from 0.0.0.
}
const range = last ? [`${last}..HEAD`] : ['HEAD']
// Each message ends with a NUL: a body can hold empty lines.
const messages = git('log', '--format=%B%x00', ...range)
  .split('\0')
  .map((message) => message.trim())
  .filter((message) => message !== '')
const next = nextVersion(last ? last.slice('helm-v'.length) : '0.0.0', messages)
if (next) process.stdout.write(`${next}\n`)
