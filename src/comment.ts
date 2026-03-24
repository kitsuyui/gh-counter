import Mustache from 'mustache'

import type { CounterStatus, SummaryStatus } from './types'

export type CommentAction =
  | { type: 'create'; body: string }
  | { type: 'update'; commentId: number; body: string }
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
  const view = {
    marker,
    counters: summary.counters.map((counter) => ({
      ...counter,
      hasBase: counter.base !== null,
      has_violations: counter.violations.length > 0,
      delta_label: deltaLabel(counter),
      violation_messages: counter.violations
        .map((item) => item.message)
        .join(', '),
    })),
  }
  return Mustache.render(template, view).trim()
}

export function decideCommentAction(
  existing: ExistingComment | null,
  body: string
): CommentAction {
  if (!existing) {
    return { type: 'create', body }
  }
  if (existing.body === body) {
    return { type: 'noop' }
  }
  return { type: 'update', commentId: existing.id, body }
}
