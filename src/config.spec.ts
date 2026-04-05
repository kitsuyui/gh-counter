import { describe, expect, test } from 'vitest'

import { normalizeConfig } from './config'

describe('normalizeConfig', () => {
  test('applies defaults and labels', () => {
    const config = normalizeConfig(
      {
        counters: [
          {
            id: 'todo',
            matchers: [
              {
                files: ['**/*.ts'],
                type: 'contains',
                pattern: 'TODO',
              },
            ],
          },
        ],
      },
      {
        githubToken: 'token',
        configPath: '.github/gh-counter.yml',
        outputDir: '.gh-counter',
      }
    )

    expect(config.publish.enabled).toBe(false)
    expect(config.publish.branch).toBe('gh-counter')
    expect(config.publish.history_filename).toBe('history.json')
    expect(config.publish.graph_days).toBe(30)
    expect(config.publish.reports_directory).toBe('reports')
    expect(config.publish.graphs_directory).toBe('graphs')
    expect(config.comment.key).toBe('default')
    expect(config.counters[0]?.label).toBe('todo')
  })
})
