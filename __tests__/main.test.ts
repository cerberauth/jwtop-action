/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import * as githubFixture from '../__fixtures__/github.js'
import { wait } from '../__fixtures__/wait.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => githubFixture)
jest.unstable_mockModule('../src/wait.js', () => ({ wait }))

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main.js')

describe('main.ts', () => {
  beforeEach(() => {
    // Set the action's inputs as return values from core.getInput().
    core.getInput.mockImplementation((name: string) => {
      if (name === 'milliseconds') return '500'
      if (name === 'github-token') return ''
      return ''
    })

    // Mock the wait function so that it does not actually wait.
    wait.mockImplementation(() => Promise.resolve('done!'))

    // Reset context payload to non-PR by default
    githubFixture.context.payload = {}
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('Sets the time output', async () => {
    await run()

    // Verify the time output was set.
    expect(core.setOutput).toHaveBeenNthCalledWith(
      1,
      'time',
      // Simple regex to match a time string in the format HH:MM:SS.
      expect.stringMatching(/^\d{2}:\d{2}:\d{2}/)
    )
  })

  it('Sets a failed status', async () => {
    // Clear the getInput mock and return an invalid value.
    core.getInput.mockClear().mockReturnValueOnce('this is not a number')

    // Clear the wait mock and return a rejected promise.
    wait
      .mockClear()
      .mockRejectedValueOnce(new Error('milliseconds is not a number'))

    await run()

    // Verify that the action was marked as failed.
    expect(core.setFailed).toHaveBeenNthCalledWith(
      1,
      'milliseconds is not a number'
    )
  })

  it('Posts a comment when running in a PR context', async () => {
    const createComment = jest.fn<() => Promise<void>>().mockResolvedValue()
    githubFixture.getOctokit.mockReturnValue({
      rest: { issues: { createComment } }
    } as never)

    core.getInput.mockImplementation((name: string) => {
      if (name === 'milliseconds') return '500'
      if (name === 'github-token') return 'fake-token'
      return ''
    })

    githubFixture.context.payload = { pull_request: { number: 42 } }

    await run()

    expect(githubFixture.getOctokit).toHaveBeenCalledWith('fake-token')
    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'owner',
        repo: 'repo',
        issue_number: 42,
        body: expect.stringContaining('Action completed at')
      })
    )
  })

  it('Does not post a comment when not in a PR context', async () => {
    core.getInput.mockImplementation((name: string) => {
      if (name === 'milliseconds') return '500'
      if (name === 'github-token') return 'fake-token'
      return ''
    })

    githubFixture.context.payload = {}

    await run()

    expect(githubFixture.getOctokit).not.toHaveBeenCalled()
  })

  it('Does not post a comment when github-token is not provided', async () => {
    core.getInput.mockImplementation((name: string) => {
      if (name === 'milliseconds') return '500'
      if (name === 'github-token') return ''
      return ''
    })

    githubFixture.context.payload = { pull_request: { number: 42 } }

    await run()

    expect(githubFixture.getOctokit).not.toHaveBeenCalled()
  })
})
