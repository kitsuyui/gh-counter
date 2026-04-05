import { describe, expect, test } from 'vitest'

import { buildHistoryEntry, mergePublishedHistory } from './history'

const summary = {
  generated_at: '2026-04-05T01:23:45.000Z',
  repository: 'kitsuyui/gh-counter',
  default_branch: 'main',
  publish_branch: 'gh-counter',
  event_name: 'push',
  base_label: 'main',
  base_reference: 'abc1234',
  head_label: 'main',
  head_reference: 'def5678',
  bootstrap_message: null,
  base_only_paths: [],
  counters: [],
}

describe('history helpers', () => {
  test('builds a history entry from repo-wide snapshots', () => {
    expect(
      buildHistoryEntry(summary, [
        {
          id: 'todo',
          label: 'TODOs',
          count: 3,
          matches: [],
        },
      ])
    ).toEqual({
      generated_at: '2026-04-05T01:23:45.000Z',
      head_reference: 'def5678',
      counters: [
        {
          id: 'todo',
          label: 'TODOs',
          count: 3,
        },
      ],
    })
  })

  test('appends a new entry when the commit is new', () => {
    const history = mergePublishedHistory(
      summary,
      [
        {
          id: 'todo',
          label: 'TODOs',
          count: 2,
          matches: [],
        },
      ],
      {
        repository: 'kitsuyui/gh-counter',
        default_branch: 'main',
        entries: [
          {
            generated_at: '2026-04-04T00:00:00.000Z',
            head_reference: 'abc1234',
            counters: [
              {
                id: 'todo',
                label: 'TODOs',
                count: 4,
              },
            ],
          },
        ],
      }
    )

    expect(history.entries).toHaveLength(2)
    expect(history.entries[1]?.head_reference).toBe('def5678')
    expect(history.entries[1]?.counters[0]?.count).toBe(2)
  })

  test('replaces an existing entry when the workflow reruns on the same commit', () => {
    const history = mergePublishedHistory(
      summary,
      [
        {
          id: 'todo',
          label: 'TODOs',
          count: 1,
          matches: [],
        },
      ],
      {
        repository: 'kitsuyui/gh-counter',
        default_branch: 'main',
        entries: [
          {
            generated_at: '2026-04-04T00:00:00.000Z',
            head_reference: 'abc1234',
            counters: [],
          },
          {
            generated_at: '2026-04-05T00:00:00.000Z',
            head_reference: 'def5678',
            counters: [
              {
                id: 'todo',
                label: 'TODOs',
                count: 9,
              },
            ],
          },
        ],
      }
    )

    expect(history.entries).toHaveLength(2)
    expect(history.entries[1]).toEqual({
      generated_at: '2026-04-05T01:23:45.000Z',
      head_reference: 'def5678',
      counters: [
        {
          id: 'todo',
          label: 'TODOs',
          count: 1,
        },
      ],
    })
  })
})
