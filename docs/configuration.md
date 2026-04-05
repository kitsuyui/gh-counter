# Configuration Reference

`gh-counter` is configured through a YAML or JSON file, by default
`.github/gh-counter.yml`. The configuration has three layers. Top-level fields
control repository-wide behavior such as comments and publishing. Counter fields
describe what you want to measure. Matcher fields describe how files and lines
are selected.

## Field summary

The tables below are meant to answer the first questions quickly: what is
required, what is optional, and what happens if you omit a field.

### Top-level fields

| Field | Required | Default | Meaning |
| --- | --- | --- | --- |
| `version` | No | none | Schema version. `1` is the current value |
| `default_branch` | No | repository default branch | Baseline branch for default-branch pushes |
| `comment.enabled` | No | `true` | Enables or disables PR comments |
| `comment.key` | No | `default` | Unique marker key for idempotent comments |
| `comment.template` | No | built-in Mustache template | Custom PR comment body |
| `publish.enabled` | No | `false` | Enables publish-branch writes |
| `publish.branch` | No | `gh-counter` | Publish branch name |
| `publish.directory` | No | `.` | Root directory within the publish branch |
| `publish.summary_filename` | No | `summary.json` | Summary JSON file name |
| `publish.history_filename` | No | `history.json` | Repository-wide time-series JSON file name |
| `publish.graph_days` | No | `30` | Number of recent days emphasized in report graphs |
| `publish.reports_directory` | No | `reports` | Per-counter Markdown report directory |
| `publish.graphs_directory` | No | `graphs` | Per-counter trend SVG directory |
| `publish.badges_directory` | No | `badges` | Badge SVG directory |
| `publish.counters_directory` | No | `counters` | Per-counter JSON directory |
| `counters` | Yes | none | List of counters to evaluate |

### Counter fields

| Field | Required | Default | Meaning |
| --- | --- | --- | --- |
| `counters[].id` | Yes | none | Stable identifier used in outputs and file names |
| `counters[].label` | No | `id` | Human-friendly label for comments and badges |
| `counters[].matchers` | Yes | none | Matchers belonging to the counter |
| `counters[].limit.max` | No | none | Absolute maximum |
| `counters[].limit.fail` | No | `false` | Fails the workflow when over the limit |
| `counters[].ratchet.no_increase` | No | none | Forbids regression relative to the baseline |
| `counters[].ratchet.target` | No | none | Long-term target threshold |
| `counters[].ratchet.fail` | No | `false` | Fails the workflow on ratchet violations |
| `counters[].badge.label` | No | counter label | Badge label override |
| `counters[].badge.colors.ok` | No | built-in color | Badge color below warning level |
| `counters[].badge.colors.warn` | No | built-in color | Badge color at warning level |
| `counters[].badge.colors.error` | No | built-in color | Badge color at error level |
| `counters[].badge.thresholds.warn_above` | No | none | Warning threshold for badge color |
| `counters[].badge.thresholds.error_above` | No | none | Error threshold for badge color |

### Matcher fields

| Field | Required | Default | Meaning |
| --- | --- | --- | --- |
| `matchers[].files` | Yes | none | Include globs |
| `matchers[].exclude` | No | none | Extra exclude globs |
| `matchers[].type` | Yes | none | `contains` or `regex` |
| `matchers[].pattern` | Yes | none | Literal string or regular expression |
| `matchers[].case_sensitive` | No | `false` | Enables case-sensitive matching |

## Top-level behavior

The `version` field exists so that future schema changes can evolve without
guesswork. It is currently optional, but setting it to `1` is a good habit for
repositories that want stable automation over time.

The `default_branch` field is also optional. If it is omitted, `gh-counter`
uses the repository's configured default branch from the GitHub event payload.
That default is almost always what users want, because it tracks repository
renames and branch policy changes without extra maintenance.

The `comment` section controls the pull request comment. Comments are enabled by
default. The default key is `default`, which is enough for a repository that
only runs one `gh-counter` instance. If a repository runs multiple instances,
each one should use a unique key so that their HTML markers do not collide.
Templates are written in Mustache. The built-in template is intentionally plain
and readable, so most users should start there and customize only when they
have a clear reporting need.

The template receives `marker`, `bootstrap_message`, and `counters`. Each
rendered counter includes the normalized summary fields plus `hasBase`,
`has_violations`, `delta_label`, and `violation_messages`. Each rendered
counter also includes `label_code` and `label_code_html`, and each
`file_deltas` item includes `path_code`. `label_code` / `path_code` are
pre-encoded as GFM-safe code spans for Markdown tables, while
`label_code_html` is intended for raw HTML contexts such as `<summary>`.

For example, a table-oriented template can render labels safely like this:

```mustache
| Counter | Current |
| --- | ---: |
{{#counters}}
| {{{label_code}}} | {{current}} |
{{/counters}}
```

The `publish` section controls branch publication. Publishing is disabled by
default. This is the safest default because it avoids writing to repository
branches until a user explicitly decides they need stable JSON or badge output.
When enabled, the default branch name is `gh-counter`, which is short,
specific, and unlikely to conflict with a human-maintained branch.

## Counter definitions

