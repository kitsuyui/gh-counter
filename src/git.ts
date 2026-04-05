import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import { promisify } from 'node:util'
import * as github from '@actions/github'
import micromatch from 'micromatch'

import { createMatchKey, DEFAULT_EXCLUDES, lineMatches } from './files'

import type {
  ChangedFileStatus,
  CounterConfig,
  MatchRecord,
  PatchCounterSnapshot,
} from './types'

const execFileAsync = promisify(execFile)

async function git(args: string[]): Promise<string> {
  const stdout = await gitOutput(args)
  return stdout.trim()
}

async function gitOutput(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  return stdout
}

export async function ensureBaseFetched(baseBranch: string): Promise<void> {
  const isShallow = await git(['rev-parse', '--is-shallow-repository'])
  if (isShallow === 'true') {
    await execFileAsync(
      'git',
      ['fetch', '--no-tags', '--prune', '--unshallow', 'origin'],
      {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      }
    )
  }
  await execFileAsync(
    'git',
    ['fetch', '--no-tags', '--prune', 'origin', baseBranch],
    {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }
  )
}

export async function resolvePullRequestBaseReference(
  defaultBranch: string
): Promise<string> {
  const context = github.context
  const baseRef = context.payload.pull_request?.base?.ref ?? defaultBranch

  await ensureBaseFetched(baseRef)
  let baseReference: string
  try {
    baseReference = await git(['merge-base', 'HEAD', `origin/${baseRef}`])
  } catch {
    throw new Error(
      `Unable to resolve merge-base against origin/${baseRef}. ` +
        'Ensure the base ref exists locally and that the repository has full history available ' +
        '(for example, fetch full history before running this workflow).'
    )
  }
  if (!baseReference) {
    throw new Error(`Unable to resolve merge-base against origin/${baseRef}`)
  }
  return baseReference
}

export async function currentHeadReference(): Promise<string> {
  return git(['rev-parse', 'HEAD'])
}

export async function listChangedFiles(
  baseReference: string
): Promise<string[]> {
  const entries = await listChangedFileStatuses(baseReference)
  return entries.map((entry) => entry.path)
}

export async function listChangedFileStatuses(
  baseReference: string
): Promise<ChangedFileStatus[]> {
  const stdout = await git([
    'diff',
    '--name-status',
    '--find-renames',
    `${baseReference}...HEAD`,
  ])
  return parseChangedFileStatuses(stdout)
}

export function parseChangedFileStatuses(stdout: string): ChangedFileStatus[] {
  if (!stdout) {
    return []
  }

  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t').filter(Boolean)
      const rawStatus = parts[0] ?? ''
      const path = parts.at(-1)
      if (!path) {
        throw new Error(`Unable to parse changed file entry: ${line}`)
      }
      return {
        path,
        status: rawStatus.charAt(0),
        old_path: rawStatus.startsWith('R') ? parts[1] : undefined,
        new_path: rawStatus.startsWith('R') ? parts[2] : undefined,
      }
    })
}

function parseChangedFileStatusesZ(stdout: string): ChangedFileStatus[] {
  if (!stdout) {
    return []
  }

  const entries = stdout.split('\u0000').filter(Boolean)
  const files: ChangedFileStatus[] = []

  for (let index = 0; index < entries.length; ) {
    const rawStatus = entries[index] ?? ''
    const status = rawStatus.charAt(0)
    index += 1

    if (status === 'R' || status === 'C') {
      const oldPath = entries[index]
      const newPath = entries[index + 1]
      index += 2
      if (!oldPath || !newPath) {
        throw new Error(
          `Unable to parse changed file entry for status ${rawStatus}`
        )
      }
      files.push({
        path: newPath,
        status,
        old_path: oldPath,
        new_path: newPath,
      })
      continue
    }

    const path = entries[index]
    index += 1
    if (!path) {
      throw new Error(
        `Unable to parse changed file entry for status ${rawStatus}`
      )
    }
    files.push({ path, status })
  }

  return files
}

