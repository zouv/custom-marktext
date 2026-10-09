// Recently-opened workspace descriptors (CUSTOM-20261009-001).
//
// A global (not per-window) most-recent-first list, stored next to the other
// workspace state. Entries that no longer exist on disk are filtered on read so
// the menu never offers a dead path.

import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import writeFileAtomic from 'write-file-atomic'

const RECENTS_FILE_NAME = 'workspace-recents.json'
const MAX_RECENTS = 12

const getRecentsPath = (): string => path.join(app.getPath('userData'), RECENTS_FILE_NAME)

export const getRecents = (): string[] => {
  try {
    const filePath = getRecentsPath()
    if (!fs.existsSync(filePath)) return []
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === 'string' && fs.existsSync(item))
      .slice(0, MAX_RECENTS)
  } catch {
    // A corrupt recents file only costs the list; never block the panel.
    return []
  }
}

export const addRecent = (workspaceFilePath: string): void => {
  try {
    const next = [
      workspaceFilePath,
      ...getRecents().filter((item) => item !== workspaceFilePath)
    ].slice(0, MAX_RECENTS)
    writeFileAtomic.sync(getRecentsPath(), JSON.stringify(next), 'utf8')
  } catch {
    // Best-effort: recents are a convenience, not state the panel depends on.
  }
}

export const clearRecents = (): void => {
  try {
    writeFileAtomic.sync(getRecentsPath(), '[]', 'utf8')
  } catch {
    // Best-effort, as above.
  }
}
