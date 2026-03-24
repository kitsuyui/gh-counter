import { describe, expect, test } from 'vitest'

import { buildMarker, decideCommentAction, renderComment } from './comment'
import { DEFAULT_COMMENT_TEMPLATE } from './config'

describe('comment helpers', () => {
  test('builds an idempotent marker', () => {
    expect(buildMarker('default')).toBe('<!-- gh-counter:default -->')
  })

  test('updates an existing comment when body changed', () => {
    const action = decideCommentAction({ id: 1, body: 'before' }, 'after')
    expect(action).toEqual({
      type: 'update',
      commentId: 1,
      body: 'after',
    })
  })

  test('deletes an existing comment when there is nothing to comment', () => {
    const action = decideCommentAction({ id: 1, body: 'before' }, null)
    expect(action).toEqual({
      type: 'delete',
      commentId: 1,
    })
  })

  test('renders comment with marker and counters', () => {
    const body = renderComment(
      {
        generated_at: '2026-03-24T00:00:00Z',
        repository: 'kitsuyui/gh-counter',
        default_branch: 'main',
        publish_branch: 'gh-counter',
        event_name: 'pull_request',
        base_label: 'main',
        base_reference: 'base',
        head_label: '#8',
        head_reference: 'head',
        counters: [
          {
            id: 'todo',
            label: 'TODOs',
            current: 3,
            base: 2,
            delta: 1,
            commentable: true,
            touched_files: ['src/index.ts'],
            file_deltas: [
              {
                path: 'src/index.ts',
                current: 2,
                base: 1,
                delta: 1,
              },
              {
                path: 'src/other.ts',
                current: 1,
                base: 0,
                delta: 1,
              },
            ],
            violations: [],
            badge_path: '.gh-counter/badges/todo.svg',
            counter_path: '.gh-counter/counters/todo.json',
          },
        ],
      },
      DEFAULT_COMMENT_TEMPLATE,
      buildMarker('main')
    )

    expect(body).toContain('<!-- gh-counter:main -->')
    expect(body).toContain('|  | main (base) | #8 (head) | +/- |')
    expect(body).toContain('| `TODOs` | 2 | 3 | +1 |')
    expect(body).toContain(
      '<summary><code>TODOs</code> file breakdown</summary>'
    )
    expect(body).toContain(
      '| [`src/index.ts`](https://github.com/kitsuyui/gh-counter/blob/head/src/index.ts) | 1 | 2 | +1 |'
    )
    expect(body).toContain(
      'Reported by [gh-counter](https://github.com/kitsuyui/gh-counter)'
    )
  })

  test('renders concise violation messages', () => {
    const body = renderComment(
      {
        generated_at: '2026-03-24T00:00:00Z',
        repository: 'kitsuyui/gh-counter',
        default_branch: 'main',
        publish_branch: 'gh-counter',
        event_name: 'pull_request',
        base_label: 'main',
        base_reference: 'base',
        head_label: '#8',
        head_reference: 'head',
        bootstrap_message: null,
        counters: [
          {
            id: 'todo',
            label: 'TODOs',
            current: 19,
            base: 18,
            delta: 1,
            commentable: true,
            touched_files: ['src/index.ts'],
            file_deltas: [],
            violations: [
              {
                kind: 'no_increase',
                message: '18 → 19 (+1)',
                fail: true,
              },
            ],
            badge_path: '.gh-counter/badges/todo.svg',
            counter_path: '.gh-counter/counters/todo.json',
          },
        ],
      },
      DEFAULT_COMMENT_TEMPLATE,
      buildMarker('main')
    )

    expect(body).toContain('- ❌ `TODOs`: 18 → 19 (+1)')
  })

  test('renders bootstrap message when the PR only introduces gh-counter', () => {
    const body = renderComment(
      {
        generated_at: '2026-03-24T00:00:00Z',
        repository: 'kitsuyui/gh-counter',
        default_branch: 'main',
        publish_branch: 'gh-counter',
        event_name: 'pull_request',
        base_label: 'main',
        base_reference: 'base',
        head_label: '#8',
        head_reference: 'head',
        bootstrap_message:
          'gh-counter was added in this pull request, but no configured matcher targets were touched in the diff yet.',
        counters: [],
      },
      DEFAULT_COMMENT_TEMPLATE,
      buildMarker('main')
    )

    expect(body).toContain('<!-- gh-counter:main -->')
    expect(body).toContain('gh-counter was added in this pull request')
    expect(body).toContain(
      'Reported by [gh-counter](https://github.com/kitsuyui/gh-counter)'
    )
  })
})
