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
      { path: 'new.ts', status: 'R' },
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
        path: 'src/index.ts',
        hunks: [
          {
            oldStart: 2,
            oldCount: 1,
            newStart: 2,
            newCount: 1,
            removed: [{ path: 'src/index.ts', line: 2, text: '// TODO: old' }],
            added: [{ path: 'src/index.ts', line: 2, text: '// TODO: new' }],
          },
          {
            oldStart: 5,
            oldCount: 0,
            newStart: 6,
            newCount: 2,
            removed: [],
            added: [
              { path: 'src/index.ts', line: 6, text: '// TODO: another' },
              { path: 'src/index.ts', line: 7, text: 'const value = 1' },
            ],
          },
        ],
      },
    ])
  })
})
