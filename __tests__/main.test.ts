/**
 * Unit tests for the action's main functionality, src/main.ts
 */
import { jest } from '@jest/globals'
import type { Stats } from 'fs'
import * as core from '../__fixtures__/core.js'
import * as execModule from '../__fixtures__/exec.js'
import * as fsModule from '../__fixtures__/fs.js'
import * as githubModule from '../__fixtures__/github.js'
import * as installer from '../__fixtures__/installer.js'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/exec', () => execModule)
jest.unstable_mockModule('@actions/github', () => githubModule)
jest.unstable_mockModule('fs/promises', () => fsModule)
jest.unstable_mockModule('../src/installer.js', () => installer)

const { run } = await import('../src/main.js')

const INSTALL_DIR = '/opt/hostedtoolcache/jwtop/v0.9.0/x64'
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.sig' // gitleaks:allow

const REPORT = JSON.stringify({
  metadata: { total: 2, by_severity: { critical: 2 } },
  findings: [
    { title: 'Weak Secret', severity: 'critical', status: 'active' },
    { title: 'Blank Secret', severity: 'critical', status: 'mitigated' }
  ]
})

const listComments = jest.fn()
const createComment = jest.fn()
const updateComment = jest.fn()

function mockInputs(inputs: Record<string, string>) {
  core.getInput.mockImplementation(
    (name: string) => ({ version: 'latest', ...inputs })[name] ?? ''
  )
}

function mockReportWritten(written: boolean) {
  if (written) {
    fsModule.stat.mockResolvedValue({ isFile: () => true } as Stats)
  } else {
    fsModule.stat.mockRejectedValue(new Error('ENOENT'))
  }
}

function mockPullRequest(number: number) {
  githubModule.context.eventName = 'pull_request'
  githubModule.context.payload = { pull_request: { number } }
}

function jwtopArgs(): string[] {
  return execModule.exec.mock.calls[0][1] as string[]
}

function flagValue(flag: string): string | undefined {
  const args = jwtopArgs()
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}

