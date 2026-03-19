/**
 * Unit tests for the action's main functionality, src/main.ts
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import * as execModule from '../__fixtures__/exec.js'
import * as installer from '../__fixtures__/installer.js'

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/exec', () => execModule)
jest.unstable_mockModule('../src/installer.js', () => installer)

const { run } = await import('../src/main.js')

const INSTALL_DIR = '/opt/hostedtoolcache/jwtop/v0.2.0/x64'

describe('main.ts', () => {
  beforeEach(() => {
    jest.resetAllMocks()

    core.getInput.mockImplementation((name: string) => {
      if (name === 'version') return 'latest'
      return ''
    })

    installer.installVersion.mockResolvedValue(INSTALL_DIR)
    execModule.exec.mockResolvedValue(0)
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
})
