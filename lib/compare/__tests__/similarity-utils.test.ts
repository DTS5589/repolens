import { describe, it, expect } from 'vitest'
import type { RepoTreeItem } from '@/types/repository'
import type { ComparisonRepo } from '@/types/comparison'
import {
  isBoilerplate,
  buildShaMap,
  computeShaJaccard,
  computeShaContainment,
  computePathJaccard,
  computeDependencyOverlap,
  computeLanguageCosine,
  findIdenticalFiles,
  computePairwiseSimilarity,
  computeAllSimilarities,
  WEIGHT_SHA_JACCARD,
  WEIGHT_SHA_CONTAINMENT,
  WEIGHT_PATH_JACCARD,
  WEIGHT_DEPENDENCY_OVERLAP,
  WEIGHT_LANGUAGE_COSINE,
} from '../similarity-utils'

// ── Factories ───────────────────────────────────────────────────────

function blob(path: string, sha: string): RepoTreeItem {
  return { path, mode: '100644', type: 'blob', sha }
}

function tree(path: string): RepoTreeItem {
  return { path, mode: '040000', type: 'tree', sha: 'tree-sha' }
}

function createRepo(overrides: Partial<ComparisonRepo> = {}): ComparisonRepo {
  return {
    id: 'owner/repo',
    repo: {
      owner: 'owner',
      name: 'repo',
      fullName: 'owner/repo',
      description: null,
      defaultBranch: 'main',
      stars: 0,
      forks: 0,
      language: null,
      topics: [],
      isPrivate: false,
      url: 'https://github.com/owner/repo',
      openIssuesCount: 0,
      pushedAt: '2025-01-01',
      license: null,
    },
    files: [],
    metrics: {
      totalFiles: 0,
      totalLines: 0,
      primaryLanguage: null,
      languageBreakdown: {},
      stars: 0,
      forks: 0,
      openIssues: 0,
      pushedAt: null,
      license: null,
    },
    status: 'ready',
    ...overrides,
  }
}

// ── isBoilerplate ───────────────────────────────────────────────────

describe('isBoilerplate', () => {
  it.each([
    '.gitignore',
    '.gitattributes',
    '.editorconfig',
    'LICENSE',
    'LICENSE.md',
    'license.txt',
    '.prettierrc',
    '.eslintrc.json',
    'eslint.config.js',
    'eslint.config.mjs',
    'tsconfig.json',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
  ])('returns true for "%s"', (path) => {
    expect(isBoilerplate(path)).toBe(true)
  })

  it.each([
    '.github/workflows/ci.yml',
    '.github/CODEOWNERS',
    '.vscode/settings.json',
  ])('returns true for directory prefix "%s"', (path) => {
    expect(isBoilerplate(path)).toBe(true)
  })

  it.each([
    'tsconfig.build.json',
    'postcss.config.mjs',
    'tailwind.config.ts',
    'next.config.mjs',
    'vite.config.ts',
    'vitest.config.ts',
  ])('returns true for config file "%s"', (path) => {
    expect(isBoilerplate(path)).toBe(true)
  })

  it.each([
    'src/index.ts',
    'lib/utils.ts',
    'components/Button.tsx',
    'app/page.tsx',
    'README.md',
  ])('returns false for source file "%s"', (path) => {
    expect(isBoilerplate(path)).toBe(false)
  })
})

// ── buildShaMap ─────────────────────────────────────────────────────

describe('buildShaMap', () => {
  it('maps SHA → path for blob items', () => {
    const items = [blob('src/a.ts', 'sha-a'), blob('src/b.ts', 'sha-b')]
    const map = buildShaMap(items)
    expect(map.get('sha-a')).toBe('src/a.ts')
    expect(map.get('sha-b')).toBe('src/b.ts')
    expect(map.size).toBe(2)
  })

  it('excludes tree-type items', () => {
    const items = [blob('src/a.ts', 'sha-a'), tree('src')]
    const map = buildShaMap(items)
    expect(map.size).toBe(1)
  })

  it('excludes boilerplate files', () => {
    const items = [
      blob('src/a.ts', 'sha-a'),
      blob('.gitignore', 'sha-gi'),
      blob('tsconfig.json', 'sha-ts'),
    ]
    const map = buildShaMap(items)
    expect(map.size).toBe(1)
    expect(map.get('sha-a')).toBe('src/a.ts')
  })

  it('returns empty map for empty input', () => {
    expect(buildShaMap([]).size).toBe(0)
  })
})

