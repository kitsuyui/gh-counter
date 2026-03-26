# gh-counter

[![TODOs](https://raw.githubusercontent.com/kitsuyui/gh-counter/gh-counter-assets/badges/todo.svg)](https://github.com/kitsuyui/gh-counter/search?q=TODO&type=code)
[![@ts-ignore](https://raw.githubusercontent.com/kitsuyui/gh-counter/gh-counter-assets/badges/type-ignore.svg)](https://github.com/kitsuyui/gh-counter/search?q=%22%40ts-ignore%22+path%3Asrc&type=code)
[![code symbols](https://raw.githubusercontent.com/kitsuyui/gh-counter/gh-counter-assets/badges/code-tag.svg)](https://github.com/kitsuyui/gh-counter/search?q=%22%3Ccode%3E%22&type=code)

<img width="898" height="515" alt="gh-counter-example" src="https://github.com/user-attachments/assets/5b98db5d-5c76-467b-826c-b6da1cccb58a" />


`gh-counter` is a GitHub Action for counting configurable code markers in pull
requests and on the default branch. It is designed for repositories that want a
small, reusable way to track signals such as `TODO`, `FIXME`, `@ts-ignore`, or
`# type: ignore`, while keeping setup simple enough for first-time adoption.

On pull requests, it compares the head branch with the merge base and updates
one managed comment in place. On pushes to the default branch, it can also
publish JSON and SVG badge assets to a dedicated branch. This repository uses
`gh-counter` to track its own `TODO`, `@ts-ignore`, and symbol-heavy `<code>`
markers and publishes the badges above from `gh-counter-assets`.

## Quick start

The smallest useful setup is a pull-request comment workflow plus a config
file. This keeps permissions narrow and avoids writing to extra branches until
you actually want badges.

```yaml
name: gh-counter

on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

jobs:
  counter:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - uses: kitsuyui/gh-counter@v0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

The action reads `.github/gh-counter.yml` by default. A minimal configuration
only needs counters and matchers.

```yaml
version: 1
counters:
  - id: todo
    label: TODOs
    matchers:
      - files: ["**/*.ts", "**/*.js", "**/*.py"]
        type: regex
        pattern: "(?:#|//|/\\*+|\\*)\\s*TODO\\b"
```

With that setup, pull requests get one managed comment that compares the current
count to the merge base. Reruns update the same comment instead of adding a new
one.

## Inputs

The action itself has a small set of inputs. Most behavior lives in
`.github/gh-counter.yml`, which keeps workflows short and makes repository-level
policy easier to review.

| Input | Required | Default | Purpose |
| --- | --- | --- | --- |
| `github-token` | Yes | none | Used for PR comments and publish-branch writes |
| `config-path` | No | `.github/gh-counter.yml` | Path to the YAML or JSON config file |
| `default-branch` | No | repository default branch | Overrides config and repository metadata |
| `publish-branch` | No | value from config, else `gh-counter` | Overrides the publish branch name |
| `comment-key` | No | value from config, else `default` | Overrides the HTML marker key |
| `output-dir` | No | `.gh-counter` | Directory for generated JSON and SVG files |

## Configuration at a glance

The configuration file has a few required fields and many optional ones. The
defaults are intentionally conservative: PR comments are on by default,
publishing is off by default, and labels fall back to counter ids.

### Top-level fields

| Field | Required | Default | Notes |
| --- | --- | --- | --- |
| `version` | No | none | Recommended to set to `1` |
| `default_branch` | No | repository default branch | Usually not needed |
| `comment.enabled` | No | `true` | Disables PR comment handling when set to `false` |
| `comment.key` | No | `default` | Use a unique key if the repo runs multiple `gh-counter` jobs |
| `comment.template` | No | built-in Mustache template | Customizes the PR comment body |
| `publish.enabled` | No | `false` | Enables publish-branch updates for JSON and badges |
| `publish.branch` | No | `gh-counter` | Branch used for published assets |
| `publish.directory` | No | `.` | Root directory inside the publish branch |
| `publish.summary_filename` | No | `summary.json` | Summary JSON file name |
| `publish.badges_directory` | No | `badges` | Directory for generated SVG badges |
| `publish.counters_directory` | No | `counters` | Directory for per-counter JSON files |
| `counters` | Yes | none | At least one counter is required |

### Counter fields

| Field | Required | Default | Notes |
| --- | --- | --- | --- |
| `counters[].id` | Yes | none | Stable identifier used in outputs and published file names |
| `counters[].label` | No | `id` | Display label in comments and badges |
| `counters[].matchers` | Yes | none | At least one matcher is required |
| `counters[].limit.max` | No | none | Absolute threshold |
| `counters[].limit.fail` | No | `false` | Fails the workflow when the limit is exceeded |
| `counters[].ratchet.no_increase` | No | none | Prevents regressions relative to the baseline |
| `counters[].ratchet.target` | No | none | Long-term threshold |
| `counters[].ratchet.fail` | No | `false` | Fails the workflow on ratchet violations |
| `counters[].badge.label` | No | counter label | Label shown on the generated badge |
| `counters[].badge.colors.ok` | No | built-in color | Badge color below warning threshold |
| `counters[].badge.colors.warn` | No | built-in color | Badge color at warning level |
| `counters[].badge.colors.error` | No | built-in color | Badge color at error level |
| `counters[].badge.thresholds.warn_above` | No | none | Switches badge to warning color above this count |
| `counters[].badge.thresholds.error_above` | No | none | Switches badge to error color above this count |

### Matcher fields

| Field | Required | Default | Notes |
| --- | --- | --- | --- |
| `matchers[].files` | Yes | none | Glob patterns to include |
| `matchers[].exclude` | No | none | Extra globs to exclude |
| `matchers[].type` | Yes | none | `contains` or `regex` |
| `matchers[].pattern` | Yes | none | Literal string or regular expression |
| `matchers[].case_sensitive` | No | `false` | Makes matching case-sensitive |

## Why the defaults look like this

The default behavior is intentionally conservative. Pull request comments are
enabled by default because they are the main value of the action and require
only `pull-requests: write`. Publishing badges is disabled by default because it
requires `contents: write`, creates or overwrites a dedicated branch, and is not
needed to get useful signal from a first setup. Counter labels default to the
counter id so that a minimal configuration stays readable without repetition.

Another important default is pull request relevance. `gh-counter` comments only
on counters whose matcher target files are touched by the current diff, and it
only fails a pull request for those relevant counters. This keeps the signal
focused on the code under review. There is one exception for first-time
adoption: if a pull request adds `.github/gh-counter.yml` or a new workflow that
uses `gh-counter`, the action emits a short bootstrap comment even when no
matcher target files are touched yet.

## When to enable publishing

Publishing is the part that turns `gh-counter` from a review tool into a badge
and reporting tool. When publishing is enabled, the action writes `summary.json`
and per-counter JSON and SVG files to a dedicated branch. That gives you stable
raw URLs that can be embedded in a README. Because this behavior force-updates a
generated branch, it is opt-in and should be enabled only when you actually want
repository-level assets.

```yaml
version: 1
publish:
  enabled: true
  branch: badge-assets
counters:
  - id: todo
    label: TODOs
    matchers:
      - files: ["**/*.ts"]
        type: contains
        pattern: "TODO"
```

If you choose to publish, the workflow needs `contents: write`. Without that
permission, the action will skip branch publication and emit a warning instead
of failing unexpectedly.

When you embed a badge in a README, it is usually better to make the image
clickable instead of leaving it as a bare image. A raw SVG link only opens the
image itself. In practice, many repositories get a better result by linking the
badge to a GitHub code search for the underlying marker text. That search is
only an approximation of the matcher, but it is often a more useful starting
point than a full-screen image.

```md
[![TODOs](https://raw.githubusercontent.com/<owner>/<repo>/badge-assets/badges/todo.svg)](https://github.com/<owner>/<repo>/search?q=TODO&type=code)
```

## How matching works

Matching is line-based. A line counts at most once per counter, even when
multiple matchers on the same counter would match it. This is deliberate: a
line such as `// FIXME: TODO because ...` should count as one debt instance for
that counter, not two. The current implementation supports `contains` and
`regex` matchers, and each matcher combines file globs with a single line
pattern.

## Limits, ratchets, and failure behavior

`gh-counter` supports two different control styles. A `limit` is an absolute
maximum. A ratchet is directional: `no_increase` prevents a counter from going
up relative to the baseline, while `target` expresses a longer-term threshold
that the counter should eventually stay under. Each rule has its own `fail`
switch so that teams can begin by observing a metric before they start enforcing
it.

## Outputs and artifacts

The action always writes generated files to `.gh-counter` unless you override
the output directory. This is useful even when publishing is disabled, because a
workflow can upload those files as artifacts or inspect them in later steps.
The action also exposes the summary path, the full summary JSON, the number of
failing violations, and the publish branch through action outputs.

## Documentation

The README is intentionally focused on adoption and day-one configuration. The
full configuration reference, field semantics, template details, and publishing
layout live in [docs/configuration.md](docs/configuration.md).

## Marketplace and release notes

This repository is intended to be used as a JavaScript action. In practice that
means `action.yml` stays at the repository root and `dist/` is committed for the
release tag that users reference. Marketplace publication may also require
account-level setup on GitHub's side, including agreement and listing metadata.

## License

MIT
