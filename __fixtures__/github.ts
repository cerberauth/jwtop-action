import type * as github from '@actions/github'
import { jest } from '@jest/globals'

export const context: typeof github.context = {
  payload: {},
  eventName: '',
  sha: '',
  ref: '',
  workflow: '',
  action: '',
  actor: '',
  job: '',
  runAttempt: 0,
  runNumber: 0,
  runId: 0,
  apiUrl: 'https://api.github.com',
  serverUrl: 'https://github.com',
  graphqlUrl: 'https://api.github.com/graphql',
  get repo() {
    return { owner: 'owner', repo: 'repo' }
  },
  get issue() {
    return { owner: 'owner', repo: 'repo', number: 0 }
  }
}

export const getOctokit = jest.fn<typeof github.getOctokit>()
