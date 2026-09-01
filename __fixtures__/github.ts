import type * as github from '@actions/github'
import { jest } from '@jest/globals'

export const context = {
  eventName: 'push',
  repo: { owner: 'cerberauth', repo: 'jwtop-action' },
  payload: {} as { pull_request?: { number: number } }
}

export const getOctokit = jest.fn<typeof github.getOctokit>()
