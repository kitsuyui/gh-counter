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

function shortReference(reference: string | null): string | null {
  if (!reference) {
    return null
  }
  return reference.slice(0, 7)
}

function deltaLabel(counter: CounterStatus): string | null {
  if (counter.delta === null) {
    return null
  }
  return counter.delta > 0 ? `+${counter.delta}` : `${counter.delta}`
}

function blobUrl(repository: string, reference: string, path: string): string {
  return `https://github.com/${repository}/blob/${reference}/${path}`
}

function renderCodeElement(value: string): string {
  return `<code>${value.replaceAll('&#x60;', '`').replaceAll('&#96;', '`')}</code>`
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
    base_header: shortReference(summary.base_reference)
      ? `${summary.base_label} (${shortReference(summary.base_reference)})`
      : summary.base_label,
    head_header: shortReference(summary.head_reference)
      ? `${summary.head_label} (${shortReference(summary.head_reference)})`
      : summary.head_label,
    code(): (text: string, render: (template: string) => string) => string {
      return (text, render) => renderCodeElement(render(text))
    },
    counters: commentableCounters.map((counter) => ({
      ...counter,
      hasBase: counter.base !== null,
      has_file_deltas: counter.file_deltas.length > 0,
      has_violations: counter.violations.length > 0,
      delta_label: deltaLabel(counter),
      file_deltas: counter.file_deltas.map((item) => ({
        ...item,
        url: blobUrl(summary.repository, summary.head_reference, item.path),
        delta_label: item.delta > 0 ? `+${item.delta}` : `${item.delta}`,
      })),
      violations: counter.violations.map((item) => ({
        ...item,
        icon: item.fail ? '❌' : '⚠️',
      })),
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