// ── computeShaJaccard ───────────────────────────────────────────────

describe('computeShaJaccard', () => {
  it('returns 1.0 for identical sets', () => {
    const s = new Set(['a', 'b', 'c'])
    expect(computeShaJaccard(s, s)).toBe(1)
  })

  it('returns 0.0 for disjoint sets', () => {
    const a = new Set(['a', 'b'])
    const b = new Set(['c', 'd'])
    expect(computeShaJaccard(a, b)).toBe(0)
  })

  it('returns correct ratio for partial overlap', () => {
    const a = new Set(['a', 'b', 'c'])
    const b = new Set(['b', 'c', 'd'])
    // intersection=2, union=4 → 0.5
    expect(computeShaJaccard(a, b)).toBe(0.5)
  })

  it('returns 0 for two empty sets', () => {
    expect(computeShaJaccard(new Set(), new Set())).toBe(0)
  })

  it('returns 0 when one set is empty', () => {
    expect(computeShaJaccard(new Set(['a']), new Set())).toBe(0)
  })
})

// ── computeShaContainment ───────────────────────────────────────────

describe('computeShaContainment', () => {
  it('returns 1.0 when A is a subset of B', () => {
    const a = new Set(['a', 'b'])
    const b = new Set(['a', 'b', 'c', 'd'])
    expect(computeShaContainment(a, b)).toBe(1)
  })

  it('returns 1.0 when B is a subset of A', () => {
    const a = new Set(['a', 'b', 'c', 'd'])
    const b = new Set(['a', 'b'])
    expect(computeShaContainment(a, b)).toBe(1)
  })

  it('returns 0.0 for disjoint sets', () => {
    const a = new Set(['a'])
    const b = new Set(['b'])
    expect(computeShaContainment(a, b)).toBe(0)
  })

  it('returns 0 for empty sets', () => {
    expect(computeShaContainment(new Set(), new Set())).toBe(0)
  })

  it('returns 0 when one set is empty', () => {
    expect(computeShaContainment(new Set(['a']), new Set())).toBe(0)
  })

  it('returns correct ratio for partial overlap', () => {
    const a = new Set(['a', 'b', 'c'])
    const b = new Set(['b', 'c', 'd', 'e'])
    // intersection=2, min(3,4)=3 → 2/3
    expect(computeShaContainment(a, b)).toBeCloseTo(2 / 3)
  })
})

// ── computePathJaccard ──────────────────────────────────────────────

describe('computePathJaccard', () => {
  it('returns 1.0 for identical path sets', () => {
    const paths = new Set(['src/a.ts', 'src/b.ts'])
    expect(computePathJaccard(paths, paths)).toBe(1)
  })

  it('returns 0.0 for completely different paths', () => {
    const a = new Set(['src/a.ts'])
    const b = new Set(['lib/b.ts'])
    expect(computePathJaccard(a, b)).toBe(0)
  })

  it('returns correct ratio for partial overlap', () => {
    const a = new Set(['src/a.ts', 'src/b.ts', 'src/c.ts'])
    const b = new Set(['src/b.ts', 'src/c.ts', 'src/d.ts'])
    // intersection=2, union=4
    expect(computePathJaccard(a, b)).toBe(0.5)
  })

  it('returns 0 for two empty sets', () => {
    expect(computePathJaccard(new Set(), new Set())).toBe(0)
  })
})

// ── computeDependencyOverlap ────────────────────────────────────────

describe('computeDependencyOverlap', () => {
  it('returns correct overlap for shared packages', () => {
    const a = { react: '18', next: '14', zod: '3' }
    const b = { react: '18', vue: '3', zod: '3' }
    // intersection=2 (react, zod), union=4
    expect(computeDependencyOverlap(a, b)).toBe(0.5)
  })

  it('returns 1.0 for identical package sets', () => {
    const deps = { react: '18', next: '14' }
    expect(computeDependencyOverlap(deps, deps)).toBe(1)
  })

  it('returns 0 for no shared packages', () => {
    const a = { react: '18' }
    const b = { vue: '3' }
    expect(computeDependencyOverlap(a, b)).toBe(0)
  })

  it('returns 0 when depsA is undefined', () => {
    expect(computeDependencyOverlap(undefined, { react: '18' })).toBe(0)
  })

  it('returns 0 when depsB is undefined', () => {
    expect(computeDependencyOverlap({ react: '18' }, undefined)).toBe(0)
  })

  it('returns 0 when both are undefined', () => {
    expect(computeDependencyOverlap(undefined, undefined)).toBe(0)
  })

  it('returns 0 when one has empty deps', () => {
    expect(computeDependencyOverlap({}, { react: '18' })).toBe(0)
  })
})

