import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import fg from 'fast-glob'
import micromatch from 'micromatch'

import type { MatcherConfig, MatchRecord } from './types'

const execFileAsync = promisify(execFile)

export const DEFAULT_EXCLUDES = [
  '.git/**',
  'node_modules/**',
  'dist/**',
  'coverage/**',
  '.gh-counter/**',
]

export type ContentSource =
  | { kind: 'workspace'; revision?: never }
  | { kind: 'revision'; revision: string }

export function createMatchKey(match: MatchRecord): string {
  return `${match.path}:${match.line}`
}

async function gitOutput(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  return stdout
}

export async function listFiles(source: ContentSource): Promise<string[]> {
  if (source.kind === 'workspace') {
    return fg(['**/*'], {
      onlyFiles: true,
      dot: true,
      ignore: DEFAULT_EXCLUDES,
      posix: true,
    })
  }

  const stdout = await gitOutput([
    'ls-tree',
    '-r',
    '--name-only',
    source.revision,
  ])
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function filterFiles(files: string[], matcher: MatcherConfig): string[] {
  return micromatch(files, matcher.files, {
    ignore: [...DEFAULT_EXCLUDES, ...(matcher.exclude ?? [])],
    dot: true,
  })
}

export async function readFile(
  source: ContentSource,
  filePath: string
): Promise<string | null> {
  try {
    if (source.kind === 'workspace') {
      const buffer = await fs.readFile(path.resolve(filePath))
      if (buffer.includes(0)) {
        return null
      }
      return buffer.toString('utf8')
    }

    const { stdout } = await execFileAsync(
      'git',
      ['show', `${source.revision}:${filePath}`],
      {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      }
    )
    if (stdout.includes('\u0000')) {
      return null
    }
    return stdout
  } catch {
    return null
  }
}

export function lineMatches(line: string, matcher: MatcherConfig): boolean {
  if (matcher.type === 'contains') {
    if (matcher.case_sensitive === false) {
      return line.toLowerCase().includes(matcher.pattern.toLowerCase())
    }
    return line.includes(matcher.pattern)
  }

  const flags = matcher.case_sensitive === false ? 'iu' : 'u'
  const regex = new RegExp(matcher.pattern, flags)
  return regex.test(line)
}
