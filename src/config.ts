import fs from 'node:fs/promises'
import path from 'node:path'
import * as core from '@actions/core'
import Ajv from 'ajv'
import YAML from 'yaml'

import type {
  ActionConfig,
  ActionInputs,
  CounterConfig,
  NormalizedConfig,
} from './types'

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    version: { type: 'integer' },
    default_branch: { type: 'string' },
    publish: {
      type: 'object',
      additionalProperties: false,
      properties: {
        enabled: { type: 'boolean' },
        branch: { type: 'string' },
        directory: { type: 'string' },
        summary_filename: { type: 'string' },
        badges_directory: { type: 'string' },
        counters_directory: { type: 'string' },
      },
    },
    comment: {
      type: 'object',
      additionalProperties: false,
      properties: {
        enabled: { type: 'boolean' },
        key: { type: 'string' },
        template: { type: 'string' },
      },
    },
    counters: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'matchers'],
        properties: {
          id: { type: 'string', minLength: 1 },
          label: { type: 'string' },
          limit: {
            type: 'object',
            additionalProperties: false,
            required: ['max'],
            properties: {
              max: { type: 'integer', minimum: 0 },
              fail: { type: 'boolean' },
            },
          },
          ratchet: {
            type: 'object',
            additionalProperties: false,
            properties: {
              no_increase: { type: 'boolean' },
              target: { type: 'integer', minimum: 0 },
              fail: { type: 'boolean' },
            },
          },
          badge: {
            type: 'object',
            additionalProperties: false,
            properties: {
              label: { type: 'string' },
              colors: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  ok: { type: 'string' },
                  warn: { type: 'string' },
                  error: { type: 'string' },
                },
              },
              thresholds: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  warn_above: { type: 'integer', minimum: 0 },
                  error_above: { type: 'integer', minimum: 0 },
                },
              },
            },
          },
          matchers: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['files', 'type', 'pattern'],
              properties: {
                files: {
                  type: 'array',
                  minItems: 1,
                  items: { type: 'string' },
                },
                exclude: {
                  type: 'array',
                  items: { type: 'string' },
                },
                type: { enum: ['contains', 'regex'] },
                pattern: { type: 'string', minLength: 1 },
                case_sensitive: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  },
  required: ['counters'],
} as const

const ajv = new Ajv({ allErrors: true })
const validateConfig = ajv.compile(schema)

export const DEFAULT_COMMENT_TEMPLATE = `{{{marker}}}
## gh-counter

|  | {{{base_header}}} | {{{head_header}}} | +/- |
| --- | ---: | ---: | ---: |
{{#counters}}
| \`{{label}}\` | {{#hasBase}}{{base}}{{/hasBase}}{{^hasBase}}n/a{{/hasBase}} | {{current}} | {{#hasBase}}{{delta_label}}{{/hasBase}}{{^hasBase}}n/a{{/hasBase}} |
{{/counters}}
{{^counters}}
{{#bootstrap_message}}
{{bootstrap_message}}
{{/bootstrap_message}}
{{/counters}}
{{#counters}}
{{#has_file_deltas}}
<details>
<summary><code>{{label}}</code> file breakdown</summary>

| File | {{{base_header}}} | {{{head_header}}} | +/- |
| --- | ---: | ---: | ---: |
{{#file_deltas}}
| [\`{{{path}}}\`]({{{url}}}) | {{base}} | {{current}} | {{delta_label}} |
{{/file_deltas}}

</details>

{{/has_file_deltas}}
{{#has_violations}}
{{#violations}}
- {{icon}} \`{{label}}\`: {{message}}
{{/violations}}
{{/has_violations}}
{{/counters}}

---
Reported by [gh-counter](https://github.com/kitsuyui/gh-counter)`

export function getInputs(): ActionInputs {
  return {
    githubToken: core.getInput('github-token', { required: true }),
    configPath: core.getInput('config-path') || '.github/gh-counter.yml',
    defaultBranch: core.getInput('default-branch') || undefined,
    publishBranch: core.getInput('publish-branch') || undefined,
    commentKey: core.getInput('comment-key') || undefined,
    outputDir: core.getInput('output-dir') || '.gh-counter',
  }
}

export async function loadConfig(configPath: string): Promise<ActionConfig> {
  const absolutePath = path.resolve(configPath)
  const raw = await fs.readFile(absolutePath, 'utf8')
  const parsed = absolutePath.endsWith('.json')
    ? JSON.parse(raw)
    : YAML.parse(raw)

  if (!validateConfig(parsed)) {
    throw new Error(
      `Invalid config: ${JSON.stringify(validateConfig.errors, null, 2)}`
    )
  }

  return parsed as ActionConfig
}

function normalizeCounter(
  counter: CounterConfig
): CounterConfig & { label: string } {
  return {
    ...counter,
    label: counter.label ?? counter.id,
  }
}

export function normalizeConfig(
  config: ActionConfig,
  inputs: ActionInputs
): NormalizedConfig {
  return {
    defaultBranch: inputs.defaultBranch ?? config.default_branch,
    publish: {
      enabled: config.publish?.enabled ?? false,
      branch: inputs.publishBranch ?? config.publish?.branch ?? 'gh-counter',
      directory: config.publish?.directory ?? '.',
      summary_filename: config.publish?.summary_filename ?? 'summary.json',
      badges_directory: config.publish?.badges_directory ?? 'badges',
      counters_directory: config.publish?.counters_directory ?? 'counters',
    },
    comment: {
      enabled: config.comment?.enabled ?? true,
      key: inputs.commentKey ?? config.comment?.key ?? 'default',
      template: config.comment?.template ?? DEFAULT_COMMENT_TEMPLATE,
    },
    counters: config.counters.map(normalizeCounter),
  }
}
