import { describe, expect, test } from 'vitest'

import { parsePublishedHistory, parseSummaryStatus } from './github'

const validSummary = {
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
  counters: [
    {
      id: 'todo',
      label: 'TODO',
      current: 5,
      base: 3,
      delta: 2,
      dashboard_current: 5,
      dashboard_base: 3,
      dashboard_delta: 2,
      commentable: true,
      touched_files: [],
      file_deltas: [],
      patch_file_deltas: [],
      violations: [],
      badge_path: 'badges/todo.svg',
      counter_path: 'counters/todo.json',
    },
  ],
}

const validHistory = {
  repository: 'kitsuyui/gh-counter',
  default_branch: 'main',
  entries: [
    {
      generated_at: '2026-04-05T01:23:45.000Z',
      head_reference: 'def5678',
      counters: [{ id: 'todo', label: 'TODO', count: 5 }],
    },
  ],
}

describe('parseSummaryStatus', () => {
  test('returns typed value for valid data', () => {
    const result = parseSummaryStatus(validSummary)
    expect(result).not.toBeNull()
    expect(result?.repository).toBe('kitsuyui/gh-counter')
    expect(result?.counters[0]?.current).toBe(5)
  })

  test('returns null for null input', () => {
    expect(parseSummaryStatus(null)).toBeNull()
  })

  test('returns null for undefined input', () => {
    expect(parseSummaryStatus(undefined)).toBeNull()
  })

  test('returns null when required top-level field is missing', () => {
    const { head_reference: _, ...missing } = validSummary
    expect(parseSummaryStatus(missing)).toBeNull()
  })

  test('returns null when counters item lacks required id field', () => {
    const data = {
      ...validSummary,
      counters: [{ current: 5 }],
    }
    expect(parseSummaryStatus(data)).toBeNull()
  })

  test('returns null when counters item has wrong type for current', () => {
    const data = {
      ...validSummary,
      counters: [{ id: 'todo', current: 'not-a-number' }],
    }
    expect(parseSummaryStatus(data)).toBeNull()
  })

  test('returns null when counters item lacks dashboard_current field', () => {
    const data = {
      ...validSummary,
      counters: [
        {
          id: 'todo',
          label: 'TODO',
          current: 5,
          base: 3,
          delta: 2,
          dashboard_base: 3,
          dashboard_delta: 2,
          commentable: true,
          touched_files: [],
          file_deltas: [],
          patch_file_deltas: [],
          violations: [],
          badge_path: 'badges/todo.svg',
          counter_path: 'counters/todo.json',
        },
      ],
    }
    expect(parseSummaryStatus(data)).toBeNull()
  })

  test('returns null for non-object input', () => {
    expect(parseSummaryStatus('string')).toBeNull()
    expect(parseSummaryStatus(42)).toBeNull()
    expect(parseSummaryStatus([])).toBeNull()
  })

  test('accepts null values for nullable fields', () => {
    const data = {
      ...validSummary,
      publish_branch: null,
      base_reference: null,
      bootstrap_message: null,
    }
    expect(parseSummaryStatus(data)).not.toBeNull()
  })
})

describe('parsePublishedHistory', () => {
  test('returns typed value for valid data', () => {
    const result = parsePublishedHistory(validHistory)
    expect(result).not.toBeNull()
    expect(result?.repository).toBe('kitsuyui/gh-counter')
    expect(result?.entries[0]?.counters[0]?.count).toBe(5)
  })

  test('returns null for null input', () => {
    expect(parsePublishedHistory(null)).toBeNull()
  })

  test('returns null for undefined input', () => {
    expect(parsePublishedHistory(undefined)).toBeNull()
  })

  test('returns null when required top-level field is missing', () => {
    const { entries: _, ...missing } = validHistory
    expect(parsePublishedHistory(missing)).toBeNull()
  })

  test('returns null when entry item lacks required head_reference', () => {
    const data = {
      ...validHistory,
      entries: [
        {
          generated_at: '2026-04-05T01:23:45.000Z',
          counters: [],
        },
      ],
    }
    expect(parsePublishedHistory(data)).toBeNull()
  })

  test('returns null when history counter lacks required count field', () => {
    const data = {
      ...validHistory,
      entries: [
        {
          generated_at: '2026-04-05T01:23:45.000Z',
          head_reference: 'def5678',
          counters: [{ id: 'todo', label: 'TODO' }],
        },
      ],
    }
    expect(parsePublishedHistory(data)).toBeNull()
  })

  test('returns null when history counter lacks required label field', () => {
    const data = {
      ...validHistory,
      entries: [
        {
          generated_at: '2026-04-05T01:23:45.000Z',
          head_reference: 'def5678',
          counters: [{ id: 'todo', count: 5 }],
        },
      ],
    }
    expect(parsePublishedHistory(data)).toBeNull()
  })

  test('accepts empty entries array', () => {
    const data = { ...validHistory, entries: [] }
    expect(parsePublishedHistory(data)).not.toBeNull()
  })
})
