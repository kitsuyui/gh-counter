import type { ContentSource } from './files'
import {
  createMatchKey,
  filterFiles,
  lineMatches,
  listFiles,
  readFile,
} from './files'
import type {
  CounterConfig,
  CounterSnapshot,
  MatcherConfig,
  MatchRecord,
} from './types'

function createReadCacheKey(source: ContentSource, filePath: string): string {
  return `${source.kind}:${source.revision ?? 'workspace'}:${filePath}`
}

async function readCachedContent(
  source: ContentSource,
  filePath: string,
  readCache: Map<string, string | null>
): Promise<string | null> {
  const cacheKey = createReadCacheKey(source, filePath)
  const cachedContent = readCache.get(cacheKey)
  if (cachedContent !== undefined) {
    return cachedContent
  }

  const content = await readFile(source, filePath)
  readCache.set(cacheKey, content)
  return content
}

function collectMatchesInContent(
  filePath: string,
  content: string,
  matcher: MatcherConfig
): MatchRecord[] {
  return content.split(/\r?\n/).flatMap((line, index) =>
    lineMatches(line, matcher)
      ? [
          {
            path: filePath,
            line: index + 1,
            text: line.trim(),
          },
        ]
      : []
  )
}

async function countMatcher(
  source: ContentSource,
  matcher: MatcherConfig,
  files: string[],
  readCache: Map<string, string | null>
): Promise<MatchRecord[]> {
  const matches: MatchRecord[] = []

  for (const filePath of filterFiles(files, matcher)) {
    const content = await readCachedContent(source, filePath, readCache)
    if (content === null) {
      continue
    }

    matches.push(...collectMatchesInContent(filePath, content, matcher))
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
