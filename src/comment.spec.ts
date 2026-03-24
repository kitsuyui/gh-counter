import { describe, expect, test } from 'vitest'

import { buildMarker, decideCommentAction, renderComment } from './comment'

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
      '{{{marker}}}\n{{#counters}}{{label}} {{current}} {{delta_label}}{{/counters}}',
      buildMarker('main')
    )

    expect(body).toContain('<!-- gh-counter:main -->')
    expect(body).toContain('TODOs 3 +1')
  })
})