// ── computeLanguageCosine ───────────────────────────────────────────

describe('computeLanguageCosine', () => {
  it('returns 1.0 for identical distributions', () => {
    const lang = { typescript: 80, javascript: 20 }
    expect(computeLanguageCosine(lang, lang)).toBeCloseTo(1)
  })

  it('returns 0.0 for orthogonal distributions', () => {
    const a = { typescript: 100 }
    const b = { python: 100 }
    expect(computeLanguageCosine(a, b)).toBe(0)
  })

  it('returns 1.0 for proportional distributions', () => {
    const a = { typescript: 60, javascript: 40 }
    const b = { typescript: 30, javascript: 20 }
    expect(computeLanguageCosine(a, b)).toBeCloseTo(1)
  })

  it('returns 0 for two empty distributions', () => {
    expect(computeLanguageCosine({}, {})).toBe(0)
  })

  it('returns 0 when one distribution is empty', () => {
    expect(computeLanguageCosine({ typescript: 10 }, {})).toBe(0)
  })

  it('handles single-language repos correctly', () => {
    const a = { typescript: 100 }
    const b = { typescript: 50 }
    expect(computeLanguageCosine(a, b)).toBeCloseTo(1)
  })
})

// ── findIdenticalFiles ──────────────────────────────────────────────

