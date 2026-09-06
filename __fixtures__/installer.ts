import type * as installer from '../src/installer.js'
import { jest } from '@jest/globals'

export const installVersion = jest.fn<typeof installer.installVersion>()
export const getToken = jest.fn<typeof installer.getToken>()
