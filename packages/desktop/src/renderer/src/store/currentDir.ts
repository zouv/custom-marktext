// Current Directory panel store (CUSTOM-20261016-001).
//
// The panel shows a lazily-expanded tree of the directory holding the active
// file. Nodes are cached per absolute path for the lifetime of the session, so
// switching tabs between two directories — or closing and reopening the panel —
// restores the previously expanded shape instead of re-scanning from the root.
//
// Scans are driven by the panel: nothing here runs while the panel is hidden.

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useEditorStore } from './editor'
import type { CurrentDirEntry } from '@shared/types/currentDir'

export interface CurrentDirFileNode {
  pathname: string
  name: string
}

export interface CurrentDirFolderNode {
  pathname: string
  name: string
  /** A scan has succeeded at least once; `folders`/`files` are meaningful. */
  loaded: boolean
  loading: boolean
  /** Last scan failed. Cached contents (if any) are still shown. */
  error: boolean
  expanded: boolean
  folders: CurrentDirFolderNode[]
  files: CurrentDirFileNode[]
}

const baseName = (pathname: string): string => window.path.basename(pathname) || pathname

export const useCurrentDirStore = defineStore('currentDir', () => {
  const editorStore = useEditorStore()

  // Keyed by absolute directory path. Reads go through the reactive record so
  // every node handed out is a proxy; mutating a raw node captured before an
  // await would not update the tree.
  const folders = ref<Record<string, CurrentDirFolderNode>>({})
  const rootPath = ref('')
  /** Lock the panel onto its current root so switching files stops re-rooting it. */
  const pinned = ref(false)

  // Per-path request sequence: a response that lost a race (a second scan of
  // the same directory started, or a refresh superseded it) is dropped instead
  // of overwriting the newer listing.
  const inflight = new Map<string, number>()
  let requestSeq = 0

  const currentFilePath = computed<string>(() => editorStore.currentFile?.pathname || '')

  // Untitled tabs have an empty pathname, so `dirPath` stays empty until the
  // file is saved to disk.
  const dirPath = computed<string>(() =>
    currentFilePath.value ? window.path.dirname(currentFilePath.value) : ''
  )

  const root = computed<CurrentDirFolderNode | null>(() =>
    rootPath.value ? folders.value[rootPath.value] || null : null
  )

  function ensureFolder(pathname: string): CurrentDirFolderNode {
    const existing = folders.value[pathname]
    if (existing) return existing
    folders.value[pathname] = {
      pathname,
      name: baseName(pathname),
      loaded: false,
      loading: false,
      error: false,
      expanded: false,
      folders: [],
      files: []
    }
    return folders.value[pathname]
  }

  function applyEntries(folder: CurrentDirFolderNode, entries: CurrentDirEntry[]): void {
    const subfolders: CurrentDirFolderNode[] = []
    const files: CurrentDirFileNode[] = []
    for (const entry of entries) {
      if (entry.isDirectory) {
        subfolders.push(ensureFolder(entry.pathname))
      } else {
        files.push({ pathname: entry.pathname, name: entry.name })
      }
    }
    folder.folders = subfolders
    folder.files = files
  }

  async function load(pathname: string, force = false): Promise<void> {
    const folder = ensureFolder(pathname)
    if (folder.loaded && !force) return
    const seq = ++requestSeq
    inflight.set(pathname, seq)
    folder.loading = true
    folder.error = false
    try {
      const entries = await window.electron.ipcRenderer.invoke('mt::currentdir::read', pathname)
      if (inflight.get(pathname) !== seq) return
      applyEntries(folder, entries)
      folder.loaded = true
    } catch {
      if (inflight.get(pathname) !== seq) return
      folder.error = true
    } finally {
      if (inflight.get(pathname) === seq) {
        inflight.delete(pathname)
        folder.loading = false
      }
    }
  }

  /** Point the panel at a directory. Cached nodes keep their expanded shape. */
  function SET_ROOT(dir: string): void {
    rootPath.value = dir
    if (!dir) return
    const folder = ensureFolder(dir)
    folder.expanded = true
    if (!folder.loaded || folder.error) {
      load(dir, folder.error).catch(() => {})
    }
  }

  /** Lock the panel onto its current root so switching files stops re-rooting it. */
  function SET_PINNED(value: boolean): void {
    pinned.value = value
    if (!value && dirPath.value) {
      SET_ROOT(dirPath.value)
    }
  }

  /** Follow the active file's directory unless the panel is pinned. */
  function FOLLOW_DIR(dir: string): void {
    if (pinned.value) return
    SET_ROOT(dir)
  }

  function OPEN_FOLDER(pathname: string): void {
    const folder = folders.value[pathname]
    if (!folder) return
    folder.expanded = !folder.expanded
    if (!folder.expanded) return
    // A folder whose last scan failed retries on the next expand, without the
    // user having to find the refresh button.
    if (!folder.loaded || folder.error) {
      load(pathname, folder.error).catch(() => {})
    }
  }

  function OPEN_FILE(pathname: string): void {
    const openedTab = editorStore.tabs.find((tab) =>
      window.fileUtils.isSamePathSync(tab.pathname, pathname)
    )
    if (!openedTab) {
      window.electron.ipcRenderer.send('mt::open-file', pathname, {})
      return
    }
    if (
      editorStore.currentFile &&
      window.fileUtils.isSamePathSync(editorStore.currentFile.pathname, pathname)
    ) {
      return
    }
    editorStore.UPDATE_CURRENT_FILE(openedTab)
  }

  const isCurrentFile = (pathname: string): boolean =>
    !!currentFilePath.value && window.fileUtils.isSamePathSync(currentFilePath.value, pathname)

  /** Re-read the root and every folder the user has opened beneath it. */
  async function REFRESH(): Promise<void> {
    const pathname = rootPath.value
    const folder = pathname ? folders.value[pathname] : undefined
    if (!folder) return

    const targets: string[] = []
    const collect = (node: CurrentDirFolderNode): void => {
      if (!node.loaded) return
      targets.push(node.pathname)
      for (const child of node.folders) collect(child)
    }
    collect(folder)

    // Refreshing keeps the old rows on screen until each scan lands, so the
    // tree does not blink empty.
    await Promise.all(targets.map((target) => load(target, true)))
  }

  return {
    rootPath,
    dirPath,
    root,
    pinned,
    currentFilePath,
    SET_ROOT,
    SET_PINNED,
    FOLLOW_DIR,
    OPEN_FOLDER,
    OPEN_FILE,
    REFRESH,
    isCurrentFile
  }
})
