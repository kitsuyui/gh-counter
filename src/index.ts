import path from 'node:path'
import * as core from '@actions/core'
import * as github from '@actions/github'

import { getInputs, loadConfig, normalizeConfig } from './config'
import { countCounters } from './count'
import { countFailingViolations, evaluateCounters } from './evaluate'
import { currentHeadReference, resolvePullRequestBaseReference } from './git'
import {
  fetchPublishedSummary,
  publishAssets,
  updatePullRequestComment,
  writeOutputFiles,
} from './github'

import type { CounterSnapshot, SummaryStatus } from './types'

async function resolveDefaultBranch(configDefault?: string): Promise<string> {
  return (
    configDefault ?? github.context.payload.repository?.default_branch ?? 'main'
  )
}

function buildSummary(
  defaultBranch: string,
  publishBranch: string | null,
  baseReference: string | null,
  headReference: string,
  counters: ReturnType<typeof evaluateCounters>
): SummaryStatus {
  return {
    generated_at: new Date().toISOString(),
    repository: github.context.payload.repository?.full_name ?? '',
    default_branch: defaultBranch,
    publish_branch: publishBranch,
    event_name: github.context.eventName,
    base_reference: baseReference,
    head_reference: headReference,
    counters,
  }
}

function baseSnapshotsFromPublishedSummary(
  summary: SummaryStatus | null
): CounterSnapshot[] {
  if (!summary) {
    return []
  }
  return summary.counters.map((counter) => ({
    id: counter.id,
    label: counter.label,
    count: counter.current,
    matches: [],
  }))
}

function attachOutputPaths(
  summary: SummaryStatus,
  outputDir: string
): SummaryStatus {
  return {
    ...summary,
    counters: summary.counters.map((counter) => ({
      ...counter,
      badge_path: path.join(outputDir, 'badges', `${counter.id}.svg`),
      counter_path: path.join(outputDir, 'counters', `${counter.id}.json`),
    })),
  }
}

async function run(): Promise<void> {
  const inputs = getInputs()
  const actionConfig = await loadConfig(inputs.configPath)
  const config = normalizeConfig(actionConfig, inputs)
  const defaultBranch = await resolveDefaultBranch(config.defaultBranch)
  const octokit = github.getOctokit(inputs.githubToken)
  const headReference = await currentHeadReference()
  const currentSnapshots = await countCounters(
    { kind: 'workspace' },
    config.counters
  )

  let baseReference: string | null = null
  let baseSnapshots: CounterSnapshot[] = []

  if (github.context.eventName === 'pull_request') {
    baseReference = await resolvePullRequestBaseReference(defaultBranch)
    if (baseReference) {
      baseSnapshots = await countCounters(
        { kind: 'revision', revision: baseReference },
        config.counters
      )
    }
  } else if (
    github.context.eventName === 'push' &&
    github.context.ref === `refs/heads/${defaultBranch}` &&
    config.publish.enabled
  ) {
    const publishedSummary = await fetchPublishedSummary(
      octokit,
      config.publish.branch,
      path.posix.join(config.publish.directory, config.publish.summary_filename)
    )
    baseReference = publishedSummary?.head_reference ?? null
    baseSnapshots = baseSnapshotsFromPublishedSummary(publishedSummary)
  }

  const evaluatedCounters = evaluateCounters(
    config.counters,
    currentSnapshots,
    baseSnapshots
  )
  const publishBranch =
    github.context.eventName === 'push' &&
    github.context.ref === `refs/heads/${defaultBranch}` &&
    config.publish.enabled
      ? config.publish.branch
      : null
  const summary = attachOutputPaths(
    buildSummary(
      defaultBranch,
      publishBranch,
      baseReference,
      headReference,
      evaluatedCounters
    ),
    inputs.outputDir
  )

  await writeOutputFiles(
    inputs.outputDir,
    summary,
    evaluatedCounters,
    currentSnapshots,
    config.counters
  )
  await updatePullRequestComment(octokit, summary, config)
  await publishAssets(
    octokit,
    summary,
    evaluatedCounters,
    currentSnapshots,
    config.counters,
    config
  )

  const summaryPath = path.join(inputs.outputDir, 'summary.json')
  const summaryJson = JSON.stringify(summary)
  const violationCount = countFailingViolations(summary.counters)
  core.setOutput('summary-path', summaryPath)
  core.setOutput('summary-json', summaryJson)
  core.setOutput('violation-count', String(violationCount))
  core.setOutput('has-violations', String(violationCount > 0))
  core.setOutput('publish-branch', publishBranch ?? '')

  if (violationCount > 0) {
    core.setFailed(`${violationCount} failing gh-counter violation(s) detected`)
  }
}

run().catch((error: unknown) => {
  if (error instanceof Error) {
    core.setFailed(error.message)
    return
  }
  core.setFailed(String(error))
})
