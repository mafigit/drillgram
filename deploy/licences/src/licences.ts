// The licence gate: every package the app is built with (npm) and every crate of the layout
// engine must be under a licence of the allow-list (licences.allow.json), or be excepted there
// by name, with the reason. The package managers say the licences (`pnpm licenses list`,
// `cargo metadata`); this judges them.

export interface Package {
  name: string
  version: string
  /** As its manifest states it: an SPDX expression, usually. */
  licence: string | undefined
  from: 'npm' | 'crates'
}

export interface Allowed {
  /** SPDX ids a package may be under. */
  licences: string[]
  /** Packages let through under a licence that is not on the list. `package` may end in `*`. */
  exceptions: { package: string; licence: string; why: string }[]
}

/**
 * Whether an SPDX licence expression is met by licences of the list: one of an `OR`, all of an
 * `AND`. `X WITH exception` counts as `X` (an exception only allows more). What is no expression
 * is not allowed.
 */
export function allows(expression: string, licences: readonly string[]): boolean {
  // The old way of writing a choice: "MIT/Apache-2.0".
  const tokens = expression.replace(/\//g, ' OR ').match(/\(|\)|[^\s()]+/g) ?? []
  let at = 0
  // Each level gives whether it is allowed, or `undefined` where the text is no expression.
  const one = (): boolean | undefined => {
    const token = tokens[at++]
    if (token === undefined || token === ')' || token === 'AND' || token === 'OR' || token === 'WITH') return undefined
    if (token === '(') {
      const inner = either()
      return tokens[at++] === ')' ? inner : undefined
    }
    if (tokens[at] === 'WITH') {
      at++
      if (tokens[at++] === undefined) return undefined
    }
    return licences.includes(token)
  }
  const all = (): boolean | undefined => {
    let result = one()
    while (result !== undefined && tokens[at] === 'AND') {
      at++
      const next = one()
      result = next === undefined ? undefined : result && next
    }
    return result
  }
  const either = (): boolean | undefined => {
    let result = all()
    while (result !== undefined && tokens[at] === 'OR') {
      at++
      const next = all()
      result = next === undefined ? undefined : result || next
    }
    return result
  }
  const result = either()
  return result === true && at === tokens.length
}

const named = (pattern: string, name: string) => (pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern)

/** What is wrong with the packages' licences, in words, and the exceptions nothing needed. */
export function judge(packages: readonly Package[], allowed: Allowed): { problems: string[]; unused: string[] } {
  const used = new Set<string>()
  const problems: string[] = []
  for (const found of packages) {
    const who = `${found.name} ${found.version} (${found.from})`
    const exception = allowed.exceptions.find((e) => named(e.package, found.name) && e.licence === found.licence)
    if (exception) used.add(exception.package)
    else if (!found.licence) problems.push(`${who}: no licence is stated`)
    else if (!allows(found.licence, allowed.licences)) problems.push(`${who}: ${found.licence} is not an allowed licence`)
  }
  return { problems, unused: allowed.exceptions.map((e) => e.package).filter((pattern) => !used.has(pattern)) }
}
