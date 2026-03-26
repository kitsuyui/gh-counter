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

function renderGfmCodeSpan(value: string): string {
  const content = value.replaceAll('|', '\\|')
  const longestBacktickRun = Math.max(
    0,
    ...Array.from(content.matchAll(/`+/g), (match) => match[0].length)
  )
  const fence = '`'.repeat(Math.max(1, longestBacktickRun + 1))
  const paddedContent =
    content.startsWith(' ') ||
    content.endsWith(' ') ||
    content.startsWith('`') ||
    content.endsWith('`')
      ? ` ${content} `
      : content

  return `${fence}${paddedContent}${fence}`
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
    counters: commentableCounters.map((counter) => ({
      ...counter,
      label_code: renderGfmCodeSpan(counter.label),
      hasBase: counter.base !== null,
      has_file_deltas: counter.file_deltas.length > 0,
      has_violations: counter.violations.length > 0,
      delta_label: deltaLabel(counter),
      file_deltas: counter.file_deltas.map((item) => ({
        ...item,
        path_code: renderGfmCodeSpan(item.path),
        url: blobUrl(summary.repository, summary.head_reference, item.path),
        delta_label: item.delta > 0 ? `+${item.delta}` : `${item.delta}`,
      })),
      violations: counter.violations.map((item) => ({
        ...item,
        icon: item.fail ? '❌' : '⚠️',
        label_code: renderGfmCodeSpan(counter.label),
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
