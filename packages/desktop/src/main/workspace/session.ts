// Per-window workspace session persistence (CUSTOM-20261009-001).
//
// Stored next to the editor buffer stores but in its own directory: the
// workspace lifecycle is independent of tab saving, so it must not be coupled
// to EditorBufferStore's "delete when all tabs saved" cleanup.

import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import writeFileAtomic from 'write-file-atomic'
import { WORKSPACE_FILE_VERSION, type WorkspaceSession } from '@shared/types/workspace'

const SESSION_DIR_NAME = 'workspaceStates'
const SESSION_FILE_SUFFIX = '_workspace.json'
const MAX_SESSION_AGE_MS = 30 * 24 * 60 * 60 * 1000

const getSessionDir = (): string => path.join(app.getPath('userData'), SESSION_DIR_NAME)

const getSessionFile = (restoreBufferId: string): string =>
  path.join(getSessionDir(), `${restoreBufferId}${SESSION_FILE_SUFFIX}`)

export const readSession = (restoreBufferId: string): WorkspaceSession | null => {
  const filePath = getSessionFile(restoreBufferId)
  try {
    if (!fs.existsSync(filePath)) return null
    const content = fs.readFileSync(filePath, 'utf8')
    if (!content.trim()) return null
    const parsed = JSON.parse(content) as WorkspaceSession
    if (!parsed || !Array.isArray(parsed.roots)) return null
    return {
      version: typeof parsed.version === 'number' ? parsed.version : WORKSPACE_FILE_VERSION,
      workspaceFilePath: typeof parsed.workspaceFilePath === 'string' ? parsed.workspaceFilePath : null,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      roots: parsed.roots.filter(
        (root) => !!root && typeof root.path === 'string' && typeof root.name === 'string'
      )
    }
  } catch {
    return null
  }
}

export const writeSession = (restoreBufferId: string, session: WorkspaceSession): void => {
  const dir = getSessionDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  writeFileAtomic.sync(getSessionFile(restoreBufferId), JSON.stringify(session), 'utf8')
}

export const clearSession = (restoreBufferId: string): void => {
  try {
    const filePath = getSessionFile(restoreBufferId)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch {
    // Best-effort: a stale file is pruned on the next startup anyway.
  }
}

/**
 * Drop session files for windows that no longer exist. Age-based rather than
 * cross-checking editor buffer files, which are deleted independently and would
 * make cleanup order-dependent.
 */
export const pruneOldSessions = (): void => {
  const dir = getSessionDir()
  try {
    if (!fs.existsSync(dir)) return
    const now = Date.now()
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(SESSION_FILE_SUFFIX)) continue
      const filePath = path.join(dir, entry.name)
      try {
        const stats = fs.statSync(filePath)
        if (now - stats.mtimeMs > MAX_SESSION_AGE_MS) {
          fs.unlinkSync(filePath)
        }
      } catch {
        // Ignore individual file failures.
      }
    }
  } catch {
    // Ignore: cleanup is opportunistic.
  }
}
