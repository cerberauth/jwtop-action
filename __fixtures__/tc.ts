import type * as tcTypes from '@actions/tool-cache'
import { jest } from '@jest/globals'

export const find = jest.fn<typeof tcTypes.find>()
export const downloadTool = jest.fn<typeof tcTypes.downloadTool>()
export const cacheDir = jest.fn<typeof tcTypes.cacheDir>()
export const cacheFile = jest.fn<typeof tcTypes.cacheFile>()
export const extractTar = jest.fn<typeof tcTypes.extractTar>()
export const extractZip = jest.fn<typeof tcTypes.extractZip>()
