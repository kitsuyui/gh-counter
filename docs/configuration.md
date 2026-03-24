# Configuration Reference

`gh-counter` is configured through a YAML or JSON file, by default
`.github/gh-counter.yml`. The configuration is intentionally split into three
levels. Repository-level behavior such as publishing and comment handling lives
at the top. Counter-level behavior defines what you are measuring. Matcher-level
behavior defines how files and lines are selected.

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

The `publish` section controls branch publication. Publishing is disabled by
default. This is the safest default because it avoids writing to repository
branches until a user explicitly decides they need stable JSON or badge output.
When enabled, the default branch name is `gh-counter`, which is short, specific,
and unlikely to conflict with a human-maintained branch.

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

On pull requests, `gh-counter` first asks whether each counter is relevant to
the current diff. Relevance is determined by intersecting the pull request's
changed files with the counter's matcher file globs. If a counter does not touch
any files in the diff, it is excluded from PR comments and from PR failure
evaluation. This keeps reviews focused on the code that is actually under
discussion.

On pushes to the default branch, repository-wide reporting is more useful than
diff-local relevance, so all counters are evaluated.

## Published output layout

When publishing is enabled, `gh-counter` writes a summary file and per-counter
files. The default layout is:

```text
summary.json
badges/<counter-id>.svg
counters/<counter-id>.json
```

This layout keeps the badge URLs predictable while leaving room for detailed
machine-readable data. Users who only care about README badges can ignore the
JSON files, while teams that want to build dashboards or secondary tooling can
consume them directly.

## Example configuration

```yaml
version: 1
publish:
  enabled: true
  branch: badge-assets
comment:
  key: engineering-metrics
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
