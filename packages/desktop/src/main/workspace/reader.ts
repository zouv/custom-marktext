// Recursive root reader for the Workspace panel (CUSTOM-20261009-001).
//
// The panel is populated with a full snapshot per root (one IPC round trip)
// rather than by chokidar's initial scan: the renderer already knows the root
// list, so a snapshot avoids reassembling an unordered event stream and
// guessing which root an event belongs to. Incremental updates come from
// WorkspaceWatcher afterwards.

import path from 'path'
import fs from 'fs-extra'
import { hasMarkdownExtension } from 'common/filesystem/paths'
import type {
  WorkspaceRoot,
  WorkspaceRootSnapshot,
  WorkspaceTreeFolderNode,
  WorkspaceTreeFileNode
} from '@shared/types/workspace'

// Unconditional prunes, mirroring the built-in file tree's behaviour. Everything
// else (including dotfiles) is listed — the panel shows all files.
const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', '.hg', '.svn'])
const MAX_DEPTH = 12

const naturalCompare = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

const isIgnoredDirectory = (name: string): boolean =>
  IGNORED_DIRECTORIES.has(name) || name.endsWith('.asar')

const makeFolder = (pathname: string, name: string): WorkspaceTreeFolderNode => ({
  pathname,
  name,
  isDirectory: true,
  isFile: false,
  isMarkdown: false,
  folders: [],
  files: []
})

const readFolder = async(
  dirPath: string,
  name: string,
  depth: number
): Promise<WorkspaceTreeFolderNode> => {
  const node = makeFolder(dirPath, name)

  let entries
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true })
  } catch {
    // Unreadable directory (permissions, or removed mid-read): expose it empty
    // rather than failing the whole root.
    return node
  }

  for (const entry of entries) {
    const childPath = path.join(dirPath, entry.name)

    let isDirectory = entry.isDirectory()
    if (!isDirectory && entry.isSymbolicLink()) {
      try {
        isDirectory = (await fs.stat(childPath)).isDirectory()
      } catch {
        continue
      }
    }

    if (isDirectory) {
      if (isIgnoredDirectory(entry.name) || depth >= MAX_DEPTH) continue
      node.folders.push(await readFolder(childPath, entry.name, depth + 1))
    } else {
      const file: WorkspaceTreeFileNode = {
        pathname: childPath,
        name: entry.name,
        isDirectory: false,
        isFile: true,
        isMarkdown: hasMarkdownExtension(entry.name)
      }
      node.files.push(file)
    }
  }

  node.folders.sort((a, b) => naturalCompare(a.name, b.name))
  node.files.sort((a, b) => naturalCompare(a.name, b.name))
  return node
}

export const readRoot = async(root: WorkspaceRoot): Promise<WorkspaceRootSnapshot> => {
  const name = root.name || path.basename(root.path) || root.path
  let stats: fs.Stats | null = null
  try {
    stats = await fs.stat(root.path)
  } catch {
    stats = null
  }

  const tree =
    stats && stats.isDirectory()
      ? await readFolder(root.path, name, 0)
      : makeFolder(root.path, name)

  return { root: { path: root.path, name }, tree }
}
