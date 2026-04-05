import type {
  CounterSnapshot,
  HistoryEntry,
  PublishedHistory,
  SummaryStatus,
} from './types'

export function buildHistoryEntry(
  summary: SummaryStatus,
  snapshots: CounterSnapshot[]
): HistoryEntry {
  return {
    generated_at: summary.generated_at,
    head_reference: summary.head_reference,
    counters: snapshots.map((snapshot) => ({
      id: snapshot.id,
      label: snapshot.label,
      count: snapshot.count,
    })),
  }
}

export function mergePublishedHistory(
  summary: SummaryStatus,
  snapshots: CounterSnapshot[],
  existing: PublishedHistory | null
): PublishedHistory {
  const entry = buildHistoryEntry(summary, snapshots)
  const entries = existing ? [...existing.entries] : []
  const existingIndex = entries.findIndex(
    (item) => item.head_reference === entry.head_reference
  )

  if (existingIndex >= 0) {
    entries[existingIndex] = entry
  } else {
    entries.push(entry)
  }

  return {
    repository: summary.repository,
    default_branch: summary.default_branch,
    entries,
  }
}
