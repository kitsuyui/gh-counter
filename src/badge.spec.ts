import { describe, expect, test } from 'vitest'

import { renderBadge } from './badge'

describe('badge rendering', () => {
  test('escapes symbol-heavy labels for svg output', () => {
    const svg = renderBadge(
      {
        id: 'code-tag',
        label: '<code>|`&"\'',
        current: 3,
        base: 2,
        delta: 1,
        dashboard_current: 3,
        dashboard_base: 2,
        dashboard_delta: 1,
        commentable: true,
        touched_files: [],
        file_deltas: [],
        patch_file_deltas: [],
        violations: [],
        badge_path: '.gh-counter/badges/code-tag.svg',
        counter_path: '.gh-counter/counters/code-tag.json',
      },
      {
        label: '<code>|`&"\'',
      }
    )

    expect(svg).toContain('aria-label="&lt;code&gt;|`&amp;&quot;&apos;: 3"')
    expect(svg).toContain('&lt;code&gt;|`&amp;&quot;&apos;')
    expect(svg).not.toContain('<text x="55" y="14"><code>')
  })
})
