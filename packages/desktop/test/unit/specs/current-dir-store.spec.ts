import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// The store graph pulls in `@/config`, which reads `window.path.sep` at module
// load, plus the editor store. Stub the contextBridge surfaces before the
// hoisted imports run.
vi.hoisted(() => {
  const w = globalThis as unknown as { window?: { path?: Record<string, unknown> } }
  w.window ??= {}
  w.window.path = {
    ...(w.window.path || {}),
    sep: '/',
    dirname: (p: string): string => p.replace(/[/\\][^/\\]*$/, '') || p,
    basename: (p: string): string => p.replace(/^.*[/\\]/, '')
  }
})

import { useCurrentDirStore } from '@/store/currentDir'
import { useEditorStore } from '@/store/editor'
import type { CurrentDirEntry } from '@shared/types/currentDir'
import type { IFileState } from '@shared/types/files'

const win = window as unknown as {
  electron?: { ipcRenderer: { on: Mock; send: Mock; invoke: Mock } }
  marktext?: { env: { windowId: number } }
  fileUtils?: { isSamePathSync: Mock }
}

const ROOT = '/root/docs'
const SUB = '/root/docs/sub'

const folder = (pathname: string, name: string): CurrentDirEntry => ({
  pathname,
  name,
  isDirectory: true
})
const file = (pathname: string, name: string): CurrentDirEntry => ({
  pathname,
  name,
  isDirectory: false
})

const LISTINGS: Record<string, CurrentDirEntry[]> = {
  [ROOT]: [folder(SUB, 'sub'), file(`${ROOT}/readme.md`, 'readme.md')],
  [SUB]: [folder(`${SUB}/deep`, 'deep'), file(`${SUB}/note.md`, 'note.md')],
  [`${SUB}/deep`]: [file(`${SUB}/deep/leaf.md`, 'leaf.md')]
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

let invoke: Mock

beforeEach(() => {
  invoke = vi.fn((_channel: string, dir: string) => Promise.resolve(LISTINGS[dir] || []))
  win.electron = { ipcRenderer: { on: vi.fn(), send: vi.fn(), invoke } }
  win.marktext = { env: { windowId: 1 } }
  win.fileUtils = { isSamePathSync: vi.fn((a: string, b: string) => a === b) }
  setActivePinia(createPinia())
})

afterEach(() => {
  delete win.electron
  delete win.marktext
  delete win.fileUtils
  vi.clearAllMocks()
})

const scansOf = (dir: string): number =>
  invoke.mock.calls.filter(([channel, target]) => channel === 'mt::currentdir::read' && target === dir)
    .length

describe('currentDir store', () => {
  it('loads the root on SET_ROOT and expands it', async() => {
    const store = useCurrentDirStore()

    store.SET_ROOT(ROOT)
    await flush()

    expect(invoke).toHaveBeenCalledWith('mt::currentdir::read', ROOT)
    expect(store.root?.name).toBe('docs')
    expect(store.root?.expanded).toBe(true)
    expect(store.root?.loaded).toBe(true)
    expect(store.root?.folders.map((node) => node.name)).toEqual(['sub'])
    expect(store.root?.files.map((node) => node.name)).toEqual(['readme.md'])
  })

  it('scans a folder only once it is expanded, and never scans its children', async() => {
    const store = useCurrentDirStore()
    store.SET_ROOT(ROOT)
    await flush()

    expect(scansOf(SUB)).toBe(0)

    store.OPEN_FOLDER(SUB)
    await flush()

    expect(scansOf(SUB)).toBe(1)
    expect(scansOf(`${SUB}/deep`)).toBe(0)
    expect(store.root?.folders[0].files.map((node) => node.name)).toEqual(['note.md'])
  })

  it('collapses without re-scanning and re-expands from the cache', async() => {
    const store = useCurrentDirStore()
    store.SET_ROOT(ROOT)
    await flush()
    store.OPEN_FOLDER(SUB)
    await flush()

    store.OPEN_FOLDER(SUB)
    expect(store.root?.folders[0].expanded).toBe(false)

    store.OPEN_FOLDER(SUB)
    await flush()

    expect(store.root?.folders[0].expanded).toBe(true)
    expect(scansOf(SUB)).toBe(1)
  })

  it('reuses the cached tree when a directory becomes the root again', async() => {
    const store = useCurrentDirStore()
    store.SET_ROOT(ROOT)
    await flush()
    store.OPEN_FOLDER(SUB)
    await flush()

    store.SET_ROOT('/root/elsewhere')
    await flush()
    store.SET_ROOT(ROOT)
    await flush()

    expect(scansOf(ROOT)).toBe(1)
    expect(store.root?.folders[0].expanded).toBe(true)
    expect(store.root?.folders[0].loaded).toBe(true)
  })

  it('REFRESH re-reads the root and every opened folder', async() => {
    const store = useCurrentDirStore()
    store.SET_ROOT(ROOT)
    await flush()
    store.OPEN_FOLDER(SUB)
    await flush()

    await store.REFRESH()

    expect(scansOf(ROOT)).toBe(2)
    expect(scansOf(SUB)).toBe(2)
    expect(scansOf(`${SUB}/deep`)).toBe(0)
    expect(store.root?.folders[0].expanded).toBe(true)
  })

  it('keeps the newest listing when an older scan resolves last', async() => {
    const store = useCurrentDirStore()
    store.SET_ROOT(ROOT)
    await flush()

    const pending: Array<(entries: CurrentDirEntry[]) => void> = []
    invoke.mockImplementation(() => new Promise((resolve) => pending.push(resolve)))

    const first = store.REFRESH()
    const second = store.REFRESH()
    expect(pending).toHaveLength(2)

    // The newer scan lands first, the superseded one afterwards: it must not
    // overwrite the tree the user is already looking at.
    pending[1]([file(`${ROOT}/fresh.md`, 'fresh.md')])
    await flush()
    pending[0]([file(`${ROOT}/stale.md`, 'stale.md')])
    await Promise.all([first, second])

    expect(store.root?.files.map((node) => node.name)).toEqual(['fresh.md'])
  })

  it('flags a failed scan and keeps the previous listing', async() => {
    const store = useCurrentDirStore()
    store.SET_ROOT(ROOT)
    await flush()

    invoke.mockImplementation(() => Promise.reject(new Error('EACCES')))
    await store.REFRESH()

    expect(store.root?.error).toBe(true)
    expect(store.root?.files.map((node) => node.name)).toEqual(['readme.md'])
  })

  it('ignores directory changes while pinned and snaps back on unpin', async() => {
    const store = useCurrentDirStore()
    const editorStore = useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      pathname: `${ROOT}/readme.md`
    } as unknown as IFileState

    store.FOLLOW_DIR(ROOT)
    await flush()
    expect(store.rootPath).toBe(ROOT)

    store.SET_PINNED(true)
    expect(store.pinned).toBe(true)

    // Pinned: the active directory changing must not re-root the panel.
    store.FOLLOW_DIR('/root/elsewhere')
    expect(store.rootPath).toBe(ROOT)
    expect(store.root?.name).toBe('docs')

    // Unpin snaps back to the active file's directory.
    store.SET_PINNED(false)
    expect(store.pinned).toBe(false)
    expect(store.rootPath).toBe(ROOT)
  })
})
