// `.mt-workspace` descriptor read/write (CUSTOM-20261009-001).
//
// Kept free of Electron/IPC so it can be unit-tested directly. The descriptor is
// the source of truth for a workspace; the in-memory root list is derived from
// it on open and serialized back to it on save.

import path from 'path'
import fs from 'fs-extra'
import { writeFile } from '../filesystem'
import {
  WORKSPACE_FILE_EXTENSION,
  WORKSPACE_FILE_VERSION,
  type WorkspaceDescriptor,
  type WorkspaceFolderEntry,
  type WorkspaceRoot
} from '@shared/types/workspace'

export const WORKSPACE_FILE_FILTERS = [
  { name: 'MarkText Workspace', extensions: [WORKSPACE_FILE_EXTENSION] }
]

const defaultWorkspaceName = (workspaceFilePath: string): string =>
  path.basename(workspaceFilePath, `.${WORKSPACE_FILE_EXTENSION}`)

/**
 * Candidate absolute paths for a stored `folders[].path` entry, in priority
 * order. Absolute entries have exactly one candidate. Relative entries resolve
 * against the descriptor's own directory (VSCode `.code-workspace` semantics)
 * and then against the descriptor's volume root — the second candidate recovers
 * descriptors whose relative base was lost, which happens as soon as the
 * descriptor is moved out of the directory its paths were written against.
 */
export const resolveEntryCandidates = (
  entryPath: string,
  workspaceFilePath: string
): string[] => {
  if (path.isAbsolute(entryPath)) {
    return [path.normalize(entryPath)]
  }
  const descriptorDir = path.dirname(workspaceFilePath)
  const volumeRoot = path.parse(path.resolve(workspaceFilePath)).root
  const primary = path.normalize(path.resolve(descriptorDir, entryPath))
  const fallback = path.normalize(path.resolve(volumeRoot, entryPath))
  return primary === fallback ? [primary] : [primary, fallback]
}

/** Primary resolution — the first candidate from {@link resolveEntryCandidates}. */
export const resolveEntryPath = (entryPath: string, workspaceFilePath: string): string =>
  resolveEntryCandidates(entryPath, workspaceFilePath)[0]

/**
 * Reconcile the roots currently in memory against the paths recorded in a
 * workspace descriptor. Currently-missing folders are surfaced via `missing`
 * so the caller can warn instead of dropping them silently.
 */
export const reconcileRoots = async(
  roots: WorkspaceRoot[]
): Promise<{ roots: WorkspaceRoot[]; missing: string[] }> => {
  const present: WorkspaceRoot[] = []
  const missing: string[] = []
  for (const root of roots) {
    if (await fs.pathExists(root.path)) {
      present.push(root)
    } else {
      missing.push(root.path)
    }
  }
  return { roots: present, missing }
}

export interface ParsedWorkspace {
  descriptor: WorkspaceDescriptor
  roots: WorkspaceRoot[]
  missing: string[]
}

/**
 * Parse descriptor text into a descriptor + absolute root list. Throws on
 * malformed JSON or a descriptor without a `folders` array, so callers can
 * surface a single actionable error.
 */
export const parseWorkspace = async(
  text: string,
  workspaceFilePath: string
): Promise<ParsedWorkspace> => {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    throw new Error(`Not a valid workspace file (invalid JSON): ${(err as Error).message}`)
  }

  const obj = (raw ?? {}) as Partial<WorkspaceDescriptor>
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.folders)) {
    throw new Error('Not a valid workspace file: missing "folders" array.')
  }

  const entries = obj.folders.filter(
    (entry): entry is WorkspaceFolderEntry =>
      !!entry && typeof (entry as WorkspaceFolderEntry).path === 'string'
  )

  const descriptor: WorkspaceDescriptor = {
    version: typeof obj.version === 'number' ? obj.version : WORKSPACE_FILE_VERSION,
    name: typeof obj.name === 'string' && obj.name ? obj.name : defaultWorkspaceName(workspaceFilePath),
    folders: entries,
    settings: (obj.settings && typeof obj.settings === 'object' ? obj.settings : {}) as Record<
      string,
      unknown
    >
  }

  const roots: WorkspaceRoot[] = []
  const missing: string[] = []
  for (const entry of entries) {
    let chosen: string | null = null
    for (const candidate of resolveEntryCandidates(entry.path, workspaceFilePath)) {
      if (await fs.pathExists(candidate)) {
        chosen = candidate
        break
      }
    }
    const target = chosen ?? resolveEntryPath(entry.path, workspaceFilePath)
    const name = entry.name || path.basename(target) || target
    if (chosen) {
      roots.push({ path: target, name })
    } else {
      missing.push(target)
    }
  }

  return { descriptor, roots, missing }
}

export const readWorkspace = async(workspaceFilePath: string): Promise<ParsedWorkspace> => {
  const text = await fs.readFile(workspaceFilePath, 'utf8')
  return parseWorkspace(text, workspaceFilePath)
}

/**
 * Build the on-disk descriptor for the given roots. Paths are stored absolute:
 * this app keeps workspace files in a user-chosen folder rather than next to the
 * projects they reference, so relative storage silently breaks the moment the
 * descriptor is moved. Reading still accepts relative entries (VSCode-style).
 */
export const buildDescriptor = (
  name: string,
  roots: WorkspaceRoot[],
  workspaceFilePath: string
): WorkspaceDescriptor => ({
  version: WORKSPACE_FILE_VERSION,
  name: name || defaultWorkspaceName(workspaceFilePath),
  folders: roots.map((root) => {
    const stored: WorkspaceFolderEntry = { path: path.normalize(root.path) }
    const basename = path.basename(root.path)
    if (root.name && root.name !== basename) {
      stored.name = root.name
    }
    return stored
  }),
  settings: {}
})

export const writeWorkspace = async(
  workspaceFilePath: string,
  descriptor: WorkspaceDescriptor
): Promise<void> => {
  await writeFile(
    workspaceFilePath,
    `${JSON.stringify(descriptor, null, 2)}\n`,
    WORKSPACE_FILE_EXTENSION
  )
}

export const hasWorkspaceExtension = (pathname: string): boolean =>
  pathname.toLowerCase().endsWith(`.${WORKSPACE_FILE_EXTENSION}`)
