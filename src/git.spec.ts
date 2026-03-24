import { describe, expect, test } from 'vitest'

import { bootstrapMessageForAddedFiles, parseChangedFileStatuses } from './git'

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
})
