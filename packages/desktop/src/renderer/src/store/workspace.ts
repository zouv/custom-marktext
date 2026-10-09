// Workspace panel store (CUSTOM-20261009-001).
//
// Self-contained: it never touches the single-root project store, so the Files
// panel, search, quick-open and image-relative-path logic keep working exactly
// as before. Incremental tree patches are applied with the existing
// store/treeCtrl helpers, each routed to its owning root.

import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { addFile, unlinkFile, addDirectory, unlinkDirectory, updateFileMtime, resortTree } from './treeCtrl'
import { useEditorStore } from './editor'
import { usePreferencesStore } from './preferences'
import notice from '../services/notification'
import { create, paste, rename, type FileCreateType } from '../util/fileSystem'
import { PATH_SEPARATOR } from '../config'
import type {
  OpenWorkspaceResult,
  SaveWorkspacePayload,
  WorkspaceRoot,
  WorkspaceRootSnapshot,
  WorkspaceSession,
  WorkspaceTreeEvent,
  WorkspaceTreeFolderNode
} from '@shared/types/workspace'

interface WorkspaceRootState {
  path: string
  name: string
  tree: WorkspaceTreeFolderNode | null
  loading: boolean
  error: string | null
}

interface ClipboardEntry {
  type: 'copy' | 'cut' | string
  src: string
}

interface CreateCacheEntry {
  dirname: string
  type: 'file' | 'directory' | string
}

const MAX_COPY_SUFFIX = 99

// treeCtrl's helpers are typed against its own structurally-identical node
// shapes; the workspace nodes are the same shape, so the casts are safe.
type TreeFolderArg = Parameters<typeof addFile>[0]

