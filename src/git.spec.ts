import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  bootstrapMessageForAddedFiles,
  changedFilesForMatcher,
  listChangedPatchSnapshots,
  parseChangedFileStatuses,
  parseUnifiedDiff,
} from './git'

describe('git helpers', () => {
  let previousCwd: string
  let tempDir: string

  beforeEach(async () => {
    previousCwd = process.cwd()
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-counter-git-'))
  })

  afterEach(async () => {
    process.chdir(previousCwd)
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  test('parses changed file statuses', () => {
    expect(
      parseChangedFileStatuses(
        [
          'A\t.github/gh-counter.yml',
          'M\tREADME.md',
          'R100\told.ts\tnew.ts',
        ].join('\n')
      )
    ).toEqual([
      { path: '.github/gh-counter.yml', status: 'A' },
      { path: 'README.md', status: 'M' },
      {
        path: 'new.ts',
        status: 'R',
        old_path: 'old.ts',
        new_path: 'new.ts',
      },
    ])
  })

  test('keeps both old and new renamed paths for matcher relevance', () => {
    expect(
      changedFilesForMatcher([
        { path: 'src/current.ts', status: 'M' },
        {
          path: 'src/new.ts',
          status: 'R',
          old_path: 'src/old.ts',
          new_path: 'src/new.ts',
        },
      ])
    ).toEqual(['src/current.ts', 'src/new.ts', 'src/old.ts'])
  })

  test('creates a bootstrap message for newly added gh-counter files', () => {
    expect(
      bootstrapMessageForAddedFiles(
        [
          { path: '.github/gh-counter.yml', status: 'A' },
          { path: '.github/workflows/gh-counter.yml', status: 'A' },
        ],
        [
          {
            path: '.github/workflows/gh-counter.yml',
            content:
              'jobs:\n  counter:\n    steps:\n      - uses: kitsuyui/gh-counter@v1.0.0\n',
          },
        ]
      )
    ).toContain('gh-counter was added in this pull request')
  })

  test('does not create a bootstrap message for modified files', () => {
    expect(
      bootstrapMessageForAddedFiles(
        [
          { path: '.github/gh-counter.yml', status: 'M' },
          { path: '.github/workflows/gh-counter.yml', status: 'M' },
        ],
        [
          {
            path: '.github/workflows/gh-counter.yml',
            content:
              'jobs:\n  counter:\n    steps:\n      - uses: kitsuyui/gh-counter@v1.0.0\n',
          },
        ]
      )
    ).toBeNull()
  })

  test('parses unified diff hunks into added and removed lines', () => {
    expect(
      parseUnifiedDiff(
        [
          'diff --git a/src/index.ts b/src/index.ts',
          '--- a/src/index.ts',
          '+++ b/src/index.ts',
          '@@ -2 +2 @@',
          '-// TODO: old',
          '+// TODO: new',
          '@@ -5,0 +6,2 @@',
          '+// TODO: another',
          '+const value = 1',
        ].join('\n')
      )
    ).toEqual([
      {
        oldPath: 'src/index.ts',
        newPath: 'src/index.ts',
        hunks: [
          {
            oldStart: 2,
            oldCount: 1,
            newStart: 2,
            newCount: 1,
            removed: [
              {
                path: 'src/index.ts',
                line: 2,
                text: '// TODO: old',
                rawText: '// TODO: old',
              },
            ],
            added: [
              {
                path: 'src/index.ts',
                line: 2,
                text: '// TODO: new',
                rawText: '// TODO: new',
              },
            ],
          },
          {
            oldStart: 5,
            oldCount: 0,
            newStart: 6,
            newCount: 2,
            removed: [],
            added: [
              {
                path: 'src/index.ts',
                line: 6,
                text: '// TODO: another',
                rawText: '// TODO: another',
              },
              {
                path: 'src/index.ts',
                line: 7,
                text: 'const value = 1',
                rawText: 'const value = 1',
              },
            ],
          },
        ],
      },
    ])
  })

  test('parses unified diff hunks with trailing section headers', () => {
    expect(
      parseUnifiedDiff(
        [
          'diff --git a/README.md b/README.md',
          '--- a/README.md',
          '+++ b/README.md',
          '@@ -12,1 +12,3 @@ small, reusable way to track signals such as `TODO`, `FIXME`, `@ts-ignore`, or',
          '-old line',
          '+new line',
          '+another line',
        ].join('\n')
      )
    ).toEqual([
      {
        oldPath: 'README.md',
        newPath: 'README.md',
        hunks: [
          {
            oldStart: 12,
            oldCount: 1,
            newStart: 12,
            newCount: 3,
            removed: [
              {
                path: 'README.md',
                line: 12,
                text: 'old line',
                rawText: 'old line',
              },
            ],
            added: [
              {
                path: 'README.md',
                line: 12,
                text: 'new line',
                rawText: 'new line',
              },
              {
                path: 'README.md',
                line: 13,
                text: 'another line',
                rawText: 'another line',
              },
            ],
          },
        ],
      },
    ])
  })

  test('parses CRLF diffs and keeps removed lines that start with dashes', () => {
    expect(
      parseUnifiedDiff(
        [
          'diff --git a/src/index.ts b/src/index.ts',
          '--- a/src/index.ts',
          '+++ b/src/index.ts',
          '@@ -2 +2 @@',
          '--- TODO: old',
          '+-- TODO: new',
        ].join('\r\n')
      )
    ).toEqual([
      {
        oldPath: 'src/index.ts',
        newPath: 'src/index.ts',
        hunks: [
          {
            oldStart: 2,
            oldCount: 1,
            newStart: 2,
            newCount: 1,
            removed: [
              {
                path: 'src/index.ts',
                line: 2,
                text: '-- TODO: old',
                rawText: '-- TODO: old',
              },
            ],
            added: [
              {
                path: 'src/index.ts',
                line: 2,
                text: '-- TODO: new',
                rawText: '-- TODO: new',
              },
            ],
          },
        ],
      },
    ])
  })

  test('keeps old and new paths distinct for renamed files', () => {
    expect(
      parseUnifiedDiff(
        [
          'diff --git a/src/old.ts b/src/new.ts',
          '--- a/src/old.ts',
          '+++ b/src/new.ts',
          '@@ -1 +1 @@',
          '-TODO old',
          '+TODO new',
        ].join('\n')
      )
    ).toEqual([
      {
        oldPath: 'src/old.ts',
        newPath: 'src/new.ts',
        hunks: [
          {
            oldStart: 1,
            oldCount: 1,
            newStart: 1,
            newCount: 1,
            removed: [
              {
                path: 'src/old.ts',
                line: 1,
                text: 'TODO old',
                rawText: 'TODO old',
              },
            ],
            added: [
              {
                path: 'src/new.ts',
                line: 1,
                text: 'TODO new',
                rawText: 'TODO new',
              },
            ],
          },
        ],
      },
    ])
  })

  test('parses added files with a null old path', () => {
    expect(
      parseUnifiedDiff(
        [
          'diff --git a/src/new.ts b/src/new.ts',
          '--- /dev/null',
          '+++ b/src/new.ts',
          '@@ -0,0 +1 @@',
          '+  TODO with indent',
        ].join('\n')
      )
    ).toEqual([
      {
        oldPath: null,
        newPath: 'src/new.ts',
        hunks: [
          {
            oldStart: 0,
            oldCount: 0,
            newStart: 1,
            newCount: 1,
            removed: [],
            added: [
              {
                path: 'src/new.ts',
                line: 1,
                text: 'TODO with indent',
                rawText: '  TODO with indent',
              },
            ],
          },
        ],
      },
    ])
  })

  test('lists added and removed patch matches between base and head', async () => {
    process.chdir(tempDir)
    execFileSync('git', ['init', '--initial-branch=main'], { stdio: 'ignore' })
    execFileSync('git', ['config', 'user.name', 'Test User'], {
      stdio: 'ignore',
    })
    execFileSync('git', ['config', 'user.email', 'test@example.com'], {
      stdio: 'ignore',
    })

    await fs.mkdir('src', { recursive: true })
    await fs.writeFile(
      'src/index.ts',
      ['// TODO: old task', 'const answer = 1'].join('\n'),
      'utf8'
    )
    execFileSync('git', ['add', '.'], { stdio: 'ignore' })
    execFileSync('git', ['commit', '-m', 'base'], { stdio: 'ignore' })
    const baseReference = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim()

    await fs.writeFile(
      'src/index.ts',
      ['const answer = 1', '// TODO: new task'].join('\n'),
      'utf8'
    )
    execFileSync('git', ['add', '.'], { stdio: 'ignore' })
    execFileSync('git', ['commit', '-m', 'head'], { stdio: 'ignore' })

    const [snapshot] = await listChangedPatchSnapshots(baseReference, [
      {
        id: 'todo',
        label: 'TODO',
        matchers: [
          {
            files: ['src/**/*.ts'],
            type: 'contains',
            pattern: 'TODO',
          },
        ],
      },
    ])

    expect(snapshot).toEqual({
      id: 'todo',
      label: 'TODO',
      current: 1,
      base: 1,
      matches: [
        {
          path: 'src/index.ts',
          line: 2,
          text: '// TODO: new task',
        },
      ],
      base_matches: [
        {
          path: 'src/index.ts',
          line: 1,
          text: '// TODO: old task',
        },
      ],
    })
  })

  test('returns zeroed patch snapshots when no relevant files changed', async () => {
    process.chdir(tempDir)
    execFileSync('git', ['init', '--initial-branch=main'], { stdio: 'ignore' })
    execFileSync('git', ['config', 'user.name', 'Test User'], {
      stdio: 'ignore',
    })
    execFileSync('git', ['config', 'user.email', 'test@example.com'], {
      stdio: 'ignore',
    })

    await fs.writeFile('README.md', 'base\n', 'utf8')
    execFileSync('git', ['add', '.'], { stdio: 'ignore' })
    execFileSync('git', ['commit', '-m', 'base'], { stdio: 'ignore' })
    const baseReference = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim()

    await fs.writeFile('README.md', 'head\n', 'utf8')
    execFileSync('git', ['add', '.'], { stdio: 'ignore' })
    execFileSync('git', ['commit', '-m', 'head'], { stdio: 'ignore' })

    await expect(
      listChangedPatchSnapshots(baseReference, [
        {
          id: 'todo',
          label: 'TODO',
          matchers: [
            {
              files: ['src/**/*.ts'],
              type: 'contains',
              pattern: 'TODO',
            },
          ],
        },
      ])
    ).resolves.toEqual([
      {
        id: 'todo',
        label: 'TODO',
        current: 0,
        base: 0,
        matches: [],
        base_matches: [],
      },
    ])
  })
})
