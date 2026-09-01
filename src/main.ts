import {
  addPath,
  debug,
  getInput,
  info,
  setFailed,
  setOutput,
  warning
} from '@actions/core'
import { exec, ExecOptions } from '@actions/exec'
import { rm, readFile } from 'fs/promises'

import {
  buildCommentBody,
  isPullRequestEvent,
  postScanComment
} from './comment.js'
import { getToken, installVersion } from './installer.js'
import {
  appendReportxFlags,
  parseFormatFlag,
  parseOutputFlags,
  tempReportPath
} from './reportx.js'

// Commands that register reportx's flags (--format, --output, --report-url,
// ...), currently only `crack`. The PR comment and the reportx passthrough
// inputs (output-format, report-url, ...) only apply to these.
const REPORTABLE_COMMANDS = new Set(['crack'])

function parseArgs(args: string): string[] {
  if (!args.trim()) return []
  return args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
}

export async function run(): Promise<void> {
  try {
    const version = getInput('version')
    const command = getInput('command')
    const args = getInput('args')

    info(`Setup jwtop version ${version}`)

    const installDir = await installVersion(version)
    info(`jwtop has been installed to ${installDir}`)

    addPath(installDir)
    setOutput('jwtop-path', installDir)
    info('jwtop has been added to the PATH')

    if (command) {
      const telemetry = getInput('telemetry')
      const extraArgs: string[] = []
      if (telemetry === 'false' || telemetry === '0') {
        extraArgs.push('--sqa-opt-out')
      }

      const commandArgs = parseArgs(args)
      const commentEnabled = getInput('comment') !== 'false'
      const isReportable = REPORTABLE_COMMANDS.has(command)
      const shouldComment =
        commentEnabled && isReportable && isPullRequestEvent()

      // Give first-class access to reportx's own capabilities (output
      // formats/files, HTTP transport, display flags) via dedicated inputs,
      // on top of whatever the caller already passed through `args`.
      if (isReportable) {
        appendReportxFlags(commandArgs)
      }

      // Whatever --output the caller ended up with (via `args` or the
      // output-format/output-path inputs above) is a deliberate, persistent
      // request - surface it as an output so it can be uploaded as an
      // artifact, fed to `github/codeql-action/upload-sarif`, etc.
      const persistedOutput = parseOutputFlags(commandArgs)

      // The terminal display (stdout, captured below as `output`) is left
      // untouched so it keeps showing whatever the command would normally
      // print. For the PR comment we want every finding - not just
      // vulnerable ones - so a report file (which reportx always fills with
      // every finding, unlike stdout) is used as the comment body instead.
      // Reuse the persisted --output if it's already markdown; otherwise
      // write one of our own to a temp file dedicated to the comment.
      let reportFilePath: string | undefined
      let ownsReportFile = false
      if (shouldComment) {
        if (persistedOutput.path) {
          if (
            persistedOutput.format === 'markdown' ||
            persistedOutput.format === 'md'
          ) {
            reportFilePath = persistedOutput.path
          }
        } else {
          reportFilePath = tempReportPath('markdown')
          ownsReportFile = true
          commandArgs.push(
            '--output',
            reportFilePath,
            '--output-format',
            'markdown'
          )
        }
      }

      let output = ''
      const execOptions: ExecOptions = {
        listeners: {
          stdout: (data: Buffer) => {
            output += data.toString()
          }
        }
      }

      debug(`Running jwtop ${command} with args: ${args}`)
      await exec('jwtop', [command, ...commandArgs, ...extraArgs], execOptions)
      output = output.trim()
      setOutput('output', output)

      if (persistedOutput.path) {
        setOutput('report-path', persistedOutput.path)
      }

      if (shouldComment) {
        let commentBody: string | undefined
        let commentFormat = 'markdown'

        if (reportFilePath) {
          try {
            commentBody = await readFile(reportFilePath, 'utf8')
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error)
            warning(`Could not read jwtop report for PR comment: ${message}`)
          } finally {
            if (ownsReportFile) {
              await rm(reportFilePath, { force: true }).catch(() => {})
            }
          }
        } else {
          // The report file is in a non-markdown format; fall back to
          // whatever the command printed to stdout instead.
          commentBody = output
          commentFormat = parseFormatFlag(commandArgs) ?? 'terminal'
        }

        if (commentBody) {
          await postScanComment(
            getToken(),
            buildCommentBody(commentBody, commentFormat)
          )
        }
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      return setFailed(error.message)
    }

    setFailed('An unknown error occurred')
  }
}
