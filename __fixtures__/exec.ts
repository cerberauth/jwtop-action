import type * as execTypes from '@actions/exec'
import { jest } from '@jest/globals'

export const exec = jest.fn<typeof execTypes.exec>()
export const getExecOutput = jest.fn<typeof execTypes.getExecOutput>()
