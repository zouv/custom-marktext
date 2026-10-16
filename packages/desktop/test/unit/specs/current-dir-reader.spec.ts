import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import os from 'os'
import fs from 'fs-extra'
import { readCurrentDirEntries } from '../../../src/main/currentDir/reader'

let tmpRoot: string

const names = async(dir = tmpRoot): Promise<string[]> =>
  (await readCurrentDirEntries(dir)).map((entry) => entry.name)

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-current-dir-'))
})

afterEach(() => {
  fs.removeSync(tmpRoot)
})

describe('readCurrentDirEntries', () => {
  it('lists folders before markdown files', async() => {
    fs.outputFileSync(path.join(tmpRoot, 'beta.md'), '# b')
    fs.ensureDirSync(path.join(tmpRoot, 'alpha'))

    const entries = await readCurrentDirEntries(tmpRoot)

    expect(entries.map((entry) => entry.name)).toEqual(['alpha', 'beta.md'])
    expect(entries[0].isDirectory).toBe(true)
    expect(entries[0].pathname).toBe(path.join(tmpRoot, 'alpha'))
    expect(entries[1].isDirectory).toBe(false)
  })

  it('sorts naturally, so numbered names keep their numeric order', async() => {
    fs.outputFileSync(path.join(tmpRoot, 'note10.md'), '# 10')
    fs.outputFileSync(path.join(tmpRoot, 'note2.md'), '# 2')

    expect(await names()).toEqual(['note2.md', 'note10.md'])
  })

  it('drops files outside the markdown whitelist but keeps every folder', async() => {
    fs.outputFileSync(path.join(tmpRoot, 'image.png'), 'png')
    fs.outputFileSync(path.join(tmpRoot, 'data.json'), '{}')
    fs.ensureDirSync(path.join(tmpRoot, 'assets'))

    expect(await names()).toEqual(['assets'])
  })

  it('keeps text files, which the markdown whitelist treats as notes', async() => {
    fs.outputFileSync(path.join(tmpRoot, 'README.txt'), 'txt')

    expect(await names()).toEqual(['README.txt'])
  })

  it('prunes ignored directories', async() => {
    fs.ensureDirSync(path.join(tmpRoot, 'node_modules'))
    fs.ensureDirSync(path.join(tmpRoot, '.git'))
    fs.ensureDirSync(path.join(tmpRoot, 'keep'))

    expect(await names()).toEqual(['keep'])
  })

  it('rejects when the directory cannot be read', async() => {
    await expect(readCurrentDirEntries(path.join(tmpRoot, 'missing'))).rejects.toThrow()
  })
})
