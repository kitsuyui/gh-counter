import fs from 'node:fs/promises'
import path from 'node:path'
import * as core from '@actions/core'
import * as github from '@actions/github'
import Ajv from 'ajv'
import { renderBadge } from './badge'
import { buildMarker, decideCommentAction, renderComment } from './comment'
import { mergePublishedHistory } from './history'
import {
  renderCounterGraphSvg,
  renderCounterReportMarkdown,
} from './publish-report'

import type {
  CounterConfig,
  CounterSnapshot,
  CounterStatus,
  NormalizedConfig,
  PublishedHistory,
  SummaryStatus,
} from './types'

const ajv = new Ajv()

const validateSummaryStatus = ajv.compile({
  type: 'object',
  required: [
    'generated_at',
    'repository',
    'default_branch',
    'event_name',
    'base_label',
    'head_label',
    'head_reference',
    'base_only_paths',
    'counters',
  ],
  properties: {
    generated_at: { type: 'string' },
    repository: { type: 'string' },
    default_branch: { type: 'string' },
    publish_branch: { type: ['string', 'null'] },
    event_name: { type: 'string' },
    base_label: { type: 'string' },
    base_reference: { type: ['string', 'null'] },
    head_label: { type: 'string' },
    head_reference: { type: 'string' },
    bootstrap_message: { type: ['string', 'null'] },
    base_only_paths: { type: 'array', items: { type: 'string' } },
    counters: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'id',
          'label',
          'current',
          'base',
          'delta',
          'dashboard_current',
          'dashboard_base',
          'dashboard_delta',
          'commentable',
          'touched_files',
          'file_deltas',
          'patch_file_deltas',
          'violations',
          'badge_path',
          'counter_path',
        ],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          current: { type: 'number' },
          base: { type: ['number', 'null'] },
          delta: { type: ['number', 'null'] },
          dashboard_current: { type: 'number' },
          dashboard_base: { type: ['number', 'null'] },
          dashboard_delta: { type: ['number', 'null'] },
          commentable: { type: 'boolean' },
          touched_files: { type: 'array' },
          file_deltas: { type: 'array' },
          patch_file_deltas: { type: 'array' },
          violations: { type: 'array' },
          badge_path: { type: 'string' },
          counter_path: { type: 'string' },
        },
      },
    },
  },
})

const validatePublishedHistory = ajv.compile({
  type: 'object',
  required: ['repository', 'default_branch', 'entries'],
  properties: {
    repository: { type: 'string' },
    default_branch: { type: 'string' },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        required: ['generated_at', 'head_reference', 'counters'],
        properties: {
          generated_at: { type: 'string' },
          head_reference: { type: 'string' },
          counters: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'label', 'count'],
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                count: { type: 'number' },
              },
            },
          },
        },
      },
    },
  },
})

export function parseSummaryStatus(data: unknown): SummaryStatus | null {
  if (data === null || data === undefined) return null
  if (!validateSummaryStatus(data)) return null
  return data as SummaryStatus
}

export function parsePublishedHistory(data: unknown): PublishedHistory | null {
  if (data === null || data === undefined) return null
  if (!validatePublishedHistory(data)) return null
  return data as PublishedHistory
}

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