export const useWorkspaceStore = defineStore('workspace', () => {
  const rootStates = ref<WorkspaceRootState[]>([])
  const workspaceFilePath = ref<string | null>(null)
  const workspaceName = ref('')
  const dirty = ref(false)
  const restorePending = ref(true)
  const recentWorkspaceFiles = ref<string[]>([])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeItem = ref<any>({})
  const createCache = ref<CreateCacheEntry | Record<string, never>>({})
  const renameCache = ref<string | null>(null)
  const clipboard = ref<ClipboardEntry | null>(null)

  // Events arriving before a root's snapshot is applied are buffered per root,
  // mirroring the project store's pendingTreeEvents.
  const pendingEvents: WorkspaceTreeEvent[] = []

  const preferencesStore = usePreferencesStore()

  const sortBy = (): string => String(preferencesStore.fileSortBy)
  const sortOrder = (): string => String(preferencesStore.fileSortOrder)

  watch(
    [() => preferencesStore.fileSortBy, () => preferencesStore.fileSortOrder],
    () => {
      for (const state of rootStates.value) {
        if (state.tree) {
          resortTree(state.tree as unknown as TreeFolderArg, sortBy(), sortOrder())
        }
      }
    }
  )

  function _roots(): WorkspaceRoot[] {
    return rootStates.value.map(({ path, name }) => ({ path, name }))
  }

  function _findRootState(pathname: string): WorkspaceRootState | undefined {
    return rootStates.value.find((state) => state.path === pathname)
  }

  function _setSnapshots(snapshots: WorkspaceRootSnapshot[]): void {
    for (const { root, tree } of snapshots) {
      resortTree(tree as unknown as TreeFolderArg, sortBy(), sortOrder())
      const existing = _findRootState(root.path)
      if (existing) {
        existing.name = root.name
        existing.tree = tree
        existing.loading = false
        existing.error = null
      } else {
        rootStates.value.push({ path: root.path, name: root.name, tree, loading: false, error: null })
      }
      _drainPendingEvents(root.path)
    }
  }

  function _drainPendingEvents(rootPath: string): void {
    for (let i = 0; i < pendingEvents.length; i++) {
      if (pendingEvents[i].rootPath === rootPath) {
        const [event] = pendingEvents.splice(i, 1)
        i--
        _applyTreeEvent(event, false)
      }
    }
  }

  function _applyTreeEvent(event: WorkspaceTreeEvent, buffer = true): void {
    const state = _findRootState(event.rootPath)
    if (!state || !state.tree) {
      if (buffer) pendingEvents.push(event)
      return
    }
    const tree = state.tree as unknown as TreeFolderArg
    const { type, change } = event
    switch (type) {
      case 'add':
        addFile(tree, change as Parameters<typeof addFile>[1], sortBy(), sortOrder())
        break
      case 'unlink':
        unlinkFile(tree, change)
        break
      case 'addDir':
        addDirectory(tree, change)
        break
      case 'unlinkDir':
        unlinkDirectory(tree, change)
        break
      case 'change':
        if (change.mtimeMs !== undefined) {
          updateFileMtime(tree, change as Parameters<typeof updateFileMtime>[1], sortBy(), sortOrder())
        }
        break
      default:
        break
    }
  }

  function LISTEN_FOR_WORKSPACE(): void {
    window.electron.ipcRenderer.on('mt::workspace::tree-event', (_e, event) => {
      _applyTreeEvent(event as WorkspaceTreeEvent)
    })
  }

  async function LOAD_RECENTS(): Promise<void> {
    try {
      recentWorkspaceFiles.value = await window.electron.ipcRenderer.invoke(
        'mt::workspace::get-recents'
      )
    } catch {
      recentWorkspaceFiles.value = []
    }
  }

  function CLEAR_RECENTS(): void {
    window.electron.ipcRenderer.send('mt::workspace::clear-recents')
    recentWorkspaceFiles.value = []
  }

  function _persistSession(): void {
    const session: WorkspaceSession = {
      version: 1,
      workspaceFilePath: workspaceFilePath.value,
      name: workspaceName.value,
      roots: _roots()
    }
    window.electron.ipcRenderer.send('mt::workspace::set-session', session)
  }

  function _applyOpenResult(result: OpenWorkspaceResult): void {
    workspaceFilePath.value = result.workspaceFilePath
    workspaceName.value = result.descriptor.name
    dirty.value = false
    rootStates.value = []
    pendingEvents.length = 0
    _setSnapshots(result.snapshots)
    _persistSession()

    if (result.missing.length) {
      notice.notify({
        title: 'Workspace folders not found',
        type: 'warning',
        message: result.missing.join('\n')
      })
    }
  }

  async function OPEN_WORKSPACE(filePath?: string): Promise<void> {
    try {
      const result = await window.electron.ipcRenderer.invoke('mt::workspace::open', filePath)
      if (!result) return
      _applyOpenResult(result)
      LOAD_RECENTS()
    } catch (err) {
      notice.notify({
        title: 'Failed to open workspace',
        type: 'error',
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }

  async function SAVE_WORKSPACE(saveAs = false): Promise<boolean> {
    const payload: SaveWorkspacePayload = {
      filePath: saveAs ? null : workspaceFilePath.value,
      name: workspaceName.value || 'workspace',
      roots: _roots()
    }
    try {
      const result = await window.electron.ipcRenderer.invoke('mt::workspace::save', payload)
      if (!result) return false
      workspaceFilePath.value = result.workspaceFilePath
      workspaceName.value = result.descriptor.name
      dirty.value = false
      _persistSession()
      LOAD_RECENTS()
      return true
    } catch (err) {
      notice.notify({
        title: 'Failed to save workspace',
        type: 'error',
        message: err instanceof Error ? err.message : String(err)
      })
      return false
    }
  }

  /**
   * Auto write-back: with a backing file, every folder mutation is persisted
   * immediately; without one the change stays in memory and the panel shows a
   * dirty marker until the user saves.
   */
  function _afterRootsChanged(): void {
    _persistSession()
    if (workspaceFilePath.value) {
      SAVE_WORKSPACE(false)
    } else {
      dirty.value = true
    }
  }

  async function _replaceRoots(roots: WorkspaceRoot[]): Promise<void> {
    try {
      const snapshots = await window.electron.ipcRenderer.invoke('mt::workspace::set-roots', roots)
      rootStates.value = rootStates.value.filter((state) =>
        roots.some((root) => root.path === state.path)
      )
      _setSnapshots(snapshots)
      _afterRootsChanged()
    } catch (err) {
      notice.notify({
        title: 'Failed to update workspace folders',
        type: 'error',
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }

  async function ADD_FOLDERS(): Promise<void> {
    try {
      const folders = await window.electron.ipcRenderer.invoke('mt::workspace::pick-folders')
      if (!folders.length) return
      const existing = new Set(rootStates.value.map((state) => state.path))
      const added: WorkspaceRoot[] = folders
        .filter((folder) => !existing.has(folder))
        .map((folder) => ({ path: folder, name: window.path.basename(folder) || folder }))
      if (!added.length) return
      await _replaceRoots([..._roots(), ...added])
    } catch (err) {
      notice.notify({
        title: 'Failed to add workspace folders',
        type: 'error',
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }

  async function REMOVE_ROOT(rootPath: string): Promise<void> {
    await _replaceRoots(_roots().filter((root) => root.path !== rootPath))
  }

  async function REFRESH_ROOT(rootPath: string): Promise<void> {
    const state = _findRootState(rootPath)
    if (state) state.loading = true
    try {
      const snapshot = await window.electron.ipcRenderer.invoke(
        'mt::workspace::refresh-root',
        rootPath
      )
      if (snapshot) {
        if (state) state.loading = false
        _setSnapshots([snapshot])
      }
    } catch (err) {
      if (state) {
        state.loading = false
        state.error = err instanceof Error ? err.message : String(err)
      }
    }
  }

  function CLOSE_WORKSPACE(): void {
    window.electron.ipcRenderer.send('mt::workspace::close')
    workspaceFilePath.value = null
    workspaceName.value = ''
    dirty.value = false
    rootStates.value = []
    pendingEvents.length = 0
  }

  async function RESTORE_SESSION(): Promise<void> {
    restorePending.value = true
    try {
      const session = await window.electron.ipcRenderer.invoke('mt::workspace::get-session')
      if (!session) return

      if (session.workspaceFilePath) {
        const result = await window.electron.ipcRenderer.invoke(
          'mt::workspace::open',
          session.workspaceFilePath
        )
        if (result) {
          _applyOpenResult(result)
          return
        }
      }

      if (!session.roots.length) return
      const { roots } = await window.electron.ipcRenderer.invoke(
        'mt::workspace::get-roots-status',
        session.roots
      )
      if (!roots.length) return
      workspaceName.value = session.name
      const snapshots = await window.electron.ipcRenderer.invoke('mt::workspace::set-roots', roots)
      _setSnapshots(snapshots)
      _persistSession()
    } catch {
      // A failed restore just leaves the panel empty.
    } finally {
      restorePending.value = false
      LOAD_RECENTS()
    }
  }

  function OPEN_FILE(pathname: string, isMarkdown: boolean): void {
    if (!isMarkdown) {
      window.electron.shell.openPath(pathname)
      return
    }
    const editorStore = useEditorStore()
    const openedTab = editorStore.tabs.find((tab) =>
      window.fileUtils.isSamePathSync(tab.pathname, pathname)
    )
    if (openedTab) {
      if (editorStore.currentFile?.pathname === openedTab.pathname) return
      editorStore.UPDATE_CURRENT_FILE(openedTab)
    } else {
      window.electron.ipcRenderer.send('mt::open-file', pathname, {})
    }
  }

  function CHANGE_ACTIVE_ITEM(item: unknown): void {
    activeItem.value = item
  }

  function CHANGE_CLIPBOARD(entry: ClipboardEntry | null): void {
    clipboard.value = entry
  }

  async function CREATE_ENTRY(name: string): Promise<void> {
    const cache = createCache.value as CreateCacheEntry
    const { dirname, type } = cache
    if (!dirname) return
    let finalName = name
    if (type === 'file' && !window.fileUtils.hasMarkdownExtension(finalName)) {
      finalName += '.md'
    }
    const fullName = `${dirname}/${finalName}`
    if (await window.fileUtils.pathExists(fullName)) {
      createCache.value = {}
      notice.notify({
        title: 'Error in Workspace',
        type: 'error',
        message: `A ${type} named "${finalName}" already exists in this folder.`
      })
      return
    }
    createCache.value = {}
    create(fullName, type as FileCreateType).catch((err) => {
      notice.notify({
        title: 'Error in Workspace',
        type: 'error',
        message: err instanceof Error ? err.message : String(err)
      })
    })
  }

  function RENAME_ENTRY(newName: string): void {
    const src = renameCache.value
    if (!src || !newName) return
    const dest = `${window.path.dirname(src)}${PATH_SEPARATOR}${newName}`
    renameCache.value = null
    rename(src, dest).catch((err) => {
      notice.notify({
        title: 'Error in Workspace',
        type: 'error',
        message: err instanceof Error ? err.message : String(err)
      })
    })
  }

  function REMOVE_ENTRY(pathname: string): void {
    window.electron.ipcRenderer.invoke('mt::fs-trash-item', pathname).catch((err) => {
      notice.notify({
        title: 'Error while deleting',
        type: 'error',
        message: err instanceof Error ? err.message : String(err)
      })
    })
  }

  async function PASTE_ENTRY(): Promise<void> {
    const entry = clipboard.value
    if (!entry) return
    const { pathname, isDirectory } = activeItem.value || {}
    if (!pathname) return
    const dirname = isDirectory ? pathname : window.path.dirname(pathname)

    let dest = `${dirname}${PATH_SEPARATOR}${window.path.basename(entry.src)}`
    if (window.path.normalize(entry.src) === window.path.normalize(dest)) {
      if (entry.type === 'cut') {
        notice.notify({
          title: 'Paste Forbidden',
          type: 'warning',
          message: 'Source and destination must not be the same.'
        })
        return
      }
      const ext = window.path.extname(entry.src)
      const base = window.path.basename(entry.src, ext)
      let suffix = 1
      dest = `${dirname}${PATH_SEPARATOR}${base} (copy)${ext}`
      while (await window.fileUtils.pathExists(dest)) {
        suffix++
        if (suffix > MAX_COPY_SUFFIX) return
        dest = `${dirname}${PATH_SEPARATOR}${base} (copy ${suffix})${ext}`
      }
    }

    paste({ src: entry.src, dest, type: entry.type as 'cut' | 'copy' })
      .then(() => {
        clipboard.value = null
      })
      .catch((err) => {
        notice.notify({
          title: 'Error while pasting',
          type: 'error',
          message: err instanceof Error ? err.message : String(err)
        })
      })
  }

  return {
    rootStates,
    workspaceFilePath,
    workspaceName,
    dirty,
    restorePending,
    recentWorkspaceFiles,
    activeItem,
    createCache,
    renameCache,
    clipboard,
    LISTEN_FOR_WORKSPACE,
    LOAD_RECENTS,
    CLEAR_RECENTS,
    RESTORE_SESSION,
    OPEN_WORKSPACE,
    SAVE_WORKSPACE,
    ADD_FOLDERS,
    REMOVE_ROOT,
    REFRESH_ROOT,
    CLOSE_WORKSPACE,
    OPEN_FILE,
    CHANGE_ACTIVE_ITEM,
    CHANGE_CLIPBOARD,
    CREATE_ENTRY,
    RENAME_ENTRY,
    REMOVE_ENTRY,
    PASTE_ENTRY
  }
})
