// Shared test fixtures for diagram generator tests

import type { FullAnalysis, FileAnalysis, DependencyGraph, TopologyAnalysis } from '@/lib/code/parser/types'
import type { CodeIndex, IndexedFile } from '@/lib/code/code-index'
import type { FileNode } from '@/types/repository'

// ────────── Minimal analysis (single file, no edges) ──────────

function createMinimalFileAnalysis(path: string): FileAnalysis {
  return {
    path,
    imports: [],
    exports: [{ name: 'default', kind: 'function', isDefault: true }],
    types: [],
    classes: [],
    jsxComponents: [],
    language: 'typescript',
  }
}

export function createMinimalAnalysis(): FullAnalysis {
  const files = new Map<string, FileAnalysis>()
  files.set('src/index.ts', createMinimalFileAnalysis('src/index.ts'))

  const graph: DependencyGraph = {
    edges: new Map(),
    reverseEdges: new Map(),
    circular: [],
    externalDeps: new Map(),
  }

  const topology: TopologyAnalysis = {
    entryPoints: ['src/index.ts'],
    hubs: [],
    orphans: [],
    leafNodes: [],
    connectors: [],
    clusters: [['src/index.ts']],
    depthMap: new Map([['src/index.ts', 0]]),
    maxDepth: 0,
  }

  return {
    files,
    graph,
    topology,
    detectedFramework: null,
    primaryLanguage: 'typescript',
  }
}

// ────────── Empty analysis (no files at all) ──────────

export function createEmptyAnalysis(): FullAnalysis {
  return {
    files: new Map(),
    graph: {
      edges: new Map(),
      reverseEdges: new Map(),
      circular: [],
      externalDeps: new Map(),
    },
    topology: {
      entryPoints: [],
      hubs: [],
      orphans: [],
      leafNodes: [],
      connectors: [],
      clusters: [],
      depthMap: new Map(),
      maxDepth: 0,
    },
    detectedFramework: null,
    primaryLanguage: 'typescript',
  }
}

// ────────── Realistic analysis (multi-file project with types, classes, imports, circular deps) ──────────