export function touchedFilesForCounter(
  counter: CounterConfig,
  changedFiles: string[]
): string[] {
  const touched = new Set<string>()
  for (const matcher of counter.matchers) {
    for (const file of micromatch(changedFiles, matcher.files, {
      ignore: [...DEFAULT_EXCLUDES, ...(matcher.exclude ?? [])],
      dot: true,
    })) {
      touched.add(file)
    }
  }
  return [...touched].sort()
}

interface DiffHunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  removed: DiffMatchRecord[]
  added: DiffMatchRecord[]
}

interface DiffFile {
  oldPath: string | null
  newPath: string | null
  hunks: DiffHunk[]
}

interface DiffMatchRecord extends MatchRecord {
  rawText: string
}

function parseHunkHeader(header: string): {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
} {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .+)?$/.exec(
    header
  )
  if (!match) {
    throw new Error(`Unable to parse diff hunk header: ${header}`)
  }
  return {
    oldStart: Number(match[1]),
    oldCount: Number(match[2] ?? '1'),
    newStart: Number(match[3]),
    newCount: Number(match[4] ?? '1'),
  }
}

export function parseUnifiedDiff(stdout: string): DiffFile[] {
  if (!stdout) {
    return []
  }

  const files: DiffFile[] = []
  const lines = stdout.split(/\r?\n/)
  let currentFile: DiffFile | null = null
  let currentHunk: DiffHunk | null = null
  let currentOldPath: string | null = null
  let currentNewPath: string | null = null
  let oldLine = 0
  let newLine = 0

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line)
      currentOldPath = match?.[1] ?? null
      currentNewPath = match?.[2] ?? null
      currentFile = null
      currentHunk = null
      continue
    }
    if (line.startsWith('+++ b/')) {
      currentNewPath = line.slice('+++ b/'.length)
      currentFile = {
        oldPath: currentOldPath,
        newPath: currentNewPath,
        hunks: [],
      }
      files.push(currentFile)
      currentHunk = null
      continue
    }
    if (line === '+++ /dev/null') {
      currentNewPath = null
      currentFile = {
        oldPath: currentOldPath,
        newPath: currentNewPath,
        hunks: [],
      }
      files.push(currentFile)
      currentHunk = null
      continue
    }
    if (line.startsWith('--- a/')) {
      currentOldPath = line.slice('--- a/'.length)
      continue
    }
    if (line === '--- /dev/null') {
      currentOldPath = null
      continue
    }
    if (line.startsWith('@@ ')) {
      if (!currentFile) {
        throw new Error(`Encountered hunk before file header: ${line}`)
      }
      const parsed = parseHunkHeader(line)
      currentHunk = {
        ...parsed,
        removed: [],
        added: [],
      }
      currentFile.hunks.push(currentHunk)
      oldLine = parsed.oldStart
      newLine = parsed.newStart
      continue
    }
    if (!currentHunk) {
      continue
    }

    if (line.startsWith('-')) {
      const rawText = line.slice(1)
      currentHunk.removed.push({
        path: currentFile?.oldPath ?? currentFile?.newPath ?? '',
        line: oldLine,
        text: rawText.trim(),
        rawText,
      })
      oldLine += 1
      continue
    }
    if (line.startsWith('+')) {
      const rawText = line.slice(1)
      currentHunk.added.push({
        path: currentFile?.newPath ?? currentFile?.oldPath ?? '',
        line: newLine,
        text: rawText.trim(),
        rawText,
      })
      newLine += 1
      continue
    }
    if (line.startsWith(' ')) {
      oldLine += 1
      newLine += 1
    }
  }

  return files
}

