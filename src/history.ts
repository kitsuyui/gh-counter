import type {
  CounterSnapshot,
  HistoryEntry,
  PublishedHistory,
  SummaryStatus,
} from './types'

export const MAX_PUBLISHED_HISTORY_ENTRIES = 366

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

function historyEntryTimestamp(entry: HistoryEntry): number {
  const timestamp = Date.parse(entry.generated_at)
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp
}

function retainRecentHistoryEntries(entries: HistoryEntry[]): HistoryEntry[] {
  return [...entries]
    .sort((left, right) => {
      const timestampDelta =
        historyEntryTimestamp(left) - historyEntryTimestamp(right)
      if (timestampDelta !== 0) {
        return timestampDelta
      }
      return left.head_reference.localeCompare(right.head_reference)
    })
    .slice(-MAX_PUBLISHED_HISTORY_ENTRIES)
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
    entries: retainRecentHistoryEntries(entries),
  }
}
