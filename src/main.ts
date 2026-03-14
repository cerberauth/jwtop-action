import * as core from '@actions/core'
import * as github from '@actions/github'
import { wait } from './wait.js'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const ms: string = core.getInput('milliseconds')

    // Debug logs are only output if the `ACTIONS_STEP_DEBUG` secret is true
    core.debug(`Waiting ${ms} milliseconds ...`)

    // Log the current timestamp, wait, then log the new timestamp
    core.debug(new Date().toTimeString())
    await wait(parseInt(ms, 10))
    core.debug(new Date().toTimeString())

    const time = new Date().toTimeString()

    // Set outputs for other workflow steps to use
    core.setOutput('time', time)

    // Post a comment on the PR if running in a pull request context
    const pr = github.context.payload.pull_request
    if (pr) {
      const token = core.getInput('github-token')
      if (token) {
        const octokit = github.getOctokit(token)
        const { owner, repo } = github.context.repo
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: pr.number,
          body: `Action completed at ${time}`
        })
      }
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
