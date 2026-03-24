import type { ContentSource } from './files'
import { createMatchKey, filterFiles, listFiles, readFile } from './files'
import type {
  CounterConfig,
  CounterSnapshot,
  MatcherConfig,
  MatchRecord,
} from './types'

async function countMatcher(
  source: ContentSource,
  matcher: MatcherConfig,
  files: string[],
  readCache: Map<string, string | null>
): Promise<MatchRecord[]> {
  const matches: MatchRecord[] = []

  for (const filePath of filterFiles(files, matcher)) {
    const cacheKey = `${source.kind}:${source.revision ?? 'workspace'}:${filePath}`
    let content = readCache.get(cacheKey)
    if (content === undefined) {
      content = await readFile(source, filePath)
      readCache.set(cacheKey, content)
    }
    if (content === null) {
      continue
    }

    for (const [index, line] of content.split(/\r?\n/).entries()) {
      if (matcher.type === 'contains') {
        const matched =
          matcher.case_sensitive === false
            ? line.toLowerCase().includes(matcher.pattern.toLowerCase())
            : line.includes(matcher.pattern)
        if (!matched) {
          continue
        }
      } else {
        const flags = matcher.case_sensitive === false ? 'iu' : 'u'
        if (!new RegExp(matcher.pattern, flags).test(line)) {
          continue
        }
      }

      matches.push({
        path: filePath,
        line: index + 1,
        text: line.trim(),
      })
    }
  }

  return matches
}

export async function countCounter(
  source: ContentSource,
  counter: CounterConfig & { label: string }
): Promise<CounterSnapshot> {
  const files = await listFiles(source)
  const readCache = new Map<string, string | null>()
  const dedup = new Map<string, MatchRecord>()

  for (const matcher of counter.matchers) {
    const matches = await countMatcher(source, matcher, files, readCache)
    for (const match of matches) {
      dedup.set(createMatchKey(match), match)
    }
  }

  const sortedMatches = [...dedup.values()].sort((left, right) => {
    if (left.path === right.path) {
      return left.line - right.line
    }
    return left.path.localeCompare(right.path)
  })

  return {
    id: counter.id,
    label: counter.label,
    count: sortedMatches.length,
    matches: sortedMatches,
  }
}

export async function countCounters(
  source: ContentSource,
  counters: Array<CounterConfig & { label: string }>
): Promise<CounterSnapshot[]> {
  const snapshots: CounterSnapshot[] = []
  for (const counter of counters) {
    snapshots.push(await countCounter(source, counter))
  }
  return snapshots
}
