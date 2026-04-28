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
  return changedFilesForMatcher(entries)
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

export function changedFilesForMatcher(entries: ChangedFileStatus[]): string[] {
  return [
    ...new Set(
      entries.flatMap((entry) =>
        entry.status === 'R' && entry.old_path
          ? [entry.old_path, entry.path]
          : [entry.path]
      )
    ),
  ].sort()
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

interface DiffParserState {
  files: DiffFile[]
  currentFile: DiffFile | null
  currentHunk: DiffHunk | null
  currentOldPath: string | null
  currentNewPath: string | null
  oldLine: number
  newLine: number
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

function createDiffParserState(): DiffParserState {
  return {
    files: [],
    currentFile: null,
    currentHunk: null,
    currentOldPath: null,
    currentNewPath: null,
    oldLine: 0,
    newLine: 0,
  }
}

function openDiffFile(
  state: DiffParserState,
  newPath: string | null
): DiffFile {
  const file = {
    oldPath: state.currentOldPath,
    newPath,
    hunks: [],
  }
  state.currentNewPath = newPath
  state.currentFile = file
  state.currentHunk = null
  state.files.push(file)
  return file
}

function startDiffHunk(state: DiffParserState, header: string): boolean {
  if (!header.startsWith('@@ ')) {
    return false
  }
  if (!state.currentFile) {
    throw new Error(`Encountered hunk before file header: ${header}`)
  }

  const parsed = parseHunkHeader(header)
  state.currentHunk = {
    ...parsed,
    removed: [],
    added: [],
  }
  state.currentFile.hunks.push(state.currentHunk)
  state.oldLine = parsed.oldStart
  state.newLine = parsed.newStart
  return true
}

function handleDiffMetadataLine(state: DiffParserState, line: string): boolean {
  if (line.startsWith('diff --git ')) {
    const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line)
    state.currentOldPath = match?.[1] ?? null
    state.currentNewPath = match?.[2] ?? null
    state.currentFile = null
    state.currentHunk = null
    return true
  }
  if (line.startsWith('+++ b/')) {
    openDiffFile(state, line.slice('+++ b/'.length))
    return true
  }
  if (line === '+++ /dev/null') {
    openDiffFile(state, null)
    return true
  }
  if (line.startsWith('--- a/')) {
    state.currentOldPath = line.slice('--- a/'.length)
    return true
  }
  if (line === '--- /dev/null') {
    state.currentOldPath = null
    return true
  }

  return startDiffHunk(state, line)
}

function createDiffMatchRecord(
  file: DiffFile | null,
  line: number,
  rawText: string,
  kind: 'added' | 'removed'
): DiffMatchRecord {
  const path =
    kind === 'added'
      ? (file?.newPath ?? file?.oldPath ?? '')
      : (file?.oldPath ?? file?.newPath ?? '')

  return {
    path,
    line,
    text: rawText.trim(),
    rawText,
  }
}

function handleDiffContentLine(state: DiffParserState, line: string): boolean {
  if (!state.currentHunk) {
    return false
  }
  if (line.startsWith('-')) {
    const rawText = line.slice(1)
    state.currentHunk.removed.push(
      createDiffMatchRecord(
        state.currentFile,
        state.oldLine,
        rawText,
        'removed'
      )
    )
    state.oldLine += 1
    return true
  }
  if (line.startsWith('+')) {
    const rawText = line.slice(1)
    state.currentHunk.added.push(
      createDiffMatchRecord(state.currentFile, state.newLine, rawText, 'added')
    )
    state.newLine += 1
    return true
  }
  if (line.startsWith(' ')) {
    state.oldLine += 1
    state.newLine += 1
    return true
  }
  return false
}

export function parseUnifiedDiff(stdout: string): DiffFile[] {
  if (!stdout) {
    return []
  }

  const state = createDiffParserState()

  for (const line of stdout.split(/\r?\n/)) {
    if (
      handleDiffMetadataLine(state, line) ||
      handleDiffContentLine(state, line)
    ) {
    }
  }

  return state.files
}

function createMatcherOptions(matcher: CounterConfig['matchers'][number]) {
  return {
    ignore: [...DEFAULT_EXCLUDES, ...(matcher.exclude ?? [])],
    dot: true,
  }
}

function matchesCounterPath(counter: CounterConfig, path: string): boolean {
  return counter.matchers.some((matcher) =>
    micromatch.isMatch(path, matcher.files, createMatcherOptions(matcher))
  )
}

function collectRelevantPaths(
  changedFiles: ChangedFileStatus[],
  counters: Array<CounterConfig & { label: string }>
): string[] {
  const relevantPaths = new Set<string>()

  for (const changedFile of changedFiles) {
    const candidatePaths = [
      changedFile.old_path,
      changedFile.new_path,
      changedFile.path,
    ].filter((path): path is string => Boolean(path))

    if (
      !candidatePaths.some((path) =>
        counters.some((counter) => matchesCounterPath(counter, path))
      )
    ) {
      continue
    }

    for (const path of candidatePaths) {
      relevantPaths.add(path)
    }
  }

  return [...relevantPaths]
}

function createEmptyPatchCounterSnapshot(
  counter: CounterConfig & { label: string }
): PatchCounterSnapshot {
  return {
    id: counter.id,
    label: counter.label,
    current: 0,
    base: 0,
    matches: [],
    base_matches: [],
  }
}

function toMatchRecord(match: DiffMatchRecord): MatchRecord {
  return {
    path: match.path,
    line: match.line,
    text: match.text,
  }
}

function addUniqueMatches(
  target: Map<string, MatchRecord>,
  matches: DiffMatchRecord[]
): void {
  for (const match of matches) {
    const normalized = toMatchRecord(match)
    target.set(createMatchKey(normalized), normalized)
  }
}

function collectMatchingDiffRecords(
  matches: DiffMatchRecord[],
  matcher: CounterConfig['matchers'][number]
): DiffMatchRecord[] {
  const matchOptions = createMatcherOptions(matcher)
  return matches.filter(
    (match) =>
      micromatch.isMatch(match.path, matcher.files, matchOptions) &&
      lineMatches(match.rawText, matcher)
  )
}

function sortMatches(matches: Iterable<MatchRecord>): MatchRecord[] {
  return [...matches].sort((left, right) =>
    left.path === right.path
      ? left.line - right.line
      : left.path.localeCompare(right.path)
  )
}

function createPatchCounterSnapshot(
  counter: CounterConfig & { label: string },
  files: DiffFile[]
): PatchCounterSnapshot {
  const addedMatches = new Map<string, MatchRecord>()
  const removedMatches = new Map<string, MatchRecord>()

  for (const matcher of counter.matchers) {
    for (const file of files) {
      for (const hunk of file.hunks) {
        addUniqueMatches(
          addedMatches,
          collectMatchingDiffRecords(hunk.added, matcher)
        )
        addUniqueMatches(
          removedMatches,
          collectMatchingDiffRecords(hunk.removed, matcher)
        )
      }
    }
  }

  return {
    id: counter.id,
    label: counter.label,
    current: addedMatches.size,
    base: removedMatches.size,
    matches: sortMatches(addedMatches.values()),
    base_matches: sortMatches(removedMatches.values()),
  }
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

  const relevantPaths = collectRelevantPaths(changedFiles, counters)

  if (relevantPaths.length === 0) {
    return counters.map(createEmptyPatchCounterSnapshot)
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

  return counters.map((counter) => createPatchCounterSnapshot(counter, files))
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
