import { describe, expect, test } from 'vitest'

import { countFailingViolations, evaluateCounters } from './evaluate'

describe('evaluateCounters', () => {
  test('records both limit and target violations on failing counters', () => {
    const counters = evaluateCounters(
      [
        {
          id: 'counter-a',
          label: 'Counter A',
          matchers: [
            {
              files: ['src/**/*.ts'],
              type: 'contains',
              pattern: 'TODO',
            },
          ],
          limit: {
            max: 8,
            fail: true,
          },
          ratchet: {
            target: 10,
            fail: true,
          },
        },
        {
          id: 'counter-b',
          label: 'Counter B',
          matchers: [
            {
              files: ['src/**/*.ts'],
              type: 'contains',
              pattern: 'TODO',
            },
          ],
          limit: {
            max: 30,
            fail: true,
          },
          ratchet: {
            target: 20,
            fail: true,
          },
        },
      ],
      [
        { id: 'counter-a', label: 'Counter A', count: 12, matches: [] },
        { id: 'counter-b', label: 'Counter B', count: 19, matches: [] },
      ],
      [
        { id: 'counter-a', label: 'Counter A', count: 2, matches: [] },
        { id: 'counter-b', label: 'Counter B', count: 3, matches: [] },
      ],
      [],
      new Map(),
      false
    )

    expect(counters[0]).toMatchObject({
      id: 'counter-a',
      violations: [
        {
          kind: 'limit',
          message: '12 > limit 8',
          fail: true,
        },
        {
          kind: 'target',
          message: '12 > target 10',
          fail: true,
        },
      ],
    })
    expect(counters[1]?.violations).toEqual([])
  })

  test('does not emit no_increase violation when base snapshot is missing', () => {
    const counters = evaluateCounters(
      [
        {
          id: 'counter-c',
          label: 'Counter C',
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
      [{ id: 'counter-c', label: 'Counter C', count: 15, matches: [] }],
      [],
      [],
      new Map(),
      false
    )

    expect(counters[0]?.violations).toEqual([])
  })

  test('emits no_increase violation when count increases from base snapshot', () => {
    const counters = evaluateCounters(
      [
        {
          id: 'counter-d',
          label: 'Counter D',
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
      [{ id: 'counter-d', label: 'Counter D', count: 15, matches: [] }],
      [{ id: 'counter-d', label: 'Counter D', count: 9, matches: [] }],
      [],
      new Map(),
      false
    )

    expect(counters[0]).toMatchObject({
      violations: [
        {
          kind: 'no_increase',
          message: '9 → 15 (+6)',
          fail: true,
        },
      ],
    })
  })

  test('countFailingViolations ignores non-commentable and non-failing counters', () => {
    const counters = evaluateCounters(
      [
        {
          id: 'counter-failing-commented',
          label: 'Failing Commented',
          matchers: [
            {
              files: ['src/**/*.ts'],
              type: 'contains',
              pattern: 'TODO',
            },
          ],
          limit: {
            max: 10,
            fail: true,
          },
        },
        {
          id: 'counter-failing-untouched',
          label: 'Failing Untouched',
          matchers: [
            {
              files: ['src/**/*.ts'],
              type: 'contains',
              pattern: 'TODO',
            },
          ],
          limit: {
            max: 10,
            fail: true,
          },
        },
        {
          id: 'counter-non-failing-commented',
          label: 'Non-failing Commented',
          matchers: [
            {
              files: ['src/**/*.ts'],
              type: 'contains',
              pattern: 'TODO',
            },
          ],
          limit: {
            max: 10,
            fail: false,
          },
        },
      ],
      [
        {
          id: 'counter-failing-commented',
          label: 'Failing Commented',
          count: 15,
          matches: [],
        },
        {
          id: 'counter-failing-untouched',
          label: 'Failing Untouched',
          count: 15,
          matches: [],
        },
        {
          id: 'counter-non-failing-commented',
          label: 'Non-failing Commented',
          count: 15,
          matches: [],
        },
      ],
      [
        {
          id: 'counter-failing-commented',
          label: 'Failing Commented',
          count: 12,
          matches: [],
        },
        {
          id: 'counter-failing-untouched',
          label: 'Failing Untouched',
          count: 12,
          matches: [],
        },
        {
          id: 'counter-non-failing-commented',
          label: 'Non-failing Commented',
          count: 12,
          matches: [],
        },
      ],
      [
        {
          id: 'counter-failing-commented',
          label: 'Failing Commented',
          current: 15,
          base: 10,
          matches: [],
          base_matches: [],
        },
        {
          id: 'counter-failing-untouched',
          label: 'Failing Untouched',
          current: 15,
          base: 10,
          matches: [],
          base_matches: [],
        },
        {
          id: 'counter-non-failing-commented',
          label: 'Non-failing Commented',
          current: 15,
          base: 10,
          matches: [],
          base_matches: [],
        },
      ],
      new Map([
        ['counter-failing-commented', ['src/index.ts']],
        ['counter-non-failing-commented', ['src/main.ts']],
      ]),
      true
    )

    expect(counters[0]?.commentable).toBe(true)
    expect(counters[1]?.commentable).toBe(false)
    expect(counters[2]?.commentable).toBe(true)
    expect(countFailingViolations(counters)).toBe(1)
  })

  test('throws on unknown counter IDs', () => {
    expect(() => {
      evaluateCounters(
        [
          {
            id: 'known',
            label: 'Known',
            matchers: [
              {
                files: ['src/**/*.ts'],
                type: 'contains',
                pattern: 'TODO',
              },
            ],
            limit: {
              max: 10,
            },
          },
        ],
        [
          { id: 'unknown', label: 'Unknown', count: 2, matches: [] },
          { id: 'known', label: 'Known', count: 1, matches: [] },
        ],
        [{ id: 'known', label: 'Known', count: 1, matches: [] }],
        [
          {
            id: 'known',
            label: 'Known',
            current: 1,
            base: 0,
            matches: [],
            base_matches: [],
          },
        ],
        new Map(),
        false
      )
    }).toThrow('Unknown counter: unknown')
  })

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
