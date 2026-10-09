// Dedicated chokidar watcher for Workspace-panel roots (CUSTOM-20261009-001).
//
// Deliberately standalone rather than a reuse of main/filesystem/watcher.ts:
// that class hardcodes its event channels across several module-scope helpers,
// so generalizing it would scatter custom edits through a subtle, high-churn
// upstream file on every future merge. The duplicated logic here is small
// (ignore set, polling heuristic) and needs different semantics anyway — no
// markdown filter (the panel shows all files) and no initial scan (snapshots
// come from reader.ts).

import path from 'path'
import fs from 'fs-extra'
import log from 'electron-log'
import chokidar, { type FSWatcher } from 'chokidar'
import { isOsx } from '../config'
import { hasMarkdownExtension } from 'common/filesystem/paths'
import type { WorkspaceTreeEvent, WorkspaceTreeEventType } from '@shared/types/workspace'

const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', '.hg', '.svn'])
const UNC_PATH_REG = /^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/

const isIgnored = (pathname: string): boolean => {
  const base = path.basename(pathname)
  return IGNORED_DIRECTORIES.has(base) || base.endsWith('.asar')
}

interface WatcherEntry {
  rootPath: string
  watcher: FSWatcher
}

/**
 * One instance per editor window. `onEvent` receives incremental tree patches
 * scoped by `rootPath`; the module owning the instance forwards them to the
 * renderer.
 */
class WorkspaceWatcher {
  private readonly _onEvent: (event: WorkspaceTreeEvent) => void
  private readonly _watchers: Record<string, WatcherEntry>

  constructor(onEvent: (event: WorkspaceTreeEvent) => void) {
    this._onEvent = onEvent
    this._watchers = {}
  }

  watch(rootPath: string): void {
    if (this._watchers[rootPath]) return

    const usePolling = isOsx || UNC_PATH_REG.test(rootPath)

    const watcher = chokidar.watch(rootPath, {
      // Files are all shown, so only directories are ever pruned.
      ignored: isIgnored,
      ignoreInitial: true,
      persistent: true,
      ignorePermissionErrors: true,
      usePolling
    } as unknown as Parameters<typeof chokidar.watch>[1])

    const emit = (type: WorkspaceTreeEventType, change: WorkspaceTreeEvent['change']): void => {
      this._onEvent({ rootPath, type, change })
    }

    watcher
      .on('add', (pathname: string) => {
        emit('add', {
          pathname,
          name: path.basename(pathname),
          isMarkdown: hasMarkdownExtension(pathname),
          isDirectory: false,
          isFile: true
        })
      })
      .on('addDir', (pathname: string) => {
        emit('addDir', {
          pathname,
          name: path.basename(pathname),
          isDirectory: true,
          isFile: false
        })
      })
      .on('unlink', (pathname: string) => emit('unlink', { pathname }))
      .on('unlinkDir', (pathname: string) => emit('unlinkDir', { pathname }))
      .on('change', (pathname: string) => {
        // Only mtime is needed: the renderer uses it to re-sort modified-time
        // views and ignores content changes for the tree.
        fs
          .stat(pathname)
          .then((stats) => emit('change', { pathname, mtimeMs: stats.mtimeMs }))
          .catch(() => {
            // Removed between event and stat; the unlink event covers it.
          })
      })
      .on('error', (error: unknown) => {
        log.error(`Workspace watcher error for "${rootPath}":`, error)
      })

    this._watchers[rootPath] = { rootPath, watcher }
  }

  unwatch(rootPath: string): void {
    const entry = this._watchers[rootPath]
    if (!entry) return
    delete this._watchers[rootPath]
    entry.watcher
      .close()
      .catch((err) => log.error(`Failed to close workspace watcher for "${rootPath}":`, err))
  }

  close(): void {
    for (const rootPath of Object.keys(this._watchers)) {
      this.unwatch(rootPath)
    }
  }
}

export default WorkspaceWatcher
