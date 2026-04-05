import type {
  BadgeConfig,
  CounterConfig,
  CounterStatus,
  NormalizedConfig,
  PublishedHistory,
} from './types'

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function normalizeColor(value: string): string {
  return value.startsWith('#') ? value : `#${value}`
}

function pickGraphColor(counter: CounterStatus, badge?: BadgeConfig): string {
  const colors = {
    ok: '2ea44f',
    warn: 'dbab09',
    error: 'cf222e',
    ...badge?.colors,
  }

  if (counter.violations.some((violation) => violation.fail)) {
    return normalizeColor(colors.error)
  }
  if (badge?.thresholds?.error_above !== undefined) {
    if (counter.current >= badge.thresholds.error_above) {
      return normalizeColor(colors.error)
    }
  }
  if (badge?.thresholds?.warn_above !== undefined) {
    if (counter.current >= badge.thresholds.warn_above) {
      return normalizeColor(colors.warn)
    }
  }
  if (counter.current === 0) {
    return normalizeColor(colors.ok)
  }
  return normalizeColor(colors.warn)
}

interface GraphPoint {
  x: number
  y: number
  count: number
  timestamp: number
}

interface CounterSeriesPoint {
  count: number
  generated_at: string
  timestamp: number
}

function rawGithubUrl(
  repository: string,
  branch: string,
  filePath: string
): string {
  return `https://raw.githubusercontent.com/${repository}/${branch}/${filePath}`
}

function blobGithubUrl(
  repository: string,
  branch: string,
  filePath: string
): string {
  return `https://github.com/${repository}/blob/${branch}/${filePath}`
}

function codeSearchUrl(repository: string, query: string): string {
  return `https://github.com/${repository}/search?q=${encodeURIComponent(query)}&type=code`
}

function formatDate(iso: string): string {
  return iso.slice(0, 10)
}

function buildPath(points: GraphPoint[]): string {
  if (points.length === 0) {
    return ''
  }
  return points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    )
    .join(' ')
}

