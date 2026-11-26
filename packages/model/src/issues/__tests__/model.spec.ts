import { describe, it, expect } from 'vitest'
import { formatRef, parseRef } from '../model'
import type { IssueRef } from '../model'

describe('IssueRef', () => {
  it('ref round-trips through formatRef/parseRef', () => {
    const refs: IssueRef[] = [
      { provider: 'github', baseUrl: 'https://github.com', project: 'octo/repo', number: 7 },
      {
        provider: 'gitea',
        baseUrl: 'https://git.example.org/gitea',
        project: 'owner/repo',
        number: 2,
      },
      {
        provider: 'gitlab',
        baseUrl: 'https://gitlab.example.com',
        project: 'group/sub/project',
        number: 12,
      },
    ]
    for (const ref of refs) {
      expect(parseRef(formatRef(ref))).toEqual(ref)
    }
    expect(
      formatRef({ provider: 'gitea', baseUrl: 'https://host', project: 'owner/repo', number: 2 }),
    ).toBe('gitea:https://host/owner/repo#2')
  })

  it('parseRef rejects malformed refs', () => {
    const malformed = [
      '',
      'https://host/o/r#1',
      'bitbucket:https://host/o/r#1',
      'gitea:https://host/o/r',
      'gitea:https://host/o/r#0',
      'gitea:https://host/o/r#abc',
      'gitea:https://host/o/r#-1',
      'gitea:ftp://host/o/r#1',
      'github:https://github.com/owner#1',
      'gitlab:https://gitlab.com/project#1',
    ]
    for (const input of malformed) {
      expect(() => parseRef(input), input).toThrow()
    }
  })
})