A counter is one reported metric. Each counter needs an `id` and at least one
matcher. The `label` is optional and defaults to the `id`. This keeps the
minimal configuration small while still letting users present friendlier names
such as `TODOs` or `type: ignore`.

Counters can define `limit`, `ratchet`, and `badge` sections. These sections are
optional because many repositories want observation before enforcement. The
recommended progression is to start without failing conditions, observe the
reported numbers for a while, then enable `fail: true` once the team trusts the
metric.

## Matcher definitions

Each matcher combines file globs with a line pattern. The matcher does not count
how many times the pattern appears within a single line. It only answers whether
that line matches. This rule avoids inflated counts when a single line contains
repeated marker text.

`contains` is the simplest matcher and should be preferred when a literal string
is enough. It is easier to read, easier to maintain, and harder to misuse than a
regular expression. `regex` is appropriate when a repository needs to match
multiple comment syntaxes or language-specific forms in one counter.

The `exclude` field lets a matcher narrow its scope further. This is useful for
generated code, fixture directories, or vendored content that should not affect
the metric.

## Failure semantics

`limit.max` is an absolute threshold. It is the right tool when a repository
wants to say "this count must never exceed N". `ratchet.no_increase` is more
appropriate when a repository is carrying legacy debt and only wants to forbid
backsliding. `ratchet.target` is best when the repository is working toward a
known long-term number such as zero type suppressions or fewer than twenty TODOs.

The `fail` flag on each policy is independent because observation and
enforcement are different phases. A team can, for example, publish a badge for a
counter, mention it in PR comments, and keep `fail: false` until the metric
becomes trusted enough to gate merges.

## Pull request relevance

On pull requests, `gh-counter` separates two views.

- The PR gate is patch-level and is based on changed lines in the diff.
- The repo dashboard is repository-wide and is shown as reference information.

`gh-counter` first asks whether each counter is relevant to the current diff.
Relevance is determined by intersecting the pull request's changed files with
the counter's matcher file globs. If a counter does not touch any files in the
diff, it is excluded from PR comments and from PR failure evaluation. This
keeps reviews focused on the code that is actually under discussion.

For relevant counters, the PR gate is computed from changed lines rather than
from the full repository count. This means existing debt elsewhere in the same
file does not fail the PR by itself unless the patch changed the relevant lines
or otherwise worsened the patch-level result.

The one exception is bootstrap detection for first-time setup. If the pull
request adds `.github/gh-counter.yml` or adds a new workflow file that uses
`kitsuyui/gh-counter@...`, and no counters are otherwise relevant yet,
`gh-counter` posts a short bootstrap comment. This is meant to make adoption PRs
observable without changing the relevance rule for ordinary pull requests.

On pushes to the default branch, repository-wide reporting is more useful than
diff-local relevance, so all counters are evaluated as part of the repo
dashboard.

## Published output layout

When publishing is enabled, `gh-counter` writes a summary file, a repository
history file, per-counter Markdown reports, per-counter trend SVGs, and the
existing badge and JSON files. The default layout is:

```text
summary.json
history.json
reports/<counter-id>.md
graphs/<counter-id>.svg
badges/<counter-id>.svg
counters/<counter-id>.json
```

This layout keeps the badge URLs predictable while leaving room for detailed
machine-readable data. Users who only care about README badges can ignore the
JSON files, while teams that want to build dashboards or secondary tooling can
consume them directly. `history.json` stores one repository-wide entry per
published default-branch commit and replaces the entry when the same commit is
republished on a workflow rerun. The generated report Markdown is designed to be
the primary click target for badges, and the graph highlights the last
`publish.graph_days` days with a solid line while retaining older data as a
dotted line for context.

In many repositories, the most useful README badge is a linked badge rather
than a standalone image. The generated SVG can stay in the publish branch, while
the surrounding Markdown link points to a GitHub code search that approximates
the counter's matcher. This is intentionally only a recommendation. Search
queries are repository-specific, and they often use a looser approximation than
the exact `gh-counter` matcher because GitHub code search and `gh-counter`
matcher semantics are not identical.

## Example configuration

```yaml
version: 1
publish:
  enabled: true
  branch: badge-assets
comment:
  key: engineering-metrics
  template: |
    {{{marker}}}
    ## Engineering metrics

    {{#counters}}
    - {{label}}: {{current}}{{#hasBase}} (base: {{base}}, delta: {{delta_label}}){{/hasBase}}
    {{/counters}}

    ---
    Reported by [gh-counter](https://github.com/kitsuyui/gh-counter)
counters:
  - id: todo
    label: TODOs
    matchers:
      - files: ["**/*.ts", "**/*.js", "**/*.py"]
        type: regex
        pattern: "(?:#|//|/\\*+|\\*)\\s*TODO\\b"
    ratchet:
      no_increase: true
      fail: true
    badge:
      label: TODOs
  - id: type-ignore
    label: "type: ignore"
    matchers:
      - files: ["**/*.py"]
        type: contains
        pattern: "# type: ignore"
    limit:
      max: 20
      fail: false
```

This example is intentionally moderate. It enables publishing because the
repository wants stable badges, uses a ratchet for TODOs because they represent
incremental debt, and uses a non-failing limit for `type: ignore` because the
team may still be measuring before enforcing.
