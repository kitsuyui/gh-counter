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
        base_reference: 'base',
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
    expect(body).toContain('| Label | Current | Base | Delta |')
    expect(body).toContain('| `TODOs` | 3 | 2 | +1 |')
    expect(body).toContain(
      'Reported by [gh-counter](https://github.com/kitsuyui/gh-counter)'
    )
  })

  test('renders bootstrap message when the PR only introduces gh-counter', () => {
    const body = renderComment(
      {
        generated_at: '2026-03-24T00:00:00Z',
        repository: 'kitsuyui/gh-counter',
        default_branch: 'main',
        publish_branch: 'gh-counter',
        event_name: 'pull_request',
        base_reference: 'base',
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
