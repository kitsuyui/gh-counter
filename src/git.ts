import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import { promisify } from 'node:util'
import * as github from '@actions/github'
import micromatch from 'micromatch'

import type { ChangedFileStatus, CounterConfig } from './types'

const execFileAsync = promisify(execFile)

async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  return stdout.trim()
}

export async function ensureBaseFetched(baseBranch: string): Promise<void> {
  await execFileAsync(
    'git',
    ['fetch', '--no-tags', 'origin', baseBranch, '--depth=1'],
    {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }
  )
}

export async function resolvePullRequestBaseReference(
  defaultBranch: string
): Promise<string | null> {
  const context = github.context
  const baseRef = context.payload.pull_request?.base?.ref ?? defaultBranch

  try {
    await ensureBaseFetched(baseRef)
    return await git(['merge-base', 'HEAD', `origin/${baseRef}`])
  } catch {
    return context.payload.pull_request?.base?.sha ?? null
  }
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
      }
    })
}

export function touchedFilesForCounter(
  counter: CounterConfig,
  changedFiles: string[]
): string[] {
  const touched = new Set<string>()
  for (const matcher of counter.matchers) {
    for (const file of micromatch(changedFiles, matcher.files, {
      ignore: matcher.exclude ?? [],
      dot: true,
    })) {
      touched.add(file)
    }
  }
  return [...touched].sort()
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
