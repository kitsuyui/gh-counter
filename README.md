# gh-counter

`gh-counter` is a GitHub Action for counting configurable code markers in pull
requests and on the default branch. It is meant for teams that want one small
tool for debt counters such as `TODO`, `FIXME`, `@ts-ignore`, or
`# type: ignore`, while still being flexible enough to define their own
patterns and badge labels.

The action is designed to be useful before you customize it heavily. If you run
it on a pull request, it compares the current branch with the merge base and
updates one managed comment in place. If you later decide that you also want
stable badge URLs, you can turn on publish-branch output and let the action
write generated JSON and SVG files to a dedicated branch. That publish step is
not enabled by default, because writing to another branch is more invasive than
most users expect from a first-time setup.

## Why the defaults look like this

The default behavior is intentionally conservative. Pull request comments are
enabled by default because they are the main value of the action and require
only `pull-requests: write`. Publishing badges is disabled by default because it
requires `contents: write`, creates or overwrites a dedicated branch, and is not
needed to get useful signal from the action. The default branch is resolved from
the repository metadata so that most users do not need to configure `main`,
`master`, or a custom default branch explicitly. Counter labels default to the
counter id so that a minimal configuration stays readable without repetition.

Another important default is that pull requests only comment on counters whose
matcher target files are actually touched by the pull request. This keeps the
comment focused on the work being reviewed and avoids failing a pull request for
an unrelated counter in an untouched area of the repository. On the default
branch, by contrast, all configured counters are evaluated because the action is
acting as a repository-level report rather than a review-time hint.

There is one deliberate exception for first-time adoption. If a pull request
adds `.github/gh-counter.yml` or adds a new workflow that uses `gh-counter`,
but does not yet touch any matcher target files, the action posts a short
bootstrap comment instead of staying silent. That gives maintainers a visible
confirmation that the action is wired correctly without making ordinary
unrelated pull requests noisy later.

## Basic usage

In the simplest setup, you check out the repository with full history, run the
action, and give it a token that can write pull request comments. A repository
that only wants PR comments does not need to enable branch publishing at all.

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

The action looks for `.github/gh-counter.yml` by default. A minimal
configuration only needs counters and matchers.

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
count to the merge base. The comment is updated in place through an HTML marker,
so reruns do not spam the thread with duplicates. If the pull request is only
introducing `gh-counter` itself, the managed comment falls back to a short
bootstrap message until a later pull request touches relevant matcher targets.

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
image itself, which is rarely the most useful destination for a reader. In
practice, many repositories will get a better result by linking the badge to a
GitHub code search for the underlying marker text. That search is not expected
to match `gh-counter` perfectly, because repository search may use broader file
scope or simpler terms than the configured matcher, but it often gives readers
a much more useful starting point than a full-screen image.

```md
[![TODOs](https://raw.githubusercontent.com/<owner>/<repo>/badge-assets/badges/todo.svg)](https://github.com/<owner>/<repo>/search?q=TODO&type=code)
```

## How matching works

Matching is line-based. A line counts at most once per counter, even when
multiple matchers on the same counter would match it. This is deliberate: a
line such as `// FIXME: TODO because ...` should count as one debt instance for
that counter, not two. The current implementation supports `contains` and
`regex` matchers, and each matcher combines file globs with a single line
pattern. Counters can have multiple matchers, which makes it practical to group
related debt markers under one label without forcing one giant regular
expression.

## Limits, ratchets, and failure behavior

`gh-counter` supports two different control styles. A `limit` is an absolute
maximum. A ratchet is directional: `no_increase` prevents a counter from going
up relative to the baseline, while `target` expresses a longer-term threshold
that the counter should eventually stay under. Each rule has its own `fail`
switch so that teams can begin by observing a metric before they start enforcing
it. On pull requests, only counters that are relevant to the current diff are
allowed to fail the workflow. On default-branch pushes, all counters are
evaluated because the baseline is the previously published summary or, if
publishing is disabled, the run is informational only.

## Outputs and artifacts

The action always writes generated files to `.gh-counter` unless you override
the output directory. This is useful even when publishing is disabled, because a
workflow can upload those files as artifacts or inspect them in later steps.
The action also exposes the summary path, the full summary JSON, the number of
failing violations, and the publish branch through action outputs.

## Documentation

The README is intentionally focused on first-time adoption. The full
configuration reference, field semantics, and publishing details live in
[docs/configuration.md](docs/configuration.md).

## Marketplace and release notes

This repository is intended to be used as a JavaScript action. In practice that
means `action.yml` stays at the repository root and `dist/` is committed for the
release tag that users reference. Marketplace publication may also require
account-level setup on GitHub's side, including agreement and listing metadata.

## License

MIT
