import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  parsePublishedHistory,
  parseSummaryStatus,
  writeOutputFiles,
} from './github'
import type { CounterStatus, SummaryStatus } from './types'

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

describe('writeOutputFiles', () => {
  const minimalSummary: SummaryStatus = {
    generated_at: '2026-01-01T00:00:00.000Z',
    repository: 'kitsuyui/gh-counter',
    default_branch: 'main',
    publish_branch: null,
    event_name: 'push',
    base_label: 'main',
    base_reference: null,
    head_label: 'main',
    head_reference: 'abc1234',
    bootstrap_message: null,
    base_only_paths: [],
    counters: [],
  }

  const minimalCounter: CounterStatus = {
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
  }

  let tempRoot: string
  let outputDir: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gh-counter-test-'))
    outputDir = path.join(tempRoot, 'output')
  })

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  test('creates summary.json in outputDir', async () => {
    await writeOutputFiles(outputDir, minimalSummary, [], [], [])
    const content = await fs.readFile(
      path.join(outputDir, 'summary.json'),
      'utf8'
    )
    expect(JSON.parse(content).repository).toBe('kitsuyui/gh-counter')
  })

  test('leaves no .tmp directory after success', async () => {
    await writeOutputFiles(outputDir, minimalSummary, [], [], [])
    await expect(fs.access(`${outputDir}.tmp`)).rejects.toThrow()
  })

  test('writes counter badge and json when snapshot is provided', async () => {
    const snapshot = {
      id: 'todo',
      label: 'TODO',
      count: 5,
      history: [],
    }
    await writeOutputFiles(
      outputDir,
      minimalSummary,
      [minimalCounter],
      [snapshot as never],
      []
    )
    await expect(
      fs.access(path.join(outputDir, 'badges', 'todo.svg'))
    ).resolves.toBeUndefined()
    await expect(
      fs.access(path.join(outputDir, 'counters', 'todo.json'))
    ).resolves.toBeUndefined()
  })

  test('replaces an existing non-empty outputDir atomically', async () => {
    await fs.mkdir(outputDir, { recursive: true })
    await fs.writeFile(path.join(outputDir, 'stale.txt'), 'old', 'utf8')

    await writeOutputFiles(outputDir, minimalSummary, [], [], [])

    const files = await fs.readdir(outputDir)
    expect(files).not.toContain('stale.txt')
    expect(files).toContain('summary.json')
  })
})
