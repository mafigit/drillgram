// Which version the next release of the Helm chart and the hosted image is, from the messages of
// the commits since the last one (Conventional Commits, https://www.conventionalcommits.org):
// a feature is a minor version, a fix or a faster app a patch, a breaking change a major one
// (before 1.0 a minor one). Commits no user notices (tests, docs, CI, chores) make no release.

/** The kinds of commit that make a release, and how large it is. */
const RELEASED: Record<string, 'minor' | 'patch'> = { feat: 'minor', fix: 'patch', perf: 'patch' }

/** The type of a commit, whether it says it breaks something, and nothing else of its first line. */
const SUBJECT = /^(\w+)(?:\([^)]*\))?(!)?:/

/**
 * The version after `last` for these commit messages (subject and body each), or `undefined`
 * when none of them is released.
 */
export function nextVersion(last: string, messages: readonly string[]): string | undefined {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(last)
  if (!parts) throw new Error(`The last version "${last}" is not major.minor.patch.`)
  const [major, minor, patch] = parts.slice(1).map(Number) as [number, number, number]
  let bump: 'major' | 'minor' | 'patch' | undefined
  const larger = (step: 'major' | 'minor' | 'patch') => {
    const order = ['patch', 'minor', 'major']
    if (bump === undefined || order.indexOf(step) > order.indexOf(bump)) bump = step
  }
  for (const message of messages) {
    const [subject = '', ...body] = message.split('\n')
    const found = SUBJECT.exec(subject.trim())
    if (!found) continue
    const breaking = found[2] === '!' || body.some((line) => /^BREAKING[ -]CHANGE:/.test(line))
    const kind = RELEASED[found[1]!.toLowerCase()]
    if (breaking) larger(major === 0 ? 'minor' : 'major')
    else if (kind) larger(kind)
  }
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`
  return undefined
}
