/**
 * Unit tests for src/comment.ts
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import * as githubModule from '../__fixtures__/github.js'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => githubModule)

const { buildCommentBody, isPullRequestEvent, postScanComment } =
  await import('../src/comment.js')

const listComments = jest.fn()
const createComment = jest.fn()
const updateComment = jest.fn()

describe('comment.ts', () => {
  beforeEach(() => {
    jest.resetAllMocks()

    githubModule.context.eventName = 'push'
    githubModule.context.payload = {}

    listComments.mockResolvedValue({ data: [] })
    githubModule.getOctokit.mockReturnValue({
      rest: {
        issues: { listComments, createComment, updateComment }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
  })

  describe('isPullRequestEvent', () => {
    it('is false for non pull request events', () => {
      githubModule.context.eventName = 'push'
      expect(isPullRequestEvent()).toBe(false)
    })

    it('is true for pull_request events with a pull_request payload', () => {
      githubModule.context.eventName = 'pull_request'
      githubModule.context.payload = { pull_request: { number: 42 } }
      expect(isPullRequestEvent()).toBe(true)
    })

    it('is true for pull_request_target events with a pull_request payload', () => {
      githubModule.context.eventName = 'pull_request_target'
      githubModule.context.payload = { pull_request: { number: 42 } }
      expect(isPullRequestEvent()).toBe(true)
    })

    it('is false for pull_request events without a pull_request payload', () => {
      githubModule.context.eventName = 'pull_request'
      githubModule.context.payload = {}
      expect(isPullRequestEvent()).toBe(false)
    })
  })

  describe('buildCommentBody', () => {
    it('uses markdown output as-is', () => {
      const body = buildCommentBody('# Report\n\nfindings', 'markdown')
      expect(body).toContain('<!-- cerberauth/jwtop-action -->')
      expect(body).toContain('# Report\n\nfindings')
    })

    it('wraps non-markdown output in a fenced code block', () => {
      const body = buildCommentBody('{"foo":"bar"}', 'json')
      expect(body).toContain('```json\n{"foo":"bar"}\n```')
    })

    it('truncates output longer than the GitHub comment limit', () => {
      const huge = 'x'.repeat(70000)
      const body = buildCommentBody(huge, 'markdown')
      expect(body.length).toBeLessThanOrEqual(65536)
      expect(body).toContain('truncated')
    })
  })

  describe('postScanComment', () => {
    it('does nothing when there is no pull request in the payload', async () => {
      githubModule.context.payload = {}

      await postScanComment('token', 'body')

      expect(githubModule.getOctokit).not.toHaveBeenCalled()
    })

    it('creates a new comment when none exists yet', async () => {
      githubModule.context.payload = { pull_request: { number: 7 } }

      await postScanComment('token', 'body')

      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'cerberauth',
          repo: 'jwtop-action',
          issue_number: 7,
          body: 'body'
        })
      )
      expect(updateComment).not.toHaveBeenCalled()
    })

    it('updates the existing comment carrying the marker', async () => {
      githubModule.context.payload = { pull_request: { number: 7 } }
      listComments.mockResolvedValue({
        data: [
          { id: 1, body: 'unrelated comment' },
          { id: 2, body: '<!-- cerberauth/jwtop-action -->\nold results' }
        ]
      })

      await postScanComment('token', '<!-- cerberauth/jwtop-action -->\nnew')

      expect(updateComment).toHaveBeenCalledWith(
        expect.objectContaining({ comment_id: 2 })
      )
      expect(createComment).not.toHaveBeenCalled()
    })

    it('warns instead of throwing when the API call fails', async () => {
      githubModule.context.payload = { pull_request: { number: 7 } }
      listComments.mockRejectedValue(new Error('Resource not accessible'))

      await expect(postScanComment('token', 'body')).resolves.not.toThrow()

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Resource not accessible')
      )
    })
  })
})
