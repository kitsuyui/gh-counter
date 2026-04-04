import { describe, expect, test } from 'vitest'

import { countFailingViolations, evaluateCounters } from './evaluate'

describe('evaluateCounters', () => {
  test('marks untouched PR counters as non-commentable', () => {
    const counters = evaluateCounters(
      [
        {
          id: 'todo',
          label: 'TODOs',
          matchers: [
            {
              files: ['src/**/*.ts'],
              type: 'contains',
              pattern: 'TODO',
            },
          ],
          ratchet: {
            no_increase: true,
            fail: true,
          },
        },
      ],
      [{ id: 'todo', label: 'TODOs', count: 3, matches: [] }],
      [{ id: 'todo', label: 'TODOs', count: 1, matches: [] }],
      [
        {
          id: 'todo',
          label: 'TODOs',
          current: 1,
          base: 0,
          matches: [],
          base_matches: [],
        },
      ],
      new Map(),
      true
    )

    expect(counters[0]?.commentable).toBe(false)
    expect(countFailingViolations(counters)).toBe(0)
  })

  test('uses changed-lines snapshots for PR gate and repo snapshots for dashboard', () => {
    const counters = evaluateCounters(
      [
        {
          id: 'todo',
          label: 'TODOs',
          matchers: [
            {
              files: ['src/**/*.ts'],
              type: 'contains',
              pattern: 'TODO',
            },
          ],
          ratchet: {
            no_increase: true,
            fail: true,
          },
        },
      ],
      [{ id: 'todo', label: 'TODOs', count: 10, matches: [] }],
      [{ id: 'todo', label: 'TODOs', count: 7, matches: [] }],
      [
        {
          id: 'todo',
          label: 'TODOs',
          current: 1,
          base: 0,
          matches: [{ path: 'src/index.ts', line: 10, text: '// TODO: new' }],
          base_matches: [],
        },
      ],
      new Map([['todo', ['src/index.ts']]]),
      true
    )

    expect(counters[0]).toMatchObject({
      current: 1,
      base: 0,
      delta: 1,
      dashboard_current: 10,
      dashboard_base: 7,
      dashboard_delta: 3,
      patch_file_deltas: [
        {
          path: 'src/index.ts',
          added: 1,
          removed: 0,
          delta: 1,
        },
      ],
    })
  })
})
