export type MatcherType = 'contains' | 'regex'

export interface MatcherConfig {
  files: string[]
  exclude?: string[]
  type: MatcherType
  pattern: string
  case_sensitive?: boolean
}

export interface LimitConfig {
  max: number
  fail?: boolean
}

export interface RatchetConfig {
  no_increase?: boolean
  target?: number
  fail?: boolean
}

export interface BadgeColorConfig {
  ok?: string
  warn?: string
  error?: string
}

export interface BadgeThresholds {
  warn_above?: number
  error_above?: number
}

export interface BadgeConfig {
  label?: string
  colors?: BadgeColorConfig
  thresholds?: BadgeThresholds
}

export interface CounterConfig {
  id: string
  label?: string
  matchers: MatcherConfig[]
  limit?: LimitConfig
  ratchet?: RatchetConfig
  badge?: BadgeConfig
}

export interface PublishConfig {
  enabled?: boolean
  branch?: string
  directory?: string
  summary_filename?: string
  badges_directory?: string
  counters_directory?: string
}

export interface CommentConfig {
  enabled?: boolean
  key?: string
  template?: string
}

export interface ActionConfig {
  version?: number
  default_branch?: string
  publish?: PublishConfig
  comment?: CommentConfig
  counters: CounterConfig[]
}

export interface ActionInputs {
  githubToken: string
  configPath: string
  defaultBranch?: string
  publishBranch?: string
  commentKey?: string
  outputDir: string
}

export interface MatchRecord {
  path: string
  line: number
  text: string
}

export interface CounterSnapshot {
  id: string
  label: string
  count: number
  matches: MatchRecord[]
}

export interface CounterViolation {
  kind: 'limit' | 'no_increase' | 'target'
  message: string
  fail: boolean
}

export interface FileDeltaStatus {
  path: string
  current: number
  base: number
  delta: number
}

export interface CounterStatus {
  id: string
  label: string
  current: number
  base: number | null
  delta: number | null
  commentable: boolean
  touched_files: string[]
  file_deltas: FileDeltaStatus[]
  violations: CounterViolation[]
  badge_path: string
  counter_path: string
}

export interface ChangedFileStatus {
  path: string
  status: string
}

export interface SummaryStatus {
  generated_at: string
  repository: string
  default_branch: string
  publish_branch: string | null
  event_name: string
  base_label: string
  base_reference: string | null
  head_label: string
  head_reference: string
  bootstrap_message: string | null
  counters: CounterStatus[]
}

export interface NormalizedConfig {
  defaultBranch?: string
  publish: Required<PublishConfig>
  comment: Required<CommentConfig>
  counters: Array<CounterConfig & { label: string }>
}
