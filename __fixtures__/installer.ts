import type * as installer from '../src/installer.js'
import { jest } from '@jest/globals'

export const installVersion = jest.fn<typeof installer.installVersion>()