function pointsForCounter(
  history: PublishedHistory,
  counterId: string
): CounterSeriesPoint[] {
  return history.entries
    .map((entry) => {
      const counter = entry.counters.find((item) => item.id === counterId)
      if (!counter) {
        return null
      }
      return {
        count: counter.count,
        generated_at: entry.generated_at,
        timestamp: Date.parse(entry.generated_at),
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.timestamp - b.timestamp)
}

function observedDays(series: CounterSeriesPoint[]): number {
  if (series.length < 2) {
    return 1
  }
  const first = series[0]?.timestamp ?? 0
  const last = series.at(-1)?.timestamp ?? first
  return Math.max(1, Math.round((last - first) / (24 * 60 * 60 * 1000)))
}

export function renderCounterGraphSvg(
  history: PublishedHistory,
  counter: CounterStatus,
  graphDays: number,
  badge?: BadgeConfig
): string {
  const series = pointsForCounter(history, counter.id)
  const width = 640
  const height = 220
  const margin = { top: 24, right: 18, bottom: 34, left: 40 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const color = pickGraphColor(counter, badge)
  const title = `${counter.label} trend`
  const escapedTitle = escapeXml(title)
  const latestDate =
    series.at(-1)?.generated_at ?? history.entries.at(-1)?.generated_at
  const latestTimestamp = latestDate ? Date.parse(latestDate) : Date.now()
  const cutoff = latestTimestamp - graphDays * 24 * 60 * 60 * 1000
  const hasMeaningfulWindow = series.length >= 3 && observedDays(series) >= 7

  if (series.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img" aria-label="${escapeXml(title)}">
<title>${escapedTitle}</title>
<rect width="${width}" height="${height}" fill="#ffffff"/>
<text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#57606a" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="14">No history yet</text>
</svg>
`
  }

  const minTimestamp = series[0]?.timestamp ?? latestTimestamp
  const maxTimestamp = series.at(-1)?.timestamp ?? latestTimestamp
  const timestampSpan = Math.max(1, maxTimestamp - minTimestamp)
  const maxCount = Math.max(1, ...series.map((point) => point.count))
  const cutoffX =
    margin.left +
    ((Math.max(minTimestamp, cutoff) - minTimestamp) / timestampSpan) *
      plotWidth

  const points = series.map<GraphPoint>((point) => ({
    x:
      margin.left +
      ((point.timestamp - minTimestamp) / timestampSpan) * plotWidth,
    y: margin.top + plotHeight - (point.count / maxCount) * plotHeight,
    count: point.count,
    timestamp: point.timestamp,
  }))

  const historicalPoints = hasMeaningfulWindow
    ? points.filter((point) => point.timestamp < cutoff)
    : []
  const recentPoints = hasMeaningfulWindow
    ? points.filter((point) => point.timestamp >= cutoff)
    : points
  const firstRecentPoint = recentPoints[0]
  const lastHistoricalPoint = historicalPoints.at(-1)
  const olderPathPoints =
    historicalPoints.length > 0 && firstRecentPoint
      ? [...historicalPoints, firstRecentPoint]
      : historicalPoints
  const recentPathPoints =
    lastHistoricalPoint && recentPoints.length > 0
      ? [lastHistoricalPoint, ...recentPoints]
      : recentPoints.length > 0
        ? recentPoints
        : points
  const olderPath = buildPath(olderPathPoints)
  const recentPath = buildPath(recentPathPoints)
  const latestPoint = points.at(-1) ?? points[0]
  const firstSeriesPoint = series[0]
  const latestSeriesPoint = series.at(-1) ?? series[0]
  const firstLabel = formatDate(
    firstSeriesPoint?.generated_at ?? new Date(minTimestamp).toISOString()
  )
  const latestLabel = formatDate(
    latestSeriesPoint?.generated_at ?? new Date(latestTimestamp).toISOString()
  )

  const subtitle = hasMeaningfulWindow
    ? `last ${graphDays}d`
    : `collecting baseline (${series.length} samples)`
  const leftLabelWidth = firstLabel.length * 7
  const rightLabelWidth = latestLabel.length * 7
  const subtitleWidth = subtitle.length * 6
  const subtitleX = hasMeaningfulWindow
    ? Math.max(
        margin.left + leftLabelWidth + subtitleWidth / 2 + 12,
        Math.min(
          width - margin.right - rightLabelWidth - subtitleWidth / 2 - 12,
          cutoffX
        )
      )
    : width / 2
  const subtitleY = height - 24

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img" aria-label="${escapeXml(title)}">
<title>${escapedTitle}</title>
<rect width="${width}" height="${height}" fill="#ffffff"/>
<rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" fill="#f6f8fa" stroke="#d0d7de"/>
<line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" stroke="#8c959f" stroke-width="1"/>
<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" stroke="#8c959f" stroke-width="1"/>
${hasMeaningfulWindow ? `<line x1="${cutoffX.toFixed(2)}" y1="${margin.top}" x2="${cutoffX.toFixed(2)}" y2="${margin.top + plotHeight}" stroke="#8c959f" stroke-dasharray="4 4"/>` : ''}
${olderPath ? `<path d="${olderPath}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="4 4" opacity="0.65"/>` : ''}
${recentPath ? `<path d="${recentPath}" fill="none" stroke="${color}" stroke-width="3"/>` : ''}
${points
  .map((point) => {
    const dash =
      hasMeaningfulWindow && point.timestamp < cutoff
        ? ' stroke-dasharray="3 3" opacity="0.75"'
        : ''
    return `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="3.5" fill="#ffffff" stroke="${color}" stroke-width="2"${dash}/>`
  })
  .join('\n')}
<circle cx="${latestPoint.x.toFixed(2)}" cy="${latestPoint.y.toFixed(2)}" r="4.5" fill="${color}" stroke="#ffffff" stroke-width="2"/>
<text x="${margin.left}" y="16" fill="#24292f" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="13">${escapeXml(counter.label)} trend</text>
<text x="${width - margin.right}" y="16" text-anchor="end" fill="#57606a" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="12">latest ${counter.current}</text>
<text x="${subtitleX.toFixed(2)}" y="${subtitleY}" text-anchor="middle" fill="#57606a" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">${escapeXml(subtitle)}</text>
<text x="${margin.left}" y="${height - 10}" fill="#57606a" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">${escapeXml(firstLabel)}</text>
<text x="${width - margin.right}" y="${height - 10}" text-anchor="end" fill="#57606a" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">${escapeXml(latestLabel)}</text>
<text x="12" y="${margin.top + 6}" fill="#57606a" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">${maxCount}</text>
<text x="18" y="${margin.top + plotHeight}" fill="#57606a" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">0</text>
</svg>
`
}

export function renderCounterReportMarkdown(
  history: PublishedHistory,
  counter: CounterStatus,
  counterConfig: CounterConfig & { label: string },
  config: NormalizedConfig
): string {
  const publishBranch =
    history.entries.length > 0 ? config.publish.branch : config.publish.branch
  const publishRoot =
    config.publish.directory === '.' ? '' : `${config.publish.directory}/`
  const graphPath = `${publishRoot}${config.publish.graphs_directory}/${counter.id}.svg`
  const historyPath = `${publishRoot}${config.publish.history_filename}`
  const counterPath = `${publishRoot}${config.publish.counters_directory}/${counter.id}.json`
  const graphUrl = rawGithubUrl(history.repository, publishBranch, graphPath)
  const historyUrl = blobGithubUrl(
    history.repository,
    publishBranch,
    historyPath
  )
  const snapshotUrl = blobGithubUrl(
    history.repository,
    publishBranch,
    counterPath
  )
  const lastEntry = history.entries.at(-1)
  const series = pointsForCounter(history, counter.id)
  const hasMeaningfulWindow = series.length >= 3 && observedDays(series) >= 7
  const searchLinks = counterConfig.matchers
    .map((matcher, index) => {
      const query = `${matcher.pattern} repo:${history.repository}`
      return `- Search matcher ${index + 1}: [GitHub code search](${codeSearchUrl(history.repository, query)})`
    })
    .join('\n')

  return `# ${counter.label}

Latest count: **${counter.current}**

Recent trend: ${hasMeaningfulWindow ? `solid line shows the last ${config.publish.graph_days} days, and the dotted line shows older measurements retained for context.` : `still collecting an initial baseline. The graph focuses on the ${series.length} measurement${series.length === 1 ? '' : 's'} currently available instead of forcing a 30-day interpretation.`}

![${counter.label} trend](${graphUrl})

- Latest snapshot date: ${lastEntry ? formatDate(lastEntry.generated_at) : 'n/a'}
- History data: [history.json](${historyUrl})
- Current counter snapshot: [${counter.id}.json](${snapshotUrl})

## Explore matches

These links open GitHub code search so you can inspect which files currently match this counter.

${searchLinks}
`
}
