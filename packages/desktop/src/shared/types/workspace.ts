// Shared types for the custom multi-root "Workspace" feature (CUSTOM-20261009-001).
//
// A `.mt-workspace` file is a small versioned JSON descriptor listing the root
// folders of a workspace. `path` entries are stored relative to the descriptor's
// own directory when the folder lives inside it, otherwise absolute — the same
// convention VSCode uses for `.code-workspace`.

export const WORKSPACE_FILE_EXTENSION = 'mt-workspace'
export const WORKSPACE_FILE_VERSION = 1

/** One `folders[]` entry exactly as stored in the descriptor. */
export interface WorkspaceFolderEntry {
  path: string
  name?: string
}

/** Parsed `.mt-workspace` descriptor. */
export interface WorkspaceDescriptor {
  version: number
  name: string
  folders: WorkspaceFolderEntry[]
  settings: Record<string, unknown>
}

/** A resolved, absolute root folder shown in the panel. */
export interface WorkspaceRoot {
  path: string
  name: string
}

export interface WorkspaceTreeFileNode {
  pathname: string
  name: string
  isDirectory: false
  isFile: true
  isMarkdown: boolean
}

export interface WorkspaceTreeFolderNode {
  pathname: string
  name: string
  isDirectory: true
  isFile: false
  isMarkdown: false
  folders: WorkspaceTreeFolderNode[]
  files: WorkspaceTreeFileNode[]
}

/** A fully-read root, returned when a root is first reconciled. */
export interface WorkspaceRootSnapshot {
  root: WorkspaceRoot
  tree: WorkspaceTreeFolderNode
}

export type WorkspaceTreeEventType = 'add' | 'unlink' | 'addDir' | 'unlinkDir' | 'change'

export interface WorkspaceTreeChange {
  pathname: string
  name?: string
  isMarkdown?: boolean
  isDirectory?: boolean
  isFile?: boolean
  mtimeMs?: number
}

/** Incremental tree event pushed from main after the initial snapshot. */
export interface WorkspaceTreeEvent {
  rootPath: string
  type: WorkspaceTreeEventType
  change: WorkspaceTreeChange
}

/** Result of opening (or picking) a `.mt-workspace` file. */
export interface OpenWorkspaceResult {
  workspaceFilePath: string
  descriptor: WorkspaceDescriptor
  roots: WorkspaceRoot[]
  snapshots: WorkspaceRootSnapshot[]
  /** Descriptor entries whose directory could not be found on disk. */
  missing: string[]
}

/** Per-window workspace state persisted across restarts. */
export interface WorkspaceSession {
  version: number
  workspaceFilePath: string | null
  name: string
  roots: WorkspaceRoot[]
}

/** Payload for `mt::workspace::save`. `filePath === null` triggers Save-As. */
export interface SaveWorkspacePayload {
  filePath: string | null
  name: string
  roots: WorkspaceRoot[]
}

export interface SavedWorkspaceResult {
  workspaceFilePath: string
  descriptor: WorkspaceDescriptor
}
