// Single-level directory reader for the sidebar "Current Directory" panel
// (CUSTOM-20261016-001).
//
// One level per call: the panel's tree expands lazily, so scanning a directory
// only happens when the user opens it. Electron-free on purpose, so the scan
// can be unit tested without mocking the main process.

import path from 'path'
import fs from 'fs-extra'
import { hasMarkdownExtension } from 'common/filesystem/paths'
import type { CurrentDirEntry } from '@shared/types/currentDir'

// Unconditional prunes, mirroring the built-in file tree and the Workspace
// panel: these never contain markdown worth switching to, and node_modules in
// particular would swamp the panel.
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', '.hg', '.svn'])

const isIgnoredDirectory = (name: string): boolean =>
  IGNORED_DIRECTORIES.has(name) || name.endsWith('.asar')

const naturalCompare = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/**
 * List `dirPath`'s subdirectories and markdown files, folders first.
 *
 * Non-markdown files are dropped, but directories are always listed even when
 * they hold no markdown: the tree would otherwise be un-navigable in a project
 * whose documents live a level or two down.
 */
export const readCurrentDirEntries = async(dirPath: string): Promise<CurrentDirEntry[]> => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const folders: CurrentDirEntry[] = []
  const files: CurrentDirEntry[] = []

  for (const entry of entries) {
    const pathname = path.join(dirPath, entry.name)

    let isDirectory = entry.isDirectory()
    if (!isDirectory && entry.isSymbolicLink()) {
      try {
        isDirectory = (await fs.stat(pathname)).isDirectory()
      } catch {
        // Broken link: skip it rather than failing the whole listing.
        continue
      }
    }

    if (isDirectory) {
      if (isIgnoredDirectory(entry.name)) continue
      folders.push({ pathname, name: entry.name, isDirectory: true })
    } else if (hasMarkdownExtension(entry.name)) {
      files.push({ pathname, name: entry.name, isDirectory: false })
    }
  }

  folders.sort((a, b) => naturalCompare(a.name, b.name))
  files.sort((a, b) => naturalCompare(a.name, b.name))
  return folders.concat(files)
}