export function createRealisticAnalysis(): FullAnalysis {
  const files = new Map<string, FileAnalysis>()

  files.set('src/index.ts', {
    path: 'src/index.ts',
    imports: [
      { source: './app', resolvedPath: 'src/app.tsx', specifiers: ['App'], isExternal: false, isDefault: true },
      { source: 'react', resolvedPath: null, specifiers: ['React'], isExternal: true, isDefault: true },
    ],
    exports: [{ name: 'default', kind: 'function', isDefault: true }],
    types: [],
    classes: [],
    jsxComponents: ['App'],
    language: 'typescript',
  })

  files.set('src/app.tsx', {
    path: 'src/app.tsx',
    imports: [
      { source: './components/Button', resolvedPath: 'src/components/Button.tsx', specifiers: ['Button'], isExternal: false, isDefault: false },
      { source: './utils/helpers', resolvedPath: 'src/utils/helpers.ts', specifiers: ['formatDate'], isExternal: false, isDefault: false },
      { source: 'react', resolvedPath: null, specifiers: ['React'], isExternal: true, isDefault: true },
    ],
    exports: [{ name: 'App', kind: 'component', isDefault: true }],
    types: [],
    classes: [],
    jsxComponents: ['Button'],
    language: 'typescript',
  })

  files.set('src/components/Button.tsx', {
    path: 'src/components/Button.tsx',
    imports: [
      { source: 'react', resolvedPath: null, specifiers: ['React'], isExternal: true, isDefault: true },
      { source: '../types', resolvedPath: 'src/types.ts', specifiers: ['ButtonProps'], isExternal: false, isDefault: false },
    ],
    exports: [{ name: 'Button', kind: 'component', isDefault: false }],
    types: [],
    classes: [],
    jsxComponents: [],
    language: 'typescript',
  })

  files.set('src/utils/helpers.ts', {
    path: 'src/utils/helpers.ts',
    imports: [
      { source: '../types', resolvedPath: 'src/types.ts', specifiers: ['DateFormat'], isExternal: false, isDefault: false },
    ],
    exports: [
      { name: 'formatDate', kind: 'function', isDefault: false },
      { name: 'capitalize', kind: 'function', isDefault: false },
    ],
    types: [],
    classes: [],
    jsxComponents: [],
    language: 'typescript',
  })

  files.set('src/types.ts', {
    path: 'src/types.ts',
    imports: [],
    exports: [
      { name: 'ButtonProps', kind: 'interface', isDefault: false },
      { name: 'DateFormat', kind: 'type', isDefault: false },
      { name: 'Theme', kind: 'enum', isDefault: false },
    ],
    types: [
      { name: 'ButtonProps', kind: 'interface', properties: ['label: string', 'onClick: () => void', 'variant?: string'], exported: true },
      { name: 'DateFormat', kind: 'type', properties: ['short', 'long', 'iso'], exported: true },
      { name: 'Theme', kind: 'enum', properties: ['Light', 'Dark', 'System'], exported: true },
    ],
    classes: [],
    jsxComponents: [],
    language: 'typescript',
  })

  files.set('src/services/api.ts', {
    path: 'src/services/api.ts',
    imports: [
      { source: '../types', resolvedPath: 'src/types.ts', specifiers: ['ButtonProps'], isExternal: false, isDefault: false },
      { source: './auth', resolvedPath: 'src/services/auth.ts', specifiers: ['getToken'], isExternal: false, isDefault: false },
      { source: 'axios', resolvedPath: null, specifiers: ['axios'], isExternal: true, isDefault: true },
    ],
    exports: [{ name: 'fetchData', kind: 'function', isDefault: false }],
    types: [],
    classes: [
      {
        name: 'ApiClient',
        methods: ['get', 'post', 'put', 'delete'],
        properties: ['baseUrl: string', 'headers: Record<string, string>'],
        extends: 'BaseClient',
        implements: ['HttpClient'],
        exported: true,
      },
    ],
    jsxComponents: [],
    language: 'typescript',
  })

  files.set('src/services/auth.ts', {
    path: 'src/services/auth.ts',
    imports: [
      { source: './api', resolvedPath: 'src/services/api.ts', specifiers: ['fetchData'], isExternal: false, isDefault: false },
    ],
    exports: [{ name: 'getToken', kind: 'function', isDefault: false }],
    types: [
      { name: 'HttpClient', kind: 'interface', properties: ['get(url: string): Promise<any>', 'post(url: string, data: any): Promise<any>'], exported: true },
      { name: 'BaseClient', kind: 'interface', properties: ['baseUrl: string'], extends: ['HttpClient'], exported: true },
    ],
    classes: [],
    jsxComponents: [],
    language: 'typescript',
  })

  files.set('src/orphan.ts', {
    path: 'src/orphan.ts',
    imports: [],
    exports: [],
    types: [],
    classes: [],
    jsxComponents: [],
    language: 'typescript',
  })

  // Build the dependency graph
  const edges = new Map<string, Set<string>>()
  edges.set('src/index.ts', new Set(['src/app.tsx']))
  edges.set('src/app.tsx', new Set(['src/components/Button.tsx', 'src/utils/helpers.ts']))
  edges.set('src/components/Button.tsx', new Set(['src/types.ts']))
  edges.set('src/utils/helpers.ts', new Set(['src/types.ts']))
  edges.set('src/services/api.ts', new Set(['src/types.ts', 'src/services/auth.ts']))
  edges.set('src/services/auth.ts', new Set(['src/services/api.ts'])) // circular

  const reverseEdges = new Map<string, Set<string>>()
  reverseEdges.set('src/app.tsx', new Set(['src/index.ts']))
  reverseEdges.set('src/components/Button.tsx', new Set(['src/app.tsx']))
  reverseEdges.set('src/utils/helpers.ts', new Set(['src/app.tsx']))
  reverseEdges.set('src/types.ts', new Set(['src/components/Button.tsx', 'src/utils/helpers.ts', 'src/services/api.ts']))
  reverseEdges.set('src/services/auth.ts', new Set(['src/services/api.ts']))
  reverseEdges.set('src/services/api.ts', new Set(['src/services/auth.ts']))

  const externalDeps = new Map<string, Set<string>>()
  externalDeps.set('react', new Set(['src/index.ts', 'src/app.tsx', 'src/components/Button.tsx']))
  externalDeps.set('axios', new Set(['src/services/api.ts']))

  const graph: DependencyGraph = {
    edges,
    reverseEdges,
    circular: [['src/services/api.ts', 'src/services/auth.ts']],
    externalDeps,
  }

  const topology: TopologyAnalysis = {
    entryPoints: ['src/index.ts'],
    hubs: ['src/types.ts'],
    orphans: ['src/orphan.ts'],
    leafNodes: ['src/types.ts'],
    connectors: ['src/app.tsx'],
    clusters: [
      ['src/index.ts', 'src/app.tsx', 'src/components/Button.tsx', 'src/utils/helpers.ts', 'src/types.ts'],
      ['src/services/api.ts', 'src/services/auth.ts'],
    ],
    depthMap: new Map([
      ['src/index.ts', 0],
      ['src/app.tsx', 1],
      ['src/components/Button.tsx', 2],
      ['src/utils/helpers.ts', 2],
      ['src/types.ts', 3],
      ['src/services/api.ts', 1],
      ['src/services/auth.ts', 2],
    ]),
    maxDepth: 3,
  }

  return {
    files,
    graph,
    topology,
    detectedFramework: null,
    primaryLanguage: 'typescript',
  }
}

