import fs from 'node:fs/promises'
import path from 'node:path'
import * as core from '@actions/core'
import * as github from '@actions/github'
import { renderBadge } from './badge'
import { buildMarker, decideCommentAction, renderComment } from './comment'

import type {
  CounterConfig,
  CounterSnapshot,
  CounterStatus,
  NormalizedConfig,
  SummaryStatus,
} from './types'

type Octokit = ReturnType<typeof github.getOctokit>

function isPermissionError(error: unknown): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
  ) {
    return [401, 403, 404].includes(error.status)
  }
  return false
}

export async function findManagedComment(
  octokit: Octokit,
  marker: string
): Promise<{ id: number; body: string } | null> {
  const context = github.context
  const issueNumber = context.payload.pull_request?.number
  if (!issueNumber) {
    return null
  }
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    ...context.repo,
    issue_number: issueNumber,
    per_page: 100,
  })
  const found = comments.find((comment) => comment.body?.includes(marker))
  if (!found?.body) {
    return null
  }
  return {
    id: found.id,
    body: found.body,
  }
}

export async function updatePullRequestComment(
  octokit: Octokit,
  summary: SummaryStatus,
  config: NormalizedConfig
): Promise<void> {
  const issueNumber = github.context.payload.pull_request?.number
  if (!issueNumber || !config.comment.enabled) {
    return
  }
  const marker = buildMarker(config.comment.key)
  const body =
    summary.counters.some((counter) => counter.commentable) ||
    summary.bootstrap_message
      ? renderComment(summary, config.comment.template, marker)
      : null

  try {
    const existing = await findManagedComment(octokit, marker)
    const action = decideCommentAction(existing, body)
    if (action.type === 'create') {
      await octokit.rest.issues.createComment({
        ...github.context.repo,
        issue_number: issueNumber,
        body: action.body,
      })
    } else if (action.type === 'update') {
      await octokit.rest.issues.updateComment({
        ...github.context.repo,
        comment_id: action.commentId,
        body: action.body,
      })
    } else if (action.type === 'delete') {
      await octokit.rest.issues.deleteComment({
        ...github.context.repo,
        comment_id: action.commentId,
      })
    }
  } catch (error) {
    if (isPermissionError(error)) {
      core.warning(
        'gh-counter skipped PR comment updates because the workflow token cannot write pull request comments.'
      )
      return
    }
    throw error
  }
}

export async function fetchPublishedSummary(
  octokit: Octokit,
  branch: string,
  summaryFilename: string
): Promise<SummaryStatus | null> {
  try {
    const response = await octokit.rest.repos.getContent({
      ...github.context.repo,
      path: summaryFilename,
      ref: branch,
    })
    if (
      !('content' in response.data) ||
      typeof response.data.content !== 'string'
    ) {
      return null
    }
    return JSON.parse(
      Buffer.from(response.data.content, 'base64').toString('utf8')
    )
  } catch (error) {
    if (isPermissionError(error)) {
      return null
    }
    throw error
  }
}

async function ensureBranch(
  octokit: Octokit,
  branch: string
): Promise<{ commitSha: string | null }> {
  try {
    const ref = await octokit.rest.git.getRef({
      ...github.context.repo,
      ref: `heads/${branch}`,
    })
    return {
      commitSha: ref.data.object.sha,
    }
  } catch (error) {
    if (!isPermissionError(error)) {
      throw error
    }
  }
  return { commitSha: null }
}

export async function publishAssets(
  octokit: Octokit,
  summary: SummaryStatus,
  counters: CounterStatus[],
  snapshots: CounterSnapshot[],
  counterConfigs: Array<CounterConfig & { label: string }>,
  config: NormalizedConfig
): Promise<void> {
  if (!config.publish.enabled || !summary.publish_branch) {
    return
  }

  const branch = summary.publish_branch
  try {
    const branchState = await ensureBranch(octokit, branch)
    const treeEntries = [
      {
        path: path.posix.join(
          config.publish.directory,
          config.publish.summary_filename
        ),
        mode: '100644' as const,
        type: 'blob' as const,
        content: `${JSON.stringify(summary, null, 2)}\n`,
      },
    ]

    for (const counter of counters) {
      const snapshot = snapshots.find((item) => item.id === counter.id)
      const counterConfig = counterConfigs.find(
        (item) => item.id === counter.id
      )
      if (!snapshot) {
        continue
      }
      treeEntries.push({
        path: path.posix.join(
          config.publish.directory,
          config.publish.badges_directory,
          `${counter.id}.svg`
        ),
        mode: '100644' as const,
        type: 'blob' as const,
        content: renderBadge(counter, counterConfig?.badge),
      })
      treeEntries.push({
        path: path.posix.join(
          config.publish.directory,
          config.publish.counters_directory,
          `${counter.id}.json`
        ),
        mode: '100644' as const,
        type: 'blob' as const,
        content: `${JSON.stringify(snapshot, null, 2)}\n`,
      })
    }

    const tree = await octokit.rest.git.createTree({
      ...github.context.repo,
      tree: treeEntries,
    })
    const commit = await octokit.rest.git.createCommit({
      ...github.context.repo,
      message: 'Update gh-counter assets',
      tree: tree.data.sha,
      parents: branchState.commitSha ? [branchState.commitSha] : [],
    })
    if (branchState.commitSha) {
      await octokit.rest.git.updateRef({
        ...github.context.repo,
        ref: `heads/${branch}`,
        sha: commit.data.sha,
        force: true,
      })
    } else {
      await octokit.rest.git.createRef({
        ...github.context.repo,
        ref: `refs/heads/${branch}`,
        sha: commit.data.sha,
      })
    }
  } catch (error) {
    if (isPermissionError(error)) {
      core.warning(
        `gh-counter skipped publish-branch updates because the workflow token cannot write branch "${branch}".`
      )
      return
    }
    throw error
  }
}

export async function writeOutputFiles(
  outputDir: string,
  summary: SummaryStatus,
  counters: CounterStatus[],
  snapshots: CounterSnapshot[],
  counterConfigs: Array<CounterConfig & { label: string }>
): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(
    path.join(outputDir, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8'
  )
  await fs.mkdir(path.join(outputDir, 'badges'), { recursive: true })
  await fs.mkdir(path.join(outputDir, 'counters'), { recursive: true })

  for (const counter of counters) {
    const snapshot = snapshots.find((item) => item.id === counter.id)
    const counterConfig = counterConfigs.find((item) => item.id === counter.id)
    if (!snapshot) {
      continue
    }
    await fs.writeFile(
      path.join(outputDir, 'badges', `${counter.id}.svg`),
      renderBadge(counter, counterConfig?.badge),
      'utf8'
    )
    await fs.writeFile(
      path.join(outputDir, 'counters', `${counter.id}.json`),
      `${JSON.stringify(snapshot, null, 2)}\n`,
      'utf8'
    )
  }
}
