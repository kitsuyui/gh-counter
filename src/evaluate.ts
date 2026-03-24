import type {
  CounterConfig,
  CounterSnapshot,
  CounterStatus,
  CounterViolation,
} from './types'

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
  baseSnapshots: CounterSnapshot[]
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
      violations: evaluateViolations(counter, snapshot.count, base),
      badge_path: '',
      counter_path: '',
    }
  })
}

export function countFailingViolations(counters: CounterStatus[]): number {
  return counters.reduce((count, counter) => {
    return (
      count + counter.violations.filter((violation) => violation.fail).length
    )
  }, 0)
}