describe('findIdenticalFiles', () => {
  it('returns matching paths sorted alphabetically', () => {
    const mapA = new Map([['sha1', 'src/b.ts'], ['sha2', 'src/a.ts']])
    const mapB = new Map([['sha1', 'lib/x.ts'], ['sha2', 'lib/y.ts']])
    expect(findIdenticalFiles(mapA, mapB)).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('excludes paths without matching SHAs', () => {
    const mapA = new Map([['sha1', 'src/a.ts'], ['sha-only-a', 'src/unique.ts']])
    const mapB = new Map([['sha1', 'lib/a.ts']])
    expect(findIdenticalFiles(mapA, mapB)).toEqual(['src/a.ts'])
  })

  it('returns empty array when no SHAs match', () => {
    const mapA = new Map([['sha-a', 'src/a.ts']])
    const mapB = new Map([['sha-b', 'lib/b.ts']])
    expect(findIdenticalFiles(mapA, mapB)).toEqual([])
  })

  it('returns empty array for empty maps', () => {
    expect(findIdenticalFiles(new Map(), new Map())).toEqual([])
  })
})

// ── computePairwiseSimilarity ───────────────────────────────────────

describe('computePairwiseSimilarity', () => {
  it('returns score≈1, label="likely-clone" for identical repos', () => {
    const items: RepoTreeItem[] = Array.from({ length: 5 }, (_, i) =>
      blob(`src/file${i}.ts`, `sha-${i}`)
    )
    const deps = { deps: { react: '18', next: '14' }, devDeps: { vitest: '1' } }
    const lang = { typescript: 80, javascript: 20 }

    const repoA = createRepo({
      id: 'owner/repo-a',
      treeItems: items,
      dependencies: deps,
      metrics: { ...createRepo().metrics, languageBreakdown: lang },
    })
    const repoB = createRepo({
      id: 'owner/repo-b',
      treeItems: items,
      dependencies: deps,
      metrics: { ...createRepo().metrics, languageBreakdown: lang },
    })

    const result = computePairwiseSimilarity(repoA, repoB)
    expect(result.score).toBeCloseTo(1)
    expect(result.label).toBe('likely-clone')
    expect(result.identicalFiles).toHaveLength(5)
    expect(result.repoA).toBe('owner/repo-a')
    expect(result.repoB).toBe('owner/repo-b')
  })

  it('returns score=0, label="different" for completely different repos', () => {
    const repoA = createRepo({
      id: 'a/a',
      treeItems: [blob('src/a.ts', 'sha-a')],
      dependencies: { deps: { react: '18' }, devDeps: {} },
      metrics: { ...createRepo().metrics, languageBreakdown: { typescript: 100 } },
    })
    const repoB = createRepo({
      id: 'b/b',
      treeItems: [blob('lib/z.py', 'sha-z')],
      dependencies: { deps: { flask: '2' }, devDeps: {} },
      metrics: { ...createRepo().metrics, languageBreakdown: { python: 100 } },
    })

    const result = computePairwiseSimilarity(repoA, repoB)
    expect(result.score).toBe(0)
    expect(result.label).toBe('different')
    expect(result.identicalFiles).toHaveLength(0)
  })

  it('weights sum to 1.0', () => {
    const sum =
      WEIGHT_SHA_JACCARD +
      WEIGHT_SHA_CONTAINMENT +
      WEIGHT_PATH_JACCARD +
      WEIGHT_DEPENDENCY_OVERLAP +
      WEIGHT_LANGUAGE_COSINE
    expect(sum).toBeCloseTo(1.0)
  })

  it('computes score as weighted sum of signals', () => {
    const sharedItems = [blob('src/shared.ts', 'sha-shared')]
    const uniqueA = [blob('src/only-a.ts', 'sha-a')]
    const uniqueB = [blob('src/only-b.ts', 'sha-b')]

    const repoA = createRepo({
      id: 'a/a',
      treeItems: [...sharedItems, ...uniqueA],
      metrics: { ...createRepo().metrics, languageBreakdown: {} },
    })
    const repoB = createRepo({
      id: 'b/b',
      treeItems: [...sharedItems, ...uniqueB],
      metrics: { ...createRepo().metrics, languageBreakdown: {} },
    })

    const result = computePairwiseSimilarity(repoA, repoB)

    // shaJaccard: 1/3, shaContainment: 1/2, pathJaccard: 1/3, deps: 0, lang: 0
    const expected =
      (1 / 3) * WEIGHT_SHA_JACCARD +
      0.5 * WEIGHT_SHA_CONTAINMENT +
      (1 / 3) * WEIGHT_PATH_JACCARD +
      0 * WEIGHT_DEPENDENCY_OVERLAP +
      0 * WEIGHT_LANGUAGE_COSINE

    expect(result.score).toBeCloseTo(expected)
  })

  it('sets isLowConfidence when total compared files < 10', () => {
    const repoA = createRepo({
      id: 'a/a',
      treeItems: [blob('a.ts', 'sha-a')],
      metrics: { ...createRepo().metrics, languageBreakdown: {} },
    })
    const repoB = createRepo({
      id: 'b/b',
      treeItems: [blob('b.ts', 'sha-b')],
      metrics: { ...createRepo().metrics, languageBreakdown: {} },
    })

    const result = computePairwiseSimilarity(repoA, repoB)
    expect(result.isLowConfidence).toBe(true)
    expect(result.totalComparedFiles).toBe(2)
  })

  it('sets isLowConfidence=false when total compared files >= 10', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      blob(`src/file${i}.ts`, `sha-${i}`)
    )
    const repoA = createRepo({
      id: 'a/a',
      treeItems: items,
      metrics: { ...createRepo().metrics, languageBreakdown: {} },
    })
    const repoB = createRepo({
      id: 'b/b',
      treeItems: items,
      metrics: { ...createRepo().metrics, languageBreakdown: {} },
    })

    const result = computePairwiseSimilarity(repoA, repoB)
    expect(result.isLowConfidence).toBe(false)
    expect(result.totalComparedFiles).toBe(10)
  })

  describe('label thresholds', () => {
    it('labels >= 0.80 as "likely-clone"', () => {
      const items = Array.from({ length: 5 }, (_, i) =>
        blob(`src/f${i}.ts`, `sha-${i}`)
      )
      const repo = createRepo({
        treeItems: items,
        dependencies: { deps: { react: '18' }, devDeps: {} },
        metrics: { ...createRepo().metrics, languageBreakdown: { ts: 100 } },
      })
      const result = computePairwiseSimilarity(
        { ...repo, id: 'a/a' },
        { ...repo, id: 'b/b' }
      )
      expect(result.score).toBeGreaterThanOrEqual(0.8)
      expect(result.label).toBe('likely-clone')
    })

    it('labels score in [0.20, 0.50) as "some-overlap"', () => {
      // 100% language cosine (0.10) + 100% dep overlap (0.15) = 0.25
      const repoA = createRepo({
        id: 'a/a',
        treeItems: [blob('src/a.ts', 'sha-a')],
        dependencies: { deps: { react: '18' }, devDeps: {} },
        metrics: { ...createRepo().metrics, languageBreakdown: { ts: 100 } },
      })
      const repoB = createRepo({
        id: 'b/b',
        treeItems: [blob('lib/z.ts', 'sha-z')],
        dependencies: { deps: { react: '18' }, devDeps: {} },
        metrics: { ...createRepo().metrics, languageBreakdown: { ts: 100 } },
      })
      const result = computePairwiseSimilarity(repoA, repoB)
      expect(result.score).toBeGreaterThanOrEqual(0.2)
      expect(result.score).toBeLessThan(0.5)
      expect(result.label).toBe('some-overlap')
    })

    it('labels score < 0.20 as "different"', () => {
      const repoA = createRepo({
        id: 'a/a',
        treeItems: [blob('src/a.ts', 'sha-a')],
        metrics: { ...createRepo().metrics, languageBreakdown: { typescript: 100 } },
      })
      const repoB = createRepo({
        id: 'b/b',
        treeItems: [blob('lib/z.py', 'sha-z')],
        metrics: { ...createRepo().metrics, languageBreakdown: { python: 100 } },
      })
      const result = computePairwiseSimilarity(repoA, repoB)
      expect(result.score).toBeLessThan(0.2)
      expect(result.label).toBe('different')
    })
  })

  describe('fork detection', () => {
    it('detects when repoA is a fork of repoB', () => {
      const repoA = createRepo({
        id: 'fork/repo',
        repo: { ...createRepo().repo, fullName: 'fork/repo', isFork: true, parentFullName: 'original/repo' },
        treeItems: [blob('a.ts', 'sha-a')],
        metrics: { ...createRepo().metrics, languageBreakdown: {} },
      })
      const repoB = createRepo({
        id: 'original/repo',
        repo: { ...createRepo().repo, fullName: 'original/repo' },
        treeItems: [blob('a.ts', 'sha-a')],
        metrics: { ...createRepo().metrics, languageBreakdown: {} },
      })

      const result = computePairwiseSimilarity(repoA, repoB)
      expect(result.relationship.isForkPair).toBe(true)
      expect(result.relationship.commonParent).toBe('original/repo')
    })

    it('detects when repoB is a fork of repoA', () => {
      const repoA = createRepo({
        id: 'original/repo',
        repo: { ...createRepo().repo, fullName: 'original/repo' },
        treeItems: [blob('a.ts', 'sha-a')],
        metrics: { ...createRepo().metrics, languageBreakdown: {} },
      })
      const repoB = createRepo({
        id: 'fork/repo',
        repo: { ...createRepo().repo, fullName: 'fork/repo', isFork: true, parentFullName: 'original/repo' },
        treeItems: [blob('a.ts', 'sha-a')],
        metrics: { ...createRepo().metrics, languageBreakdown: {} },
      })

      const result = computePairwiseSimilarity(repoA, repoB)
      expect(result.relationship.isForkPair).toBe(true)
      expect(result.relationship.commonParent).toBe('original/repo')
    })

    it('detects sibling forks with the same parent', () => {
      const baseRepo = createRepo().repo
      const repoA = createRepo({
        id: 'fork-a/repo',
        repo: { ...baseRepo, fullName: 'fork-a/repo', isFork: true, parentFullName: 'upstream/repo' },
        treeItems: [blob('a.ts', 'sha-a')],
        metrics: { ...createRepo().metrics, languageBreakdown: {} },
      })
      const repoB = createRepo({
        id: 'fork-b/repo',
        repo: { ...baseRepo, fullName: 'fork-b/repo', isFork: true, parentFullName: 'upstream/repo' },
        treeItems: [blob('b.ts', 'sha-b')],
        metrics: { ...createRepo().metrics, languageBreakdown: {} },
      })

      const result = computePairwiseSimilarity(repoA, repoB)
      expect(result.relationship.isForkPair).toBe(true)
      expect(result.relationship.commonParent).toBe('upstream/repo')
    })

    it('returns isForkPair=false for unrelated repos', () => {
      const repoA = createRepo({
        id: 'a/repo',
        treeItems: [blob('a.ts', 'sha-a')],
        metrics: { ...createRepo().metrics, languageBreakdown: {} },
      })
      const repoB = createRepo({
        id: 'b/repo',
        treeItems: [blob('b.ts', 'sha-b')],
        metrics: { ...createRepo().metrics, languageBreakdown: {} },
      })

      const result = computePairwiseSimilarity(repoA, repoB)
      expect(result.relationship.isForkPair).toBe(false)
      expect(result.relationship.commonParent).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('handles repos with no treeItems (undefined)', () => {
      const repoA = createRepo({
        id: 'a/a',
        treeItems: undefined,
        metrics: { ...createRepo().metrics, languageBreakdown: {} },
      })
      const repoB = createRepo({
        id: 'b/b',
        treeItems: undefined,
        metrics: { ...createRepo().metrics, languageBreakdown: {} },
      })

      const result = computePairwiseSimilarity(repoA, repoB)
      expect(result.score).toBe(0)
      expect(result.label).toBe('different')
    })

    it('handles repos with empty treeItems array', () => {
      const repoA = createRepo({
        id: 'a/a',
        treeItems: [],
        metrics: { ...createRepo().metrics, languageBreakdown: {} },
      })
      const repoB = createRepo({
        id: 'b/b',
        treeItems: [],
        metrics: { ...createRepo().metrics, languageBreakdown: {} },
      })

      const result = computePairwiseSimilarity(repoA, repoB)
      expect(result.score).toBe(0)
    })

    it('handles repos with all boilerplate files', () => {
      const repoA = createRepo({
        id: 'a/a',
        treeItems: [
          blob('.gitignore', 'sha-gi'),
          blob('tsconfig.json', 'sha-ts'),
          blob('pnpm-lock.yaml', 'sha-lock'),
        ],
        metrics: { ...createRepo().metrics, languageBreakdown: {} },
      })
      const repoB = createRepo({
        id: 'b/b',
        treeItems: [
          blob('.gitignore', 'sha-gi'),
          blob('tsconfig.json', 'sha-ts'),
        ],
        metrics: { ...createRepo().metrics, languageBreakdown: {} },
      })

      const result = computePairwiseSimilarity(repoA, repoB)
      expect(result.signals.shaJaccard).toBe(0)
      expect(result.signals.shaContainment).toBe(0)
      expect(result.signals.pathJaccard).toBe(0)
    })
  })
})

// ── computeAllSimilarities ──────────────────────────────────────────

describe('computeAllSimilarities', () => {
  function makeRepo(id: string, shas: string[]): ComparisonRepo {
    return createRepo({
      id,
      treeItems: shas.map((sha, i) => blob(`src/file${i}.ts`, sha)),
      metrics: { ...createRepo().metrics, languageBreakdown: { ts: 100 } },
    })
  }

  it('returns empty array for fewer than 2 repos', () => {
    expect(computeAllSimilarities([])).toEqual([])
    expect(computeAllSimilarities([makeRepo('a/a', ['sha1'])])).toEqual([])
  })

  it('returns 1 result for 2 repos', () => {
    const repos = [makeRepo('a/a', ['sha1']), makeRepo('b/b', ['sha2'])]
    const results = computeAllSimilarities(repos)
    expect(results).toHaveLength(1)
  })

  it('returns N*(N-1)/2 results for N repos', () => {
    const repos = [
      makeRepo('a/a', ['sha1']),
      makeRepo('b/b', ['sha2']),
      makeRepo('c/c', ['sha3']),
      makeRepo('d/d', ['sha4']),
    ]
    expect(computeAllSimilarities(repos)).toHaveLength(6)
  })

  it('returns results sorted by score descending', () => {
    const repos = [
      makeRepo('a/a', ['sha1', 'sha2']),
      makeRepo('b/b', ['sha1', 'sha2']),       // identical to a
      makeRepo('c/c', ['sha-x', 'sha-y']),      // different
    ]
    const results = computeAllSimilarities(repos)
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
    }
    expect(results[0].repoA).toBe('a/a')
    expect(results[0].repoB).toBe('b/b')
  })
})
