import type {
  CounterConfig,
  CounterSnapshot,
  CounterStatus,
  CounterValueStatus,
  CounterViolation,
  FileDeltaStatus,
  PatchCounterSnapshot,
  PatchFileDeltaStatus,
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

function buildPatchValue(
  snapshot: PatchCounterSnapshot | null
): CounterValueStatus {
  const current = snapshot?.current ?? 0
  const base = snapshot?.base ?? 0
  return {
    current,
    base,
    delta: current - base,
  }
}

function buildRepoValue(
  currentSnapshot: CounterSnapshot,
  baseSnapshot: CounterSnapshot | null
): CounterValueStatus {
  const base = baseSnapshot?.count ?? null
  return {
    current: currentSnapshot.count,
    base,
    delta: base === null ? null : currentSnapshot.count - base,
  }
}

function buildPatchFileDeltas(
  patchSnapshot: PatchCounterSnapshot | null
): PatchFileDeltaStatus[] {
  const currentCounts = new Map<string, number>()
  const baseCounts = new Map<string, number>()

  for (const match of patchSnapshot?.matches ?? []) {
    currentCounts.set(match.path, (currentCounts.get(match.path) ?? 0) + 1)
  }
  for (const match of patchSnapshot?.base_matches ?? []) {
    baseCounts.set(match.path, (baseCounts.get(match.path) ?? 0) + 1)
  }

  const paths = new Set([...currentCounts.keys(), ...baseCounts.keys()])
  return [...paths]
    .map((path) => {
      const added = currentCounts.get(path) ?? 0
      const removed = baseCounts.get(path) ?? 0
      return {
        path,
        added,
        removed,
        delta: added - removed,
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
  const delta = base === null ? null : current - base
  const deltaLabel =
    delta === null ? null : delta > 0 ? `+${delta}` : `${delta}`

  if (counter.limit && current > counter.limit.max) {
    violations.push({
      kind: 'limit',
      message: `${current} > limit ${counter.limit.max}`,
      fail: counter.limit.fail ?? false,
    })
  }

  if (
    counter.ratchet?.target !== undefined &&
    current > counter.ratchet.target
  ) {
    violations.push({
      kind: 'target',
      message: `${current} > target ${counter.ratchet.target}`,
      fail: counter.ratchet.fail ?? false,
    })
  }

  if (counter.ratchet?.no_increase && base !== null && current > base) {
    violations.push({
      kind: 'no_increase',
      message: `${base} → ${current} (${deltaLabel})`,
      fail: counter.ratchet.fail ?? false,
    })
  }

  return violations
}

export function evaluateCounters(
  counters: Array<CounterConfig & { label: string }>,
  currentSnapshots: CounterSnapshot[],
  baseSnapshots: CounterSnapshot[],
  patchSnapshots: PatchCounterSnapshot[],
  touchedFilesByCounter: Map<string, string[]>,
  isPullRequest: boolean
): CounterStatus[] {
  const baseMap = new Map(
    baseSnapshots.map((snapshot) => [snapshot.id, snapshot])
  )
  const patchMap = new Map(
    patchSnapshots.map((snapshot) => [snapshot.id, snapshot])
  )

  return currentSnapshots.map((snapshot) => {
    const counter = counters.find((item) => item.id === snapshot.id)
    if (!counter) {
      throw new Error(`Unknown counter: ${snapshot.id}`)
    }
    const baseSnapshot = baseMap.get(snapshot.id) ?? null
    const patchSnapshot = patchMap.get(snapshot.id) ?? null
    const gateValue = isPullRequest
      ? buildPatchValue(patchSnapshot)
      : buildRepoValue(snapshot, baseSnapshot)
    const dashboardValue = buildRepoValue(snapshot, baseSnapshot)

    return {
      id: snapshot.id,
      label: snapshot.label,
      current: gateValue.current,
      base: gateValue.base,
      delta: gateValue.delta,
      dashboard_current: dashboardValue.current,
      dashboard_base: dashboardValue.base,
      dashboard_delta: dashboardValue.delta,
      commentable: !isPullRequest || touchedFilesByCounter.has(snapshot.id),
      touched_files: touchedFilesByCounter.get(snapshot.id) ?? [],
      file_deltas: buildFileDeltas(snapshot, baseSnapshot),
      patch_file_deltas: buildPatchFileDeltas(patchSnapshot),
      violations: evaluateViolations(
        counter,
        gateValue.current,
        gateValue.base
      ),
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