describe('main.ts', () => {
  beforeEach(() => {
    mockInputs({})
    installer.installVersion.mockResolvedValue(INSTALL_DIR)
    installer.getToken.mockReturnValue('gh-token')
    execModule.exec.mockResolvedValue(0)
    fsModule.readFile.mockResolvedValue(REPORT)
    fsModule.rm.mockResolvedValue(undefined)
    mockReportWritten(true)

    githubModule.context.eventName = 'push'
    githubModule.context.payload = {}
    listComments.mockResolvedValue({ data: [] })
    githubModule.getOctokit.mockReturnValue({
      paginate: async (
        endpoint: (params: unknown) => Promise<{ data: unknown[] }>,
        params: unknown
      ) => (await endpoint(params)).data,
      rest: { issues: { listComments, createComment, updateComment } }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('installs jwtop and adds it to the PATH', async () => {
    await run()

    expect(installer.installVersion).toHaveBeenCalledWith('latest')
    expect(core.addPath).toHaveBeenCalledWith(INSTALL_DIR)
    expect(core.setOutput).toHaveBeenCalledWith('jwtop-path', INSTALL_DIR)
  })

  it('does not execute jwtop when command input is empty', async () => {
    await run()

    expect(execModule.exec).not.toHaveBeenCalled()
    expect(core.setOutput).not.toHaveBeenCalledWith('output', expect.anything())
  })

  it('runs a command with its args and exposes stdout', async () => {
    mockInputs({ command: 'decode', args: TOKEN })
    execModule.exec.mockImplementation(async (_cmd, _args, options) => {
      options?.listeners?.stdout?.(Buffer.from('{"sub":"1234"}\n'))
      return 0
    })

    await run()

    expect(execModule.exec).toHaveBeenCalledWith(
      'jwtop',
      ['decode', TOKEN],
      expect.objectContaining({ ignoreReturnCode: true })
    )
    expect(core.setOutput).toHaveBeenCalledWith('output', '{"sub":"1234"}')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('appends --sqa-opt-out when telemetry is disabled', async () => {
    mockInputs({ command: 'decode', args: TOKEN, telemetry: 'false' })

    await run()

    expect(jwtopArgs()).toEqual(['decode', TOKEN, '--sqa-opt-out'])
  })

  it('fails when a non-crack command exits non-zero', async () => {
    mockInputs({ command: 'verify', args: `${TOKEN} --secret wrong` })
    execModule.exec.mockResolvedValue(1)

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'jwtop verify failed with exit code 1'
    )
  })

  it('calls setFailed when installVersion throws', async () => {
    installer.installVersion.mockRejectedValue(new Error('download failed'))

    await run()

    expect(core.setFailed).toHaveBeenCalledWith('download failed')
  })

  describe('crack as a CI gate', () => {
    beforeEach(() => {
      mockInputs({ command: 'crack', args: TOKEN })
    })

    it('fails when jwtop finds a vulnerability (exit code 0)', async () => {
      execModule.exec.mockResolvedValue(0)

      await run()

      expect(core.setFailed).toHaveBeenCalledWith(
        'jwtop found vulnerabilities in the token'
      )
    })

    it('passes when the scan completes without a vulnerability (exit code 1 with a report)', async () => {
      execModule.exec.mockResolvedValue(1)
      mockReportWritten(true)

      await run()

      expect(core.setFailed).not.toHaveBeenCalled()
    })

    it('fails when jwtop errors before writing its report', async () => {
      execModule.exec.mockResolvedValue(1)
      mockReportWritten(false)

      await run()

      expect(core.setFailed).toHaveBeenCalledWith(
        'jwtop crack failed with exit code 1'
      )
    })

    it('fails on unexpected exit codes', async () => {
      execModule.exec.mockResolvedValue(2)

      await run()

      expect(core.setFailed).toHaveBeenCalledWith(
        'jwtop crack failed with exit code 2'
      )
    })

    it('always asks jwtop for a JSON report file, then removes it', async () => {
      await run()

      const reportPath = flagValue('--output')
      expect(reportPath).toContain('reportx-report-')
      expect(flagValue('--output-format')).toBe('json')
      expect(fsModule.rm).toHaveBeenCalledWith(reportPath, { force: true })
      expect(core.setOutput).not.toHaveBeenCalledWith(
        'report-path',
        expect.anything()
      )
    })

    it('uses a persisted output-format report, removing a stale one first', async () => {
      mockInputs({
        command: 'crack',
        args: TOKEN,
        'output-format': 'sarif',
        'output-path': './jwtop.sarif.json'
      })
      execModule.exec.mockResolvedValue(1)

      await run()

      expect(jwtopArgs().filter((a) => a === '--output')).toHaveLength(1)
      expect(flagValue('--output-format')).toBe('sarif')
      expect(fsModule.rm).toHaveBeenCalledWith('./jwtop.sarif.json', {
        force: true
      })
      expect(fsModule.rm.mock.invocationCallOrder[0]).toBeLessThan(
        execModule.exec.mock.invocationCallOrder[0]
      )
      expect(core.setOutput).toHaveBeenCalledWith(
        'report-path',
        './jwtop.sarif.json'
      )
      expect(core.setFailed).not.toHaveBeenCalled()
    })
  })

  describe('pull request comment', () => {
    beforeEach(() => {
      mockPullRequest(9)
      mockInputs({ command: 'crack', args: TOKEN })
    })

    it('comments the active findings, then fails the step', async () => {
      await run()

      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          issue_number: 9,
          body: expect.stringContaining('| Weak Secret |')
        })
      )
      expect(createComment.mock.invocationCallOrder[0]).toBeLessThan(
        core.setFailed.mock.invocationCallOrder[0]
      )
    })

    it('keeps a separate comment per scan-id', async () => {
      mockInputs({ command: 'crack', args: TOKEN, 'scan-id': 'staging' })

      await run()

      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringMatching(/^<!-- cerberauth\/jwtop\/staging -->/)
        })
      )
    })

    it('reuses a persisted JSON report for the comment and keeps it', async () => {
      mockInputs({
        command: 'crack',
        args: TOKEN,
        'output-format': 'json',
        'output-path': './jwtop.json'
      })

      await run()

      expect(fsModule.readFile).toHaveBeenCalledWith('./jwtop.json', 'utf8')
      expect(createComment).toHaveBeenCalled()
      expect(fsModule.rm).toHaveBeenCalledTimes(1)
      expect(fsModule.rm.mock.invocationCallOrder[0]).toBeLessThan(
        execModule.exec.mock.invocationCallOrder[0]
      )
    })

    it('warns and skips the comment when the persisted report is not JSON', async () => {
      mockInputs({
        command: 'crack',
        args: TOKEN,
        'output-format': 'markdown'
      })

      await run()

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('needs a JSON report')
      )
      expect(createComment).not.toHaveBeenCalled()
    })

    it('does not comment when the comment input is false', async () => {
      mockInputs({ command: 'crack', args: TOKEN, comment: 'false' })

      await run()

      expect(createComment).not.toHaveBeenCalled()
    })

    it('does not comment for commands without report support', async () => {
      mockInputs({ command: 'decode', args: TOKEN })

      await run()

      expect(jwtopArgs()).not.toContain('--output')
      expect(createComment).not.toHaveBeenCalled()
    })

    it('warns instead of failing when the report cannot be read', async () => {
      execModule.exec.mockResolvedValue(1)
      fsModule.readFile.mockRejectedValue(new Error('EACCES'))

      await run()

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('EACCES')
      )
      expect(core.setFailed).not.toHaveBeenCalled()
    })
  })
})
