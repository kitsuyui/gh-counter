import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as github from '@actions/github'

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
