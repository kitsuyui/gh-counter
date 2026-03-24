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
      new Map(),
      true
    )

    expect(counters[0]?.commentable).toBe(false)
    expect(countFailingViolations(counters)).toBe(0)
  })
})
