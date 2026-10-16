// Types for the sidebar "Current Directory" tree (CUSTOM-20261016-001).
//
// One listing entry. `isDirectory` is resolved in the main process (from
// `fs.Dirent`, with symlinks followed) because the panel has to render an
// expandable subtree, which a bare name list cannot express.

export interface CurrentDirEntry {
  pathname: string
  name: string
  isDirectory: boolean
}