export async function listChangedPatchSnapshots(
  baseReference: string,
  counters: Array<CounterConfig & { label: string }>
): Promise<PatchCounterSnapshot[]> {
  const changedFiles = parseChangedFileStatusesZ(
    await gitOutput([
      'diff',
      '--find-renames',
      '--name-status',
      '-z',
      `${baseReference}...HEAD`,
    ])
  )

  const isRelevantPath = (path: string): boolean =>
    counters.some((counter) =>
      counter.matchers.some((matcher) =>
        micromatch.isMatch(path, matcher.files, {
          ignore: [...DEFAULT_EXCLUDES, ...(matcher.exclude ?? [])],
          dot: true,
        })
      )
    )

  const relevantPaths = new Set<string>()
  for (const changedFile of changedFiles) {
    const candidatePaths = [
      changedFile.old_path,
      changedFile.new_path,
      changedFile.path,
    ].filter((path): path is string => Boolean(path))
    if (candidatePaths.some(isRelevantPath)) {
      for (const path of candidatePaths) {
        relevantPaths.add(path)
      }
    }
  }

  if (relevantPaths.size === 0) {
    return counters.map((counter) => ({
      id: counter.id,
      label: counter.label,
      current: 0,
      base: 0,
      matches: [],
      base_matches: [],
    }))
  }

  const stdout = await git([
    'diff',
    '--find-renames',
    '--unified=0',
    `${baseReference}...HEAD`,
    '--',
    ...relevantPaths,
  ])
  const files = parseUnifiedDiff(stdout)

  return counters.map((counter) => {
    const addedMatches = new Map<string, MatchRecord>()
    const removedMatches = new Map<string, MatchRecord>()

    for (const matcher of counter.matchers) {
      const matchOptions = {
        ignore: [...DEFAULT_EXCLUDES, ...(matcher.exclude ?? [])],
        dot: true,
      }
      for (const file of files) {
        for (const hunk of file.hunks) {
          for (const match of hunk.added) {
            if (
              micromatch.isMatch(match.path, matcher.files, matchOptions) &&
              lineMatches(match.rawText, matcher)
            ) {
              addedMatches.set(createMatchKey(match), {
                path: match.path,
                line: match.line,
                text: match.text,
              })
            }
          }
          for (const match of hunk.removed) {
            if (
              micromatch.isMatch(match.path, matcher.files, matchOptions) &&
              lineMatches(match.rawText, matcher)
            ) {
              removedMatches.set(createMatchKey(match), {
                path: match.path,
                line: match.line,
                text: match.text,
              })
            }
          }
        }
      }
    }

    return {
      id: counter.id,
      label: counter.label,
      current: addedMatches.size,
      base: removedMatches.size,
      matches: [...addedMatches.values()].sort((left, right) =>
        left.path === right.path
          ? left.line - right.line
          : left.path.localeCompare(right.path)
      ),
      base_matches: [...removedMatches.values()].sort((left, right) =>
        left.path === right.path
          ? left.line - right.line
          : left.path.localeCompare(right.path)
      ),
    }
  })
}

function isAddedGhCounterWorkflow(path: string, content: string): boolean {
  return (
    micromatch.isMatch(path, '.github/workflows/*.{yml,yaml}', {
      dot: true,
    }) && /uses:\s*kitsuyui\/gh-counter@/m.test(content)
  )
}

export function bootstrapMessageForAddedFiles(
  changedFiles: ChangedFileStatus[],
  workflowContents: Array<{ path: string; content: string }>
): string | null {
  const addedConfig = changedFiles.some(
    (entry) => entry.status === 'A' && entry.path === '.github/gh-counter.yml'
  )
  const addedWorkflowPaths = new Set(
    changedFiles
      .filter((entry) => entry.status === 'A')
      .map((entry) => entry.path)
  )
  const addedWorkflow = workflowContents.some(
    (entry) =>
      addedWorkflowPaths.has(entry.path) &&
      isAddedGhCounterWorkflow(entry.path, entry.content)
  )

  if (!addedConfig && !addedWorkflow) {
    return null
  }

  return 'gh-counter was added in this pull request, but no configured matcher targets were touched in the diff yet.'
}

export async function detectBootstrapComment(
  changedFiles: ChangedFileStatus[]
): Promise<string | null> {
  const addedWorkflowPaths = changedFiles
    .filter((entry) => entry.status === 'A')
    .map((entry) => entry.path)
    .filter((path) =>
      micromatch.isMatch(path, '.github/workflows/*.{yml,yaml}', {
        dot: true,
      })
    )

  const workflowContents = await Promise.all(
    addedWorkflowPaths.map(async (path) => ({
      path,
      content: await fs.readFile(path, 'utf8'),
    }))
  )

  return bootstrapMessageForAddedFiles(changedFiles, workflowContents)
}
