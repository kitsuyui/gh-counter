import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { loadConfig, normalizeConfig } from './config'

async function writeConfigFile(
  config: unknown
): Promise<{ configPath: string; directory: string }> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'gh-counter-config-')
  )
  const configPath = path.join(directory, 'gh-counter.json')
  await fs.writeFile(configPath, JSON.stringify(config), 'utf8')
  return { configPath, directory }
}

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

describe('loadConfig', () => {
  test('accepts the current config version', async () => {
    const { configPath, directory } = await writeConfigFile({
      version: 1,
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
    })

    try {
      await expect(loadConfig(configPath)).resolves.toMatchObject({
        version: 1,
      })
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  test('rejects unsupported config versions', async () => {
    const { configPath, directory } = await writeConfigFile({
      version: 2,
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
    })

    try {
      await expect(loadConfig(configPath)).rejects.toThrow('Invalid config')
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })
})
