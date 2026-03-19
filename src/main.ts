import {
  addPath,
  debug,
  getInput,
  info,
  setFailed,
  setOutput
} from '@actions/core'
import { exec, ExecOptions } from '@actions/exec'

import { installVersion } from './installer.js'

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

      let output = ''
      const execOptions: ExecOptions = {
        listeners: {
          stdout: (data: Buffer) => {
            output += data.toString()
          }
        }
      }

      debug(`Running jwtop ${command} with args: ${args}`)
      await exec(
        'jwtop',
        [command, ...parseArgs(args), ...extraArgs],
        execOptions
      )
      setOutput('output', output.trim())
    }
  } catch (error) {
    if (error instanceof Error) {
      return setFailed(error.message)
    }

    setFailed('An unknown error occurred')
  }
}