async function fetchPublishedJson(
  octokit: Octokit,
  branch: string,
  filename: string
): Promise<unknown> {
  try {
    const response = await octokit.rest.repos.getContent({
      ...github.context.repo,
      path: filename,
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

export async function fetchPublishedSummary(
  octokit: Octokit,
  branch: string,
  summaryFilename: string
): Promise<SummaryStatus | null> {
  const data = await fetchPublishedJson(octokit, branch, summaryFilename)
  const parsed = parseSummaryStatus(data)
  if (parsed === null && data !== null && data !== undefined) {
    core.warning(
      `Published ${summaryFilename} failed schema validation and will be ignored. ` +
        `This may occur after a schema migration. ` +
        `Errors: ${JSON.stringify(validateSummaryStatus.errors)}`
    )
  }
  return parsed
}

export async function fetchPublishedHistory(
  octokit: Octokit,
  branch: string,
  historyFilename: string
): Promise<PublishedHistory | null> {
  const data = await fetchPublishedJson(octokit, branch, historyFilename)
  const parsed = parsePublishedHistory(data)
  if (parsed === null && data !== null && data !== undefined) {
    core.warning(
      `Published ${historyFilename} failed schema validation and will be ignored. ` +
        `This may occur after a schema migration. ` +
        `Errors: ${JSON.stringify(validatePublishedHistory.errors)}`
    )
  }
  return parsed
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
    const existingHistory = await fetchPublishedHistory(
      octokit,
      branch,
      path.posix.join(config.publish.directory, config.publish.history_filename)
    )
    const publishedHistory = mergePublishedHistory(
      summary,
      snapshots,
      existingHistory
    )
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
      {
        path: path.posix.join(
          config.publish.directory,
          config.publish.history_filename
        ),
        mode: '100644' as const,
        type: 'blob' as const,
        content: `${JSON.stringify(publishedHistory, null, 2)}\n`,
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
          config.publish.graphs_directory,
          `${counter.id}.svg`
        ),
        mode: '100644' as const,
        type: 'blob' as const,
        content: renderCounterGraphSvg(
          publishedHistory,
          counter,
          config.publish.graph_days,
          counterConfig?.badge
        ),
      })
      treeEntries.push({
        path: path.posix.join(
          config.publish.directory,
          config.publish.reports_directory,
          `${counter.id}.md`
        ),
        mode: '100644' as const,
        type: 'blob' as const,
        content: `${renderCounterReportMarkdown(
          publishedHistory,
          counter,
          counterConfig,
          config
        )}\n`,
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
    try {
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
    } catch (refError) {
      if (!isPermissionError(refError)) {
        core.warning(
          `Failed to update ref "${branch}" after creating git objects. ` +
            `Unreachable objects: tree=${tree.data.sha} commit=${commit.data.sha}`
        )
      }
      throw refError
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
  counterConfigs: Array<CounterConfig & { label: string }>,
  publishedHistory: PublishedHistory | null = null,
  config: NormalizedConfig | null = null
): Promise<void> {
  const tmpDir = `${outputDir}.tmp`
  await fs.rm(tmpDir, { recursive: true, force: true })
  await fs.mkdir(tmpDir, { recursive: true })
  try {
    await fs.writeFile(
      path.join(tmpDir, 'summary.json'),
      `${JSON.stringify(summary, null, 2)}\n`,
      'utf8'
    )
    if (publishedHistory) {
      await fs.writeFile(
        path.join(tmpDir, 'history.json'),
        `${JSON.stringify(publishedHistory, null, 2)}\n`,
        'utf8'
      )
    }
    await fs.mkdir(path.join(tmpDir, 'badges'), { recursive: true })
    await fs.mkdir(path.join(tmpDir, 'counters'), { recursive: true })
    if (publishedHistory && config) {
      await fs.mkdir(path.join(tmpDir, 'graphs'), { recursive: true })
      await fs.mkdir(path.join(tmpDir, 'reports'), { recursive: true })
    }

    for (const counter of counters) {
      const snapshot = snapshots.find((item) => item.id === counter.id)
      const counterConfig = counterConfigs.find(
        (item) => item.id === counter.id
      )
      if (!snapshot) {
        continue
      }
      await fs.writeFile(
        path.join(tmpDir, 'badges', `${counter.id}.svg`),
        renderBadge(counter, counterConfig?.badge),
        'utf8'
      )
      await fs.writeFile(
        path.join(tmpDir, 'counters', `${counter.id}.json`),
        `${JSON.stringify(snapshot, null, 2)}\n`,
        'utf8'
      )
      if (publishedHistory && config) {
        await fs.writeFile(
          path.join(tmpDir, 'graphs', `${counter.id}.svg`),
          renderCounterGraphSvg(
            publishedHistory,
            counter,
            config.publish.graph_days,
            counterConfig?.badge
          ),
          'utf8'
        )
        await fs.writeFile(
          path.join(tmpDir, 'reports', `${counter.id}.md`),
          `${renderCounterReportMarkdown(
            publishedHistory,
            counter,
            counterConfig,
            config
          )}\n`,
          'utf8'
        )
      }
    }
    // Atomic replacement: try rename first (works when outputDir is absent);
    // fall back to removing outputDir then renaming (handles non-empty target).
    try {
      await fs.rename(tmpDir, outputDir)
    } catch {
      await fs.rm(outputDir, { recursive: true, force: true })
      await fs.rename(tmpDir, outputDir)
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
