import { debug, info, warning } from '@actions/core'
import { context, getOctokit } from '@actions/github'

const COMMENT_MARKER = '<!-- cerberauth/jwtop-action -->'

// GitHub caps issue/PR comment bodies at 65536 characters.
const MAX_COMMENT_LENGTH = 65536

export function isPullRequestEvent(): boolean {
  return (
    (context.eventName === 'pull_request' ||
      context.eventName === 'pull_request_target') &&
    context.payload.pull_request != null
  )
}

export function buildCommentBody(output: string, format: string): string {
  const body =
    format === 'markdown' || format === 'md'
      ? output
      : '```' + format + '\n' + output + '\n```'

  let comment = `${COMMENT_MARKER}\n${body}`
  if (comment.length > MAX_COMMENT_LENGTH) {
    comment = `${comment.slice(
      0,
      MAX_COMMENT_LENGTH - 100
    )}\n\n_…output truncated…_`
  }
  return comment
}

// Creates or updates the PR comment carrying the scan results. Any failure
// (most commonly a token without pull-requests/issues write access, e.g. on
// forked-repo pull requests) is logged as a warning rather than failing the
// action, since commenting is a best-effort convenience on top of the scan.
export async function postScanComment(
  token: string,
  body: string
): Promise<void> {
  const pullRequest = context.payload.pull_request
  if (!pullRequest) {
    debug('Not running for a pull request, skipping comment')
    return
  }

  const { owner, repo } = context.repo
  const issue_number = pullRequest.number

  try {
    const octokit = getOctokit(token)

    const comments = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number
    })
    const existing = comments.data.find((c) => c.body?.includes(COMMENT_MARKER))

    if (existing) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existing.id,
        body
      })
      info(`Updated scan results comment on PR #${issue_number}`)
    } else {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number,
        body
      })
      info(`Created scan results comment on PR #${issue_number}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warning(
      `Skipping PR comment (does the token have pull-requests: write permission?): ${message}`
    )
  }
}
