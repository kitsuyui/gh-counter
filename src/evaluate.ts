import type {
  CounterConfig,
  CounterSnapshot,
  CounterStatus,
  CounterViolation,
  FileDeltaStatus,
} from './types'

function buildFileDeltas(
  currentSnapshot: CounterSnapshot,
  baseSnapshot: CounterSnapshot | null
): FileDeltaStatus[] {
  const currentCounts = new Map<string, number>()
  const baseCounts = new Map<string, number>()

  for (const match of currentSnapshot.matches) {
    currentCounts.set(match.path, (currentCounts.get(match.path) ?? 0) + 1)
  }

  for (const match of baseSnapshot?.matches ?? []) {
    baseCounts.set(match.path, (baseCounts.get(match.path) ?? 0) + 1)
  }

  const paths = new Set([...currentCounts.keys(), ...baseCounts.keys()])
  return [...paths]
    .map((path) => {
      const current = currentCounts.get(path) ?? 0
      const base = baseCounts.get(path) ?? 0
      return {
        path,
        current,
        base,
        delta: current - base,
      }
    })
    .filter((item) => item.delta !== 0)
    .sort((left, right) => {
      const deltaDiff = Math.abs(right.delta) - Math.abs(left.delta)
      if (deltaDiff !== 0) {
        return deltaDiff
      }
      return left.path.localeCompare(right.path)
    })
}

function evaluateViolations(
  counter: CounterConfig & { label: string },
  current: number,
  base: number | null
): CounterViolation[] {
  const violations: CounterViolation[] = []

  if (counter.limit && current > counter.limit.max) {
    violations.push({
      kind: 'limit',
      message: `current value ${current} exceeds limit ${counter.limit.max}`,
      fail: counter.limit.fail ?? false,
    })
  }

  if (
    counter.ratchet?.target !== undefined &&
    current > counter.ratchet.target
  ) {
    violations.push({
      kind: 'target',
      message: `current value ${current} exceeds target ${counter.ratchet.target}`,
      fail: counter.ratchet.fail ?? false,
    })
  }

  if (counter.ratchet?.no_increase && base !== null && current > base) {
    violations.push({
      kind: 'no_increase',
      message: `current value ${current} increased from baseline ${base}`,
      fail: counter.ratchet.fail ?? false,
    })
  }

  return violations
}

export function evaluateCounters(
  counters: Array<CounterConfig & { label: string }>,
  currentSnapshots: CounterSnapshot[],
  baseSnapshots: CounterSnapshot[],
  touchedFilesByCounter: Map<string, string[]>,
  isPullRequest: boolean
): CounterStatus[] {
  const baseMap = new Map(
    baseSnapshots.map((snapshot) => [snapshot.id, snapshot])
  )

  return currentSnapshots.map((snapshot) => {
    const counter = counters.find((item) => item.id === snapshot.id)
    if (!counter) {
      throw new Error(`Unknown counter: ${snapshot.id}`)
    }
    const baseSnapshot = baseMap.get(snapshot.id) ?? null
    const base = baseSnapshot?.count ?? null
    const delta = base === null ? null : snapshot.count - base

    return {
      id: snapshot.id,
      label: snapshot.label,
      current: snapshot.count,
      base,
      delta,
      commentable: !isPullRequest || touchedFilesByCounter.has(snapshot.id),
      touched_files: touchedFilesByCounter.get(snapshot.id) ?? [],
      file_deltas: buildFileDeltas(snapshot, baseSnapshot),
      violations: evaluateViolations(counter, snapshot.count, base),
      badge_path: '',
      counter_path: '',
    }
  })
}

export function countFailingViolations(counters: CounterStatus[]): number {
  return counters.reduce((count, counter) => {
    if (!counter.commentable) {
      return count
    }
    return (
      count + counter.violations.filter((violation) => violation.fail).length
    )
  }, 0)
}
