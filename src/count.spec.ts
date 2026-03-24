import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

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
})