// ────────── Large analysis (>80 files, triggers collapsed rendering) ──────────

export function createLargeAnalysis(fileCount = 100): FullAnalysis {
  const files = new Map<string, FileAnalysis>()
  const edges = new Map<string, Set<string>>()
  const reverseEdges = new Map<string, Set<string>>()
  const dirs = ['src', 'lib', 'components', 'utils', 'services']

  for (let i = 0; i < fileCount; i++) {
    const dir = dirs[i % dirs.length]
    const path = `${dir}/file${i}.ts`
    files.set(path, {
      path,
      imports: [],
      exports: [{ name: `export${i}`, kind: 'function', isDefault: false }],
      types: [],
      classes: [],
      jsxComponents: [],
      language: 'typescript',
    })

    // Create some cross-directory edges
    if (i > 0) {
      const prevDir = dirs[(i - 1) % dirs.length]
      const prevPath = `${prevDir}/file${i - 1}.ts`
      if (!edges.has(path)) edges.set(path, new Set())
      edges.get(path)!.add(prevPath)
      if (!reverseEdges.has(prevPath)) reverseEdges.set(prevPath, new Set())
      reverseEdges.get(prevPath)!.add(path)
    }
  }

  return {
    files,
    graph: { edges, reverseEdges, circular: [], externalDeps: new Map() },
    topology: {
      entryPoints: ['src/file0.ts'],
      hubs: ['lib/file1.ts'],
      orphans: [],
      leafNodes: [],
      connectors: [],
      clusters: [Array.from(files.keys())],
      depthMap: new Map(Array.from(files.keys()).map((p, i) => [p, i])),
      maxDepth: fileCount - 1,
    },
    detectedFramework: null,
    primaryLanguage: 'typescript',
  }
}

// ────────── Mock CodeIndex ──────────

export function createMockCodeIndex(): CodeIndex {
  const files = new Map<string, IndexedFile>()

  const addFile = (path: string, content: string, language = 'typescript') => {
    const lines = content.split('\n')
    files.set(path, {
      path,
      name: path.split('/').pop() || path,
      content,
      language,
      lines,
      lineCount: lines.length,
    })
  }

  addFile('src/index.ts', 'import { App } from "./app"\nexport default App\n')
  addFile('src/app.tsx', 'import { Button } from "./components/Button"\nexport function App() { return <Button /> }\n')
  addFile('src/components/Button.tsx', 'export function Button({ label }: ButtonProps) { return <button>{label}</button> }\n')
  addFile('src/utils/helpers.ts', 'export function formatDate(d: Date) { return d.toISOString() }\nexport function capitalize(s: string) { return s[0].toUpperCase() + s.slice(1) }\n')
  addFile('src/types.ts', 'export interface ButtonProps { label: string; onClick: () => void }\nexport type DateFormat = "short" | "long"\nexport enum Theme { Light, Dark, System }\n')
  addFile('src/services/api.ts', 'import axios from "axios"\nexport class ApiClient { get() {} post() {} }\n')
  addFile('src/services/auth.ts', 'export function getToken() { return "token" }\n')
  addFile('src/orphan.ts', '// orphan file\n')

  return {
    files,
    totalFiles: files.size,
    totalLines: Array.from(files.values()).reduce((s, f) => s + f.lineCount, 0),
    isIndexing: false,
  }
}

// ────────── Mock FileNode tree ──────────

export function createMockFileTree(): FileNode[] {
  return [
    {
      name: 'src',
      path: 'src',
      type: 'directory',
      children: [
        { name: 'index.ts', path: 'src/index.ts', type: 'file' },
        { name: 'app.tsx', path: 'src/app.tsx', type: 'file' },
        { name: 'types.ts', path: 'src/types.ts', type: 'file' },
        { name: 'orphan.ts', path: 'src/orphan.ts', type: 'file' },
        {
          name: 'components',
          path: 'src/components',
          type: 'directory',
          children: [
            { name: 'Button.tsx', path: 'src/components/Button.tsx', type: 'file' },
          ],
        },
        {
          name: 'utils',
          path: 'src/utils',
          type: 'directory',
          children: [
            { name: 'helpers.ts', path: 'src/utils/helpers.ts', type: 'file' },
          ],
        },
        {
          name: 'services',
          path: 'src/services',
          type: 'directory',
          children: [
            { name: 'api.ts', path: 'src/services/api.ts', type: 'file' },
            { name: 'auth.ts', path: 'src/services/auth.ts', type: 'file' },
          ],
        },
      ],
    },
  ]
}
