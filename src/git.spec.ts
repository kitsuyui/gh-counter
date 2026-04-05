import { describe, expect, test } from 'vitest'

import {
  bootstrapMessageForAddedFiles,
  parseChangedFileStatuses,
  parseUnifiedDiff,
} from './git'

describe('git helpers', () => {
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
})
