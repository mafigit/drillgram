import { runIssueProviderContract } from '../contract'
import { FakeIssueProvider } from '../fake-provider'

runIssueProviderContract('fake', (seed) => {
  const project = {
    provider: 'gitea',
    baseUrl: 'https://git.example.org',
    project: 'acme/app',
  } as const
  return { project, provider: new FakeIssueProvider({ project, ...seed }) }
})
