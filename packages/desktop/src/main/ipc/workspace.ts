// IPC handlers for the multi-root Workspace panel (CUSTOM-20261009-001).
//
// Registered from registerSandboxIpcHandlers(), which runs before the main
// Accessor exists — so this module stays self-contained (app / dialog /
// BrowserWindow only) and never reaches into preferences or the window manager.
// Registering its own `browser-window-created` hook for teardown keeps
// windowManager.ts untouched.

import path from 'path'
import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { normalizeAndResolvePath } from '../filesystem'
import { readRoot } from '../workspace/reader'
import WorkspaceWatcher from '../workspace/watcher'
import { addRecent, clearRecents, getRecents } from '../workspace/recents'
import {
  WORKSPACE_FILE_FILTERS,
  buildDescriptor,
  hasWorkspaceExtension,
  readWorkspace,
  reconcileRoots,
  writeWorkspace
} from '../workspace/file'
import { clearSession, pruneOldSessions, readSession, writeSession } from '../workspace/session'
import { WORKSPACE_FILE_EXTENSION } from '@shared/types/workspace'
import type {
  SaveWorkspacePayload,
  WorkspaceRoot,
  WorkspaceRootSnapshot,
  WorkspaceSession
} from '@shared/types/workspace'

interface WindowWorkspaceState {
  roots: WorkspaceRoot[]
  watcher: WorkspaceWatcher
}

const states = new Map<number, WindowWorkspaceState>()

const resolveWindow = (event: IpcMainInvokeEvent | Electron.IpcMainEvent): BrowserWindow | null =>
  BrowserWindow.fromWebContents(event.sender)

const getRestoreBufferId = (win: BrowserWindow | null): string | undefined =>
  (win as unknown as { restoreBufferId?: string } | null)?.restoreBufferId

const getState = (win: BrowserWindow): WindowWorkspaceState => {
  let state = states.get(win.id)
  if (!state) {
    const watcher = new WorkspaceWatcher((event) => {
      if (!win.isDestroyed()) {
        win.webContents.send('mt::workspace::tree-event', event)
      }
    })
    state = { roots: [], watcher }
    states.set(win.id, state)
  }
  return state
}

/**
 * Point a window's watchers at `roots`, unwatching removed folders and reading a
 * snapshot for each newly added one. Existing roots keep their trees, so adding
 * a folder does not re-read the ones already open.
 */
const reconcileWatchers = async(
  state: WindowWorkspaceState,
  roots: WorkspaceRoot[]
): Promise<WorkspaceRootSnapshot[]> => {
  const nextPaths = new Set(roots.map((root) => root.path))
  for (const previous of state.roots) {
    if (!nextPaths.has(previous.path)) {
      state.watcher.unwatch(previous.path)
    }
  }

  const knownPaths = new Set(state.roots.map((root) => root.path))
  const added = roots.filter((root) => !knownPaths.has(root.path))
  state.roots = roots

  for (const root of added) {
    state.watcher.watch(root.path)
  }

  return Promise.all(added.map((root) => readRoot(root)))
}

const closeWindowState = (winId: number): void => {
  const state = states.get(winId)
  if (!state) return
  state.watcher.close()
  states.delete(winId)
}

const appendWorkspaceExtension = (filePath: string): string =>
  hasWorkspaceExtension(filePath) ? filePath : `${filePath}.${WORKSPACE_FILE_EXTENSION}`

export const registerWorkspaceHandlers = (): void => {
  ipcMain.handle('mt::workspace::pick-folders', async(event) => {
    const win = resolveWindow(event)
    if (!win) return []
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'multiSelections', 'createDirectory']
    })
    if (canceled || !filePaths) return []
    return filePaths.map((filePath) => normalizeAndResolvePath(filePath))
  })

  ipcMain.handle('mt::workspace::open', async(event, filePath?: string) => {
    const win = resolveWindow(event)
    if (!win) return null

    let target = filePath
    if (!target) {
      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: WORKSPACE_FILE_FILTERS
      })
      if (canceled || !filePaths?.[0]) return null
      target = filePaths[0]
    }

    const resolved = normalizeAndResolvePath(target)
    const { descriptor, roots, missing } = await readWorkspace(resolved)
    const state = getState(win)
    const snapshots = await reconcileWatchers(state, roots)
    addRecent(resolved)

    return { workspaceFilePath: resolved, descriptor, roots, snapshots, missing }
  })

  ipcMain.handle('mt::workspace::save', async(event, payload: SaveWorkspacePayload) => {
    const win = resolveWindow(event)
    if (!win) return null

    let target = payload.filePath
    if (!target) {
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: 'Save Workspace',
        // An absolute default: a bare file name would open the dialog in
        // whatever the process cwd happens to be (see the path-base pitfall).
        defaultPath: path.join(
          app.getPath('documents'),
          `${payload.name || 'workspace'}.${WORKSPACE_FILE_EXTENSION}`
        ),
        filters: WORKSPACE_FILE_FILTERS
      })
      if (canceled || !filePath) return null
      target = appendWorkspaceExtension(filePath)
    }

    const resolved = normalizeAndResolvePath(target)
    const descriptor = buildDescriptor(payload.name, payload.roots, resolved)
    await writeWorkspace(resolved, descriptor)
    addRecent(resolved)
    return { workspaceFilePath: resolved, descriptor }
  })

  ipcMain.handle('mt::workspace::set-roots', async(event, roots: WorkspaceRoot[]) => {
    const win = resolveWindow(event)
    if (!win) return []
    const state = getState(win)
    return reconcileWatchers(state, roots)
  })

  ipcMain.handle('mt::workspace::refresh-root', async(event, rootPath: string) => {
    const win = resolveWindow(event)
    if (!win) return null
    const state = getState(win)
    const root = state.roots.find((item) => item.path === rootPath)
    if (!root) return null
    return readRoot(root)
  })

  ipcMain.handle('mt::workspace::get-roots-status', async(event, roots: WorkspaceRoot[]) => {
    // Used on restore to drop roots that vanished while the app was closed.
    const win = resolveWindow(event)
    if (!win) return { roots, missing: [] as string[] }
    return reconcileRoots(roots)
  })

  ipcMain.handle('mt::workspace::get-recents', () => getRecents())

  ipcMain.on('mt::workspace::clear-recents', () => clearRecents())

  ipcMain.handle('mt::workspace::get-session', (event) => {
    const win = resolveWindow(event)
    const restoreBufferId = getRestoreBufferId(win)
    if (!restoreBufferId) return null
    return readSession(restoreBufferId)
  })

  ipcMain.on('mt::workspace::set-session', (event, session: WorkspaceSession) => {
    const win = resolveWindow(event)
    const restoreBufferId = getRestoreBufferId(win)
    if (!restoreBufferId) return
    try {
      writeSession(restoreBufferId, session)
    } catch {
      // Session persistence is best-effort; the panel keeps working in memory.
    }
  })

  ipcMain.on('mt::workspace::close', (event) => {
    const win = resolveWindow(event)
    if (!win) return
    closeWindowState(win.id)
    const restoreBufferId = getRestoreBufferId(win)
    if (restoreBufferId) {
      clearSession(restoreBufferId)
    }
  })

  // Teardown without touching windowManager.ts.
  app.on('browser-window-created', (_event, win) => {
    win.on('closed', () => closeWindowState(win.id))
  })

  app.whenReady().then(() => {
    pruneOldSessions()
  })
}
