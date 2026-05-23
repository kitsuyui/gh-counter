import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { countCounter } from './count'

describe('countCounter', () => {
  let tempDir: string
  let previousCwd: string

  beforeEach(async () => {
    previousCwd = process.cwd()
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-counter-'))
    process.chdir(tempDir)
  })

  afterEach(async () => {
    process.chdir(previousCwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  test('counts each matching line once even if multiple matchers match', async () => {
    await fs.mkdir('src', { recursive: true })
    await fs.writeFile(
      'src/index.ts',
      ['// TODO: first', '// FIXME: TODO reason', '// TODO FIXME'].join('\n'),
      'utf8'
    )

    const result = await countCounter(
      { kind: 'workspace' },
      {
        id: 'debt',
        label: 'Debt',
        matchers: [
          {
            files: ['src/**/*.ts'],
            type: 'contains',
            pattern: 'TODO',
          },
          {
            files: ['src/**/*.ts'],
            type: 'contains',
            pattern: 'FIXME',
          },
        ],
      }
    )

    expect(result.count).toBe(3)
  })

  test('skips binary files without treating them as matches', async () => {
    await fs.mkdir('src', { recursive: true })
    await fs.writeFile('src/binary.bin', Buffer.from('TODO\u0000reason'))

    const result = await countCounter(
      { kind: 'workspace' },
      {
        id: 'debt',
        label: 'Debt',
        matchers: [
          {
            files: ['src/**/*'],
            type: 'contains',
            pattern: 'TODO',
          },
        ],
      }
    )

    expect(result.count).toBe(0)
  })

  test('fails with path context when a matched file disappears', async () => {
    await fs.mkdir('src', { recursive: true })
    await fs.writeFile('src/index.ts', '// TODO: hidden\n', 'utf8')

    const originalReadFile = fs.readFile
    const missingFileError = Object.assign(
      new Error("ENOENT: no such file or directory, open 'src/index.ts'"),
      {
        code: 'ENOENT',
        path: 'src/index.ts',
        syscall: 'open',
      }
    )
    const readFileSpy = vi
      .spyOn(fs, 'readFile')
      .mockImplementation(
        async (
          filePath: Parameters<typeof fs.readFile>[0],
          options?: Parameters<typeof fs.readFile>[1]
        ) => {
          if (String(filePath).endsWith(path.join('src', 'index.ts'))) {
            throw missingFileError
          }
          return originalReadFile(filePath, options)
        }
      )

    try {
      await expect(
        countCounter(
          { kind: 'workspace' },
          {
            id: 'debt',
            label: 'Debt',
            matchers: [
              {
                files: ['src/**/*.ts'],
                type: 'contains',
                pattern: 'TODO',
              },
            ],
          }
        )
      ).rejects.toThrow(
        "Failed to read src/index.ts: ENOENT: no such file or directory, open 'src/index.ts'"
      )
    } finally {
      readFileSpy.mockRestore()
    }
  })
})
