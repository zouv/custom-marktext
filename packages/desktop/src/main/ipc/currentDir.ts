// IPC handler for the sidebar "Current Directory" tree (CUSTOM-20261016-001).
//
// Registered from registerSandboxIpcHandlers(), which runs before the main
// Accessor exists, so this module stays self-contained.

import { ipcMain } from 'electron'
import { readCurrentDirEntries } from '../currentDir/reader'

export const registerCurrentDirHandlers = (): void => {
  ipcMain.handle('mt::currentdir::read', (_e, dirPath: string) => readCurrentDirEntries(dirPath))
}
