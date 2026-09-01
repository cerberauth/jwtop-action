/**
 * Unit tests for the action's main functionality, src/main.ts
 */
import { jest } from '@jest/globals'
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

const INSTALL_DIR = '/opt/hostedtoolcache/jwtop/v0.2.0/x64'

const listComments = jest.fn()
const createComment = jest.fn()
const updateComment = jest.fn()

describe('main.ts', () => {
  beforeEach(() => {
    jest.resetAllMocks()

    core.getInput.mockImplementation((name: string) => {
      if (name === 'version') return 'latest'
      return ''
    })

    installer.installVersion.mockResolvedValue(INSTALL_DIR)
    installer.getToken.mockReturnValue('gh-token')
    execModule.exec.mockResolvedValue(0)
    fsModule.readFile.mockResolvedValue('# JWT Security Scan\n\nfull report')
    fsModule.rm.mockResolvedValue(undefined)

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

  it('runs command with args when both are provided', async () => {
    core.getInput.mockImplementation((name: string) => {
      if (name === 'version') return 'v0.2.0'
      if (name === 'command') return 'decode'
      if (name === 'args') return 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.sig'
      return ''
    })

    await run()

    expect(execModule.exec).toHaveBeenCalledWith(
      'jwtop',
      ['decode', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.sig'],
      expect.objectContaining({ listeners: expect.any(Object) })
    )
  })

  it('splits multiple args correctly', async () => {
    core.getInput.mockImplementation((name: string) => {
      if (name === 'version') return 'v0.2.0'
      if (name === 'command') return 'crack'
      if (name === 'args')
        return '--url https://api.example.com/auth --wordlist ./words.txt'
      return ''
    })

    await run()

    expect(execModule.exec).toHaveBeenCalledWith(
      'jwtop',
      [
        'crack',
        '--url',
        'https://api.example.com/auth',
        '--wordlist',
        './words.txt'
      ],
      expect.objectContaining({ listeners: expect.any(Object) })
    )
  })

  it('appends --sqa-opt-out when telemetry is disabled', async () => {
    core.getInput.mockImplementation((name: string) => {
      if (name === 'version') return 'v0.2.0'
      if (name === 'command') return 'decode'
      if (name === 'args') return 'eyJhbGciOiJIUzI1NiJ9.test'
      if (name === 'telemetry') return 'false'
      return ''
    })

    await run()

    expect(execModule.exec).toHaveBeenCalledWith(
      'jwtop',
      ['decode', 'eyJhbGciOiJIUzI1NiJ9.test', '--sqa-opt-out'],
      expect.objectContaining({ listeners: expect.any(Object) })
    )
  })

  it('calls setFailed when installVersion throws', async () => {
    installer.installVersion.mockRejectedValue(new Error('download failed'))

    await run()

    expect(core.setFailed).toHaveBeenCalledWith('download failed')
  })

  describe('PR comment', () => {
    beforeEach(() => {
      githubModule.context.eventName = 'pull_request'
      githubModule.context.payload = { pull_request: { number: 9 } }
      execModule.exec.mockImplementation(async (_cmd, _args, options) => {
        options?.listeners?.stdout?.(Buffer.from('# JWT Security Scan\n'))
        return 0
      })
    })

    it('asks jwtop for a full markdown report file and comments with it', async () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return 'crack'
        if (name === 'args') return '--url https://api.example.com/protected'
        return ''
      })

      await run()

      expect(execModule.exec).toHaveBeenCalledWith(
        'jwtop',
        [
          'crack',
          '--url',
          'https://api.example.com/protected',
          '--output',
          expect.stringContaining('jwtop-report-'),
          '--output-format',
          'markdown'
        ],
        expect.objectContaining({ listeners: expect.any(Object) })
      )
      // The terminal output itself is left untouched.
      expect(core.setOutput).toHaveBeenCalledWith(
        'output',
        '# JWT Security Scan'
      )
      expect(fsModule.readFile).toHaveBeenCalledWith(
        expect.stringContaining('jwtop-report-'),
        'utf8'
      )
      expect(fsModule.rm).toHaveBeenCalledWith(
        expect.stringContaining('jwtop-report-'),
        { force: true }
      )
      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          issue_number: 9,
          body: expect.stringContaining('full report')
        })
      )
    })

    it('reuses an explicit markdown --output for the comment, and keeps it', async () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return 'crack'
        if (name === 'args')
          return '--url https://api.example.com --output ./report.md --output-format markdown'
        return ''
      })

      await run()

      expect(execModule.exec).toHaveBeenCalledWith(
        'jwtop',
        [
          'crack',
          '--url',
          'https://api.example.com',
          '--output',
          './report.md',
          '--output-format',
          'markdown'
        ],
        expect.objectContaining({ listeners: expect.any(Object) })
      )
      expect(fsModule.readFile).toHaveBeenCalledWith('./report.md', 'utf8')
      expect(fsModule.rm).not.toHaveBeenCalled()
      expect(core.setOutput).toHaveBeenCalledWith('report-path', './report.md')
      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('full report')
        })
      )
    })

    it('falls back to stdout for the comment when --output is a non-markdown format', async () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return 'crack'
        if (name === 'args')
          return '--url https://api.example.com --output ./report.json --output-format json'
        return ''
      })

      await run()

      expect(fsModule.readFile).not.toHaveBeenCalled()
      expect(core.setOutput).toHaveBeenCalledWith(
        'report-path',
        './report.json'
      )
      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('# JWT Security Scan')
        })
      )
    })

    it('exposes report-path when output-format is set', async () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return 'crack'
        if (name === 'args') return '--url https://api.example.com'
        if (name === 'output-format') return 'sarif'
        if (name === 'output-path') return './report.sarif.json'
        return ''
      })

      await run()

      expect(execModule.exec).toHaveBeenCalledWith(
        'jwtop',
        [
          'crack',
          '--url',
          'https://api.example.com',
          '--output',
          './report.sarif.json',
          '--output-format',
          'sarif'
        ],
        expect.objectContaining({ listeners: expect.any(Object) })
      )
      expect(core.setOutput).toHaveBeenCalledWith(
        'report-path',
        './report.sarif.json'
      )
      // sarif isn't markdown, so the comment falls back to stdout.
      expect(fsModule.readFile).not.toHaveBeenCalled()
      expect(createComment).toHaveBeenCalled()
    })

    it('warns and skips the comment when the report file cannot be read', async () => {
      fsModule.readFile.mockRejectedValue(new Error('ENOENT'))
      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return 'crack'
        if (name === 'args') return '--url https://api.example.com'
        return ''
      })

      await run()

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('ENOENT')
      )
      expect(createComment).not.toHaveBeenCalled()
    })

    it('skips commenting for commands without report support', async () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return 'decode'
        if (name === 'args') return 'eyJhbGciOiJIUzI1NiJ9.test'
        return ''
      })

      await run()

      expect(createComment).not.toHaveBeenCalled()
    })

    it('skips commenting when comment input is false', async () => {
      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return 'crack'
        if (name === 'args') return '--url https://api.example.com'
        if (name === 'comment') return 'false'
        return ''
      })

      await run()

      expect(execModule.exec).toHaveBeenCalledWith(
        'jwtop',
        ['crack', '--url', 'https://api.example.com'],
        expect.objectContaining({ listeners: expect.any(Object) })
      )
      expect(createComment).not.toHaveBeenCalled()
    })

    it('skips commenting outside of pull request runs', async () => {
      githubModule.context.eventName = 'push'
      githubModule.context.payload = {}
      core.getInput.mockImplementation((name: string) => {
        if (name === 'command') return 'crack'
        if (name === 'args') return '--url https://api.example.com'
        return ''
      })

      await run()

      expect(createComment).not.toHaveBeenCalled()
    })
  })
})
