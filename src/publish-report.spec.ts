import { describe, expect, test } from 'vitest'

import {
  renderCounterGraphSvg,
  renderCounterReportMarkdown,
} from './publish-report'

const history = {
  repository: 'kitsuyui/gh-counter',
  default_branch: 'main',
  entries: [
    {
      generated_at: '2026-03-01T00:00:00.000Z',
      head_reference: 'oldest',
      counters: [{ id: 'todo', label: 'TODOs', count: 9 }],
    },
    {
      generated_at: '2026-03-20T00:00:00.000Z',
      head_reference: 'middle',
      counters: [{ id: 'todo', label: 'TODOs', count: 6 }],
    },
    {
      generated_at: '2026-04-05T00:00:00.000Z',
      head_reference: 'latest',
      counters: [{ id: 'todo', label: 'TODOs', count: 3 }],
    },
  ],
}

const counter = {
  id: 'todo',
  label: 'TODOs',
  current: 3,
  base: 4,
  delta: -1,
  dashboard_current: 3,
  dashboard_base: 4,
  dashboard_delta: -1,
  commentable: true,
  touched_files: [],
  file_deltas: [],
  patch_file_deltas: [],
  violations: [],
  badge_path: '.gh-counter/badges/todo.svg',
  counter_path: '.gh-counter/counters/todo.json',
}

describe('publish report rendering', () => {
  test('renders a graph with recent and historical segments', () => {
    const svg = renderCounterGraphSvg(history, counter, 14)

    expect(svg).toContain('last 14d')
    expect(svg).toContain('stroke-dasharray="4 4"')
    expect(svg).toContain('latest 3')
    expect(svg).toContain('y="196"')
    expect(svg).not.toContain('<text x="40.00" y="196"')
  })

  test('renders baseline collection state for short histories', () => {
    const shortHistory = {
      repository: 'kitsuyui/gh-counter',
      default_branch: 'main',
      entries: [
        {
          generated_at: '2026-04-04T00:00:00.000Z',
          head_reference: 'first',
          counters: [{ id: 'todo', label: 'TODOs', count: 4 }],
        },
        {
          generated_at: '2026-04-05T00:00:00.000Z',
          head_reference: 'second',
          counters: [{ id: 'todo', label: 'TODOs', count: 3 }],
        },
      ],
    }

    const svg = renderCounterGraphSvg(shortHistory, counter, 30)

    expect(svg).toContain('collecting baseline (2 samples)')
    expect(svg).not.toContain('last 30d')
    expect(svg).toContain('y="196"')
  })

  test('renders a markdown report that links to the published graph', () => {
    const markdown = renderCounterReportMarkdown(
      history,
      counter,
      {
        id: 'todo',
        label: 'TODOs',
        matchers: [
          {
            files: ['**/*.ts'],
            type: 'contains',
            pattern: 'TODO',
          },
        ],
      },
      {
        defaultBranch: 'main',
        publish: {
          enabled: true,
          branch: 'gh-counter-assets',
          directory: '.',
          summary_filename: 'summary.json',
          history_filename: 'history.json',
          graph_days: 30,
          reports_directory: 'reports',
          graphs_directory: 'graphs',
          badges_directory: 'badges',
          counters_directory: 'counters',
        },
        comment: {
          enabled: true,
          key: 'default',
          template: '',
        },
        counters: [],
      }
    )

    expect(markdown).toContain('# TODOs')
    expect(markdown).toContain(
      '![TODOs trend](https://raw.githubusercontent.com/kitsuyui/gh-counter/gh-counter-assets/graphs/todo.svg)'
    )
    expect(markdown).toContain(
      '[history.json](https://github.com/kitsuyui/gh-counter/blob/gh-counter-assets/history.json)'
    )
    expect(markdown).toContain('last 30 days')
    expect(markdown).toContain('## Explore matches')
    expect(markdown).toContain(
      '[GitHub code search](https://github.com/kitsuyui/gh-counter/search?q=TODO%20repo%3Akitsuyui%2Fgh-counter&type=code)'
    )
  })

  test('renders baseline text in markdown report for short histories', () => {
    const shortHistory = {
      repository: 'kitsuyui/gh-counter',
      default_branch: 'main',
      entries: [
        {
          generated_at: '2026-04-05T00:00:00.000Z',
          head_reference: 'first',
          counters: [{ id: 'todo', label: 'TODOs', count: 3 }],
        },
      ],
    }

    const markdown = renderCounterReportMarkdown(
      shortHistory,
      counter,
      {
        id: 'todo',
        label: 'TODOs',
        matchers: [
          {
            files: ['**/*.ts'],
            type: 'contains',
            pattern: 'TODO',
          },
        ],
      },
      {
        defaultBranch: 'main',
        publish: {
          enabled: true,
          branch: 'gh-counter-assets',
          directory: '.',
          summary_filename: 'summary.json',
          history_filename: 'history.json',
          graph_days: 30,
          reports_directory: 'reports',
          graphs_directory: 'graphs',
          badges_directory: 'badges',
          counters_directory: 'counters',
        },
        comment: {
          enabled: true,
          key: 'default',
          template: '',
        },
        counters: [],
      }
    )

    expect(markdown).toContain('still collecting an initial baseline')
    expect(markdown).toContain('1 measurement currently available')
  })

  test('renders configured publish links for empty history reports', () => {
    const emptyHistory = {
      repository: 'kitsuyui/gh-counter',
      default_branch: 'main',
      entries: [],
    }

    const markdown = renderCounterReportMarkdown(
      emptyHistory,
      counter,
      {
        id: 'todo',
        label: 'TODOs',
        matchers: [
          {
            files: ['**/*.ts'],
            type: 'contains',
            pattern: 'TODO',
          },
        ],
      },
      {
        defaultBranch: 'main',
        publish: {
          enabled: true,
          branch: 'gh-counter-assets',
          directory: '.',
          summary_filename: 'summary.json',
          history_filename: 'history.json',
          graph_days: 30,
          reports_directory: 'reports',
          graphs_directory: 'graphs',
          badges_directory: 'badges',
          counters_directory: 'counters',
        },
        comment: {
          enabled: true,
          key: 'default',
          template: '',
        },
        counters: [],
      }
    )

    expect(markdown).toContain('still collecting an initial baseline')
    expect(markdown).toContain('0 measurements currently available')
    expect(markdown).toContain(
      '![TODOs trend](https://raw.githubusercontent.com/kitsuyui/gh-counter/gh-counter-assets/graphs/todo.svg)'
    )
    expect(markdown).toContain(
      '[history.json](https://github.com/kitsuyui/gh-counter/blob/gh-counter-assets/history.json)'
    )
    expect(markdown).toContain(
      '[todo.json](https://github.com/kitsuyui/gh-counter/blob/gh-counter-assets/counters/todo.json)'
    )
    expect(markdown).toContain('- Latest snapshot date: n/a')
  })
})
