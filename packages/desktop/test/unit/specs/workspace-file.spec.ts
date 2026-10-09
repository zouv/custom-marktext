import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import os from 'os'
import fs from 'fs-extra'
import {
  buildDescriptor,
  parseWorkspace,
  readWorkspace,
  resolveEntryCandidates,
  resolveEntryPath,
  writeWorkspace
} from '../../../src/main/workspace/file'

let tmpRoot: string

const workspaceFile = (): string => path.join(tmpRoot, 'demo.mt-workspace')

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-workspace-'))
})

afterEach(() => {
  fs.removeSync(tmpRoot)
})

describe('workspace descriptor file', () => {
  it('resolves relative folder entries against the workspace file directory', () => {
    const resolved = resolveEntryPath('docs', workspaceFile())
    expect(resolved).toBe(path.normalize(path.join(tmpRoot, 'docs')))
  })

  it('keeps absolute folder entries as-is', () => {
    const absolute = path.join(tmpRoot, 'elsewhere')
    expect(resolveEntryPath(absolute, workspaceFile())).toBe(path.normalize(absolute))
  })

  it('parses a descriptor and drops folders that do not exist, reporting them as missing', async() => {
    const existing = path.join(tmpRoot, 'docs')
    fs.ensureDirSync(existing)
    const text = JSON.stringify({
      version: 1,
      name: 'Demo',
      folders: [{ path: 'docs' }, { path: 'gone' }]
    })

    const { descriptor, roots, missing } = await parseWorkspace(text, workspaceFile())

    expect(descriptor.name).toBe('Demo')
    expect(roots.map((root) => root.path)).toEqual([path.normalize(existing)])
    expect(missing).toEqual([path.normalize(path.join(tmpRoot, 'gone'))])
  })

  it('uses the entry name as the display label when provided', async() => {
    fs.ensureDirSync(path.join(tmpRoot, 'docs'))
    const text = JSON.stringify({ folders: [{ path: 'docs', name: 'Documentation' }] })

    const { roots } = await parseWorkspace(text, workspaceFile())
    expect(roots[0].name).toBe('Documentation')
  })

  it('defaults the workspace name to the file name without extension', async() => {
    const { descriptor } = await parseWorkspace(JSON.stringify({ folders: [] }), workspaceFile())
    expect(descriptor.name).toBe('demo')
  })

  it('rejects invalid JSON', async() => {
    await expect(parseWorkspace('{ not json', workspaceFile())).rejects.toThrow(/invalid JSON/)
  })

  it('rejects a descriptor without a folders array', async() => {
    await expect(parseWorkspace(JSON.stringify({ name: 'x' }), workspaceFile())).rejects.toThrow(
      /missing "folders"/
    )
  })

  it('offers the descriptor directory first and the volume root as fallback for relative entries', () => {
    const candidates = resolveEntryCandidates('Git/zgame', workspaceFile())
    const volumeRoot = path.parse(path.resolve(workspaceFile())).root

    expect(candidates).toHaveLength(2)
    expect(candidates[0]).toBe(path.normalize(path.join(tmpRoot, 'Git', 'zgame')))
    expect(candidates[1]).toBe(path.normalize(path.join(volumeRoot, 'Git', 'zgame')))
  })

  it('gives absolute entries a single candidate', () => {
    const absolute = path.join(tmpRoot, 'docs')
    expect(resolveEntryCandidates(absolute, workspaceFile())).toEqual([path.normalize(absolute)])
  })

  it('resolves a relative entry against the volume root when the descriptor directory has no match', async() => {
    const volumeRoot = path.parse(path.resolve(workspaceFile())).root
    const probeName = `mt-ws-probe-${Date.now()}`
    const probeDir = path.join(volumeRoot, probeName)
    try {
      fs.ensureDirSync(probeDir)
    } catch {
      return // volume root not writable here; the candidate test above still covers the logic
    }
    try {
      const { roots, missing } = await parseWorkspace(
        JSON.stringify({ folders: [{ path: probeName }] }),
        workspaceFile()
      )
      expect(missing).toEqual([])
      expect(roots.map((root) => root.path)).toEqual([path.normalize(probeDir)])
    } finally {
      fs.removeSync(probeDir)
    }
  })

  it('stores absolute paths regardless of where the descriptor lives', () => {
    const inside = path.join(tmpRoot, 'docs')
    const outside = path.join(tmpRoot, '..', 'outside-root')
    const descriptor = buildDescriptor(
      'Demo',
      [
        { path: inside, name: 'docs' },
        { path: outside, name: 'outside-root' }
      ],
      workspaceFile()
    )

    expect(path.isAbsolute(descriptor.folders[0].path)).toBe(true)
    expect(path.isAbsolute(descriptor.folders[1].path)).toBe(true)
    expect(descriptor.folders[0].path).toBe(path.normalize(inside))
    expect(descriptor.folders[1].path).toBe(path.normalize(outside))
  })

  it('omits the stored name when it matches the folder basename', () => {
    const descriptor = buildDescriptor('Demo', [
      { path: path.join(tmpRoot, 'docs'), name: 'docs' }
    ], workspaceFile())

    expect(descriptor.folders[0].name).toBeUndefined()
  })

  it('round-trips through writeWorkspace/readWorkspace', async() => {
    const inside = path.join(tmpRoot, 'a')
    const other = path.join(tmpRoot, 'b')
    fs.ensureDirSync(inside)
    fs.ensureDirSync(other)
    const roots = [
      { path: inside, name: 'Alpha' },
      { path: other, name: 'b' }
    ]

    const descriptor = buildDescriptor('Round Trip', roots, workspaceFile())
    await writeWorkspace(workspaceFile(), descriptor)
    const parsed = await readWorkspace(workspaceFile())

    expect(parsed.descriptor.name).toBe('Round Trip')
    expect(parsed.missing).toEqual([])
    expect(parsed.roots.map((root) => root.path).sort()).toEqual(
      [path.normalize(inside), path.normalize(other)].sort()
    )
    expect(parsed.roots.map((root) => root.name).sort()).toEqual(['Alpha', 'b'])
  })
})
