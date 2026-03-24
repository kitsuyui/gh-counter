import Mustache from 'mustache'

import type { CounterStatus, SummaryStatus } from './types'

export type CommentAction =
  | { type: 'create'; body: string }
  | { type: 'update'; commentId: number; body: string }
  | { type: 'delete'; commentId: number }
  | { type: 'noop' }

export interface ExistingComment {
  id: number
  body: string
}

export function buildMarker(key: string): string {
  return `<!-- gh-counter:${key} -->`
}

function deltaLabel(counter: CounterStatus): string | null {
  if (counter.delta === null) {
    return null
  }
  return counter.delta > 0 ? `+${counter.delta}` : `${counter.delta}`
}

export function renderComment(
  summary: SummaryStatus,
  template: string,
  marker: string
): string {
  const commentableCounters = summary.counters.filter(
    (counter) => counter.commentable
  )
  const view = {
    marker,
    bootstrap_message: summary.bootstrap_message,
    counters: commentableCounters.map((counter) => ({
      ...counter,
      hasBase: counter.base !== null,
      has_file_deltas: counter.file_deltas.length > 0,
      has_violations: counter.violations.length > 0,
      delta_label: deltaLabel(counter),
      file_deltas: counter.file_deltas.map((item) => ({
        ...item,
        delta_label: item.delta > 0 ? `+${item.delta}` : `${item.delta}`,
      })),
      violation_messages: counter.violations
        .map((item) => item.message)
        .join(', '),
    })),
  }
  return Mustache.render(template, view).trim()
}

export function decideCommentAction(
  existing: ExistingComment | null,
  body: string | null
): CommentAction {
  if (!body) {
    if (existing) {
      return { type: 'delete', commentId: existing.id }
    }
    return { type: 'noop' }
  }
  if (!existing) {
    return { type: 'create', body }
  }
  if (existing.body === body) {
    return { type: 'noop' }
  }
  return { type: 'update', commentId: existing.id, body }
}
