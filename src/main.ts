import {
  addPath,
  debug,
  getInput,
  info,
  setFailed,
  setOutput
} from '@actions/core'
import { exec, ExecOptions } from '@actions/exec'

import { getToken, installVersion } from './installer.js'
import {
  prepareReport,
  publishReport,
  reportWritten,
  ScanReport
} from './report.js'

const REPORTABLE_COMMANDS = new Set(['crack'])

function parseArgs(args: string): string[] {
  if (!args.trim()) return []
  return args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
}

// jwtop crack exits 0 when the token is vulnerable, 1 when it is not.
async function crackFailure(
  exitCode: number,
  report: ScanReport
): Promise<string | undefined> {
  if (exitCode === 0) {
    return 'jwtop found vulnerabilities in the token'
  }
  if (exitCode === 1 && (await reportWritten(report))) {
    return undefined
  }
  return `jwtop crack failed with exit code ${exitCode}`
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

    if (!command) {
      return
    }

    const commandArgs = parseArgs(args)
    const report = REPORTABLE_COMMANDS.has(command)
      ? await prepareReport(commandArgs)
      : undefined

    const telemetry = getInput('telemetry')
    if (telemetry === 'false' || telemetry === '0') {
      commandArgs.push('--sqa-opt-out')
    }

    let output = ''
    const execOptions: ExecOptions = {
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString()
        }
      }
    }

    debug(`Running jwtop ${command} with args: ${args}`)
    const exitCode = await exec('jwtop', [command, ...commandArgs], execOptions)
    setOutput('output', output.trim())

    if (!report) {
      if (exitCode !== 0) {
        setFailed(`jwtop ${command} failed with exit code ${exitCode}`)
      }
      return
    }

    const failure = await crackFailure(exitCode, report)
    await publishReport(report, getToken())
    if (failure) {
      setFailed(failure)
    }
  } catch (error) {
    if (error instanceof Error) {
      return setFailed(error.message)
    }

    setFailed('An unknown error occurred')
  }
}
