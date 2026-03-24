# gh-counter

`gh-counter` is a GitHub Action for counting configurable code markers, posting
pull request summaries, and publishing stable badge assets to a dedicated
branch.

## Features

- Count multiple markers at once
- Configure multiple matchers per counter
- Compare pull requests against the merge base
- Publish stable badge files and JSON summaries to a dedicated branch
- Update a single pull request comment in place using an HTML marker
- Enforce optional `limit`, `no_increase`, and `target` policies
- Fall back gracefully when pull request comments or branch publishing are not
  permitted

## Requirements

- Run [`actions/checkout`](https://github.com/actions/checkout) before this
  action
- Use `fetch-depth: 0` if you want accurate merge-base comparisons on pull
  requests
- Grant `pull-requests: write` if you want PR comments
- Grant `contents: write` if you want publish-branch updates

## Example

```yaml
name: gh-counter

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: write
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

## Configuration

Create `.github/gh-counter.yml`:

```yaml
version: 1
publish:
  branch: badge-assets
comment:
  key: default
counters:
  - id: todo
    label: TODOs
    matchers:
      - files: ["**/*.ts", "**/*.js", "**/*.py"]
        type: regex
        pattern: "(?:#|//|/\\*+|\\*)\\s*TODO\\b"
    limit:
      max: 100
      fail: false
    ratchet:
      no_increase: true
      fail: true
  - id: type-ignore
    label: type: ignore
    matchers:
      - files: ["**/*.py"]
        type: contains
        pattern: "# type: ignore"
    badge:
      label: type: ignore
```

## Matching semantics

- Matching is line-based
- A single line counts at most once per counter, even if multiple matchers match
  the same line
- `contains` checks whether the line contains the configured string
- `regex` checks whether the line matches the configured regular expression

## Published files

When the action runs on a push to the default branch and publishing is enabled,
it force-replaces the publish branch contents with these generated files:

- `summary.json`
- `badges/<counter-id>.svg`
- `counters/<counter-id>.json`

That gives you stable raw URLs such as:

```md
![TODOs](https://raw.githubusercontent.com/<owner>/<repo>/<publish-branch>/badges/todo.svg)
```

## Pull request comments

The action updates a single managed comment using an HTML marker:

```html
<!-- gh-counter:<comment-key> -->
```

If you run multiple `gh-counter` instances in the same repository, set a unique
`comment.key` or `comment-key` for each one.

## Policies

- `limit.max`: absolute maximum allowed count
- `ratchet.no_increase`: fail if the counter increases relative to the baseline
- `ratchet.target`: fail if the current count is above the target value
- `fail: true`: make the corresponding violation fail the action

On pull requests, the baseline is the merge base with the target branch. On
pushes to the default branch, the baseline is the previously published
`summary.json` from the publish branch.

## Artifacts

The action writes generated files to `.gh-counter` by default and exposes their
paths as outputs. If you also want workflow artifacts, upload those files in
your workflow after running this action.

## Marketplace notes

This repository is intended to be publishable as a JavaScript action. Before
publishing a Marketplace release, make sure:

- the repository is public
- `action.yml` remains at the repository root
- `dist/` is committed for the release tag
- your GitHub account or organization has accepted the Marketplace developer
  agreement

## License

MIT
