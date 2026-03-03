// Diagram Data Generators — Universal, topology-driven
// Works for any language/framework by analyzing graph structure, not folder names.

import type { CodeIndex } from '@/lib/code/code-index'
import type { FileNode } from '@/types/repository'
import { analyzeCodebase, type FullAnalysis, type TopologyAnalysis } from '@/lib/code/import-parser'
import { flattenFiles } from '@/lib/code/code-index'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DiagramType =
  | 'summary'
  | 'topology'
  | 'imports'
  | 'classes'
  | 'entrypoints'
  | 'modules'
  | 'treemap'
  | 'externals'
  | 'focus'

export interface DiagramStats {
  totalNodes: number
  totalEdges: number
  circularDeps?: [string, string][]
  mostImported?: { path: string; count: number }
  mostDependent?: { path: string; count: number }
  avgDepsPerFile?: number
}

export interface MermaidDiagramResult {
  type: DiagramType
  title: string
  chart: string
  stats: DiagramStats
  nodePathMap: Map<string, string>
}

export interface TreemapNode {
  path: string
  name: string
  lines: number
  language?: string
  children?: TreemapNode[]
}

export interface TreemapDiagramResult {
  type: 'treemap'
  title: string
  data: TreemapNode[]
  stats: DiagramStats
}

export interface ProjectSummary {
  languages: { lang: string; files: number; lines: number; pct: number }[]
  topHubs: { path: string; importerCount: number }[]
  topConsumers: { path: string; depCount: number }[]
  circularDeps: [string, string][]
  orphanFiles: string[]
  entryPoints: string[]
  connectors: string[]
  clusterCount: number
  maxDepth: number
  totalFiles: number
  totalLines: number
  frameworkDetected: string | null
  primaryLanguage: string
  healthIssues: string[]
  folderBreakdown: { folder: string; files: number; lines: number; pct: number }[]
  externalDeps: { pkg: string; usedByCount: number }[]
}

export interface SummaryDiagramResult {
  type: 'summary'
  title: string
  data: ProjectSummary
  stats: DiagramStats
}

export type AnyDiagramResult = MermaidDiagramResult | TreemapDiagramResult | SummaryDiagramResult

// ---------------------------------------------------------------------------
// Available diagram detection
// ---------------------------------------------------------------------------

export interface AvailableDiagram {
  id: DiagramType
  label: string
  available: boolean
  reason?: string
}

export function getAvailableDiagrams(analysis: FullAnalysis): AvailableDiagram[] {
  const hasTypes = Array.from(analysis.files.values()).some(f => f.types.length > 0 || f.classes.length > 0)
  const hasExternals = analysis.graph.externalDeps.size > 0
  const hasComponents = Array.from(analysis.files.values()).some(f => f.jsxComponents.length > 0)
  // Modules tab: show if components exist (JSX) OR if hubs exist (reverse dep tree for any language)
  const hasModules = hasComponents || analysis.topology.hubs.length > 0

  return [
    { id: 'topology', label: 'Architecture', available: analysis.files.size > 0 },
    { id: 'imports', label: 'Imports', available: analysis.files.size > 0 },
    { id: 'classes', label: 'Types', available: hasTypes, reason: 'No types/interfaces/classes found' },
    { id: 'entrypoints', label: analysis.detectedFramework ? 'Routes' : 'Entry Points', available: true },
    { id: 'modules', label: hasComponents ? 'Components' : 'Modules', available: hasModules, reason: 'No module usage detected' },
    { id: 'treemap', label: 'Treemap', available: true },
    { id: 'externals', label: 'Packages', available: hasExternals, reason: 'No external dependencies found' },
  ]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeId(path: string): string {
  return path.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
}

function shortenPath(path: string): string {
  const parts = path.split('/')
  if (parts.length <= 2) return path
  return `${parts[0]}/.../${parts[parts.length - 1]}`
}

function getTopDir(path: string): string {
  return path.split('/')[0] || path
}

function computeCommonStats(analysis: FullAnalysis): Partial<DiagramStats> {
  const { graph } = analysis
  let mostImported: { path: string; count: number } | undefined
  let mostDependent: { path: string; count: number } | undefined
  let totalInternalEdges = 0

  for (const [path, deps] of graph.edges) {
    const count = deps.size
    totalInternalEdges += count
    if (!mostDependent || count > mostDependent.count) mostDependent = { path, count }
  }
  for (const [path, importers] of graph.reverseEdges) {
    const count = importers.size
    if (!mostImported || count > mostImported.count) mostImported = { path, count }
  }

  const fileCount = analysis.files.size
  return {
    totalEdges: totalInternalEdges,
    circularDeps: graph.circular.length > 0 ? graph.circular : undefined,
    mostImported,
    mostDependent,
    avgDepsPerFile: fileCount > 0 ? Math.round((totalInternalEdges / fileCount) * 10) / 10 : 0,
  }
}

// ---------------------------------------------------------------------------
// 1. Project Summary (not Mermaid — data object)
// ---------------------------------------------------------------------------

export function generateProjectSummary(analysis: FullAnalysis, codeIndex: CodeIndex): SummaryDiagramResult {
  const { graph, topology, files } = analysis
  const commonStats = computeCommonStats(analysis)

  // Language breakdown
  const langCounts = new Map<string, { files: number; lines: number }>()
  for (const [path, fileAnalysis] of files) {
    const lang = fileAnalysis.language || 'unknown'
    const indexed = codeIndex.files.get(path)
    const lines = indexed?.lineCount || 0
    const existing = langCounts.get(lang) || { files: 0, lines: 0 }
    langCounts.set(lang, { files: existing.files + 1, lines: existing.lines + lines })
  }
  const totalLines = codeIndex.totalLines
  const languages = Array.from(langCounts.entries())
    .map(([lang, { files, lines }]) => ({ lang, files, lines, pct: totalLines > 0 ? Math.round((lines / totalLines) * 1000) / 10 : 0 }))
    .sort((a, b) => b.lines - a.lines)

  // Top hubs (most imported)
  const topHubs = topology.hubs
    .map(path => ({ path, importerCount: graph.reverseEdges.get(path)?.size || 0 }))
    .sort((a, b) => b.importerCount - a.importerCount)
    .slice(0, 10)

  // Top consumers (most outgoing deps)
  const topConsumers = Array.from(graph.edges.entries())
    .map(([path, deps]) => ({ path, depCount: deps.size }))
    .sort((a, b) => b.depCount - a.depCount)
    .slice(0, 10)

  // Folder breakdown — adaptive depth
  // If top-level gives <3 meaningful folders, go one level deeper
  function computeFolderBreakdown(depth: number): Map<string, { files: number; lines: number }> {
    const counts = new Map<string, { files: number; lines: number }>()
    for (const [path] of files) {
      const parts = path.split('/')
      const folder = parts.length > depth ? parts.slice(0, depth).join('/') : '(root)'
      const indexed = codeIndex.files.get(path)
      const lines = indexed?.lineCount || 0
      const existing = counts.get(folder) || { files: 0, lines: 0 }
      counts.set(folder, { files: existing.files + 1, lines: existing.lines + lines })
    }
    return counts
  }

  let folderCounts = computeFolderBreakdown(1)
  // If top-level has very few folders (e.g. everything in src/), go deeper
  const meaningfulFolders = Array.from(folderCounts.entries()).filter(([, v]) => v.files > 1)
  if (meaningfulFolders.length < 3 && files.size > 10) {
    folderCounts = computeFolderBreakdown(2)
  }

  const folderBreakdown = Array.from(folderCounts.entries())
    .filter(([f]) => f !== '(root)' || folderCounts.size === 1)
    .map(([folder, { files: fCount, lines }]) => ({
      folder,
      files: fCount,
      lines,
      pct: totalLines > 0 ? Math.round((lines / totalLines) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 12)

  // External dependencies — packages used by most files
  const externalDeps = Array.from(graph.externalDeps.entries())
    .map(([pkg, importers]) => ({ pkg, usedByCount: importers.size }))
    .sort((a, b) => b.usedByCount - a.usedByCount)
    .slice(0, 25)

  // Health issues
  const healthIssues: string[] = []
  if (graph.circular.length > 0) healthIssues.push(`${graph.circular.length} circular dependency pair${graph.circular.length > 1 ? 's' : ''} detected`)
  if (topology.orphans.length > 5) healthIssues.push(`${topology.orphans.length} orphan files (never imported, never import) may be dead code`)
  if (topology.maxDepth > 8) healthIssues.push(`Deepest dependency chain is ${topology.maxDepth} levels — consider flattening`)
  const highCoupling = topHubs.filter(h => h.importerCount > Math.max(10, files.size * 0.3))
  if (highCoupling.length > 0) healthIssues.push(`${highCoupling.length} file${highCoupling.length > 1 ? 's' : ''} imported by >30% of the project (high coupling risk)`)
  if (topology.connectors.length > 0) healthIssues.push(`${topology.connectors.length} connector file${topology.connectors.length > 1 ? 's' : ''} — removing any would split the dependency graph`)

  const data: ProjectSummary = {
    languages,
    topHubs,
    topConsumers,
    circularDeps: graph.circular,
    orphanFiles: topology.orphans,
    entryPoints: topology.entryPoints,
    connectors: topology.connectors,
    clusterCount: topology.clusters.length,
    maxDepth: topology.maxDepth,
    totalFiles: files.size,
    totalLines,
    frameworkDetected: analysis.detectedFramework,
    primaryLanguage: analysis.primaryLanguage,
    healthIssues,
    folderBreakdown,
    externalDeps,
  }

  return {
    type: 'summary',
    title: 'Project Summary',
    data,
    stats: { totalNodes: files.size, ...commonStats } as DiagramStats,
  }
}

// ---------------------------------------------------------------------------
// 2. Topology Architecture (graph-role-based, not folder-name-based)
// ---------------------------------------------------------------------------

export function generateTopologyDiagram(analysis: FullAnalysis): MermaidDiagramResult {
  const { graph, topology, files } = analysis
  const nodePathMap = new Map<string, string>()
  const commonStats = computeCommonStats(analysis)

  // Classify every file by its topology role
  const roleMap = new Map<string, string>()
  for (const p of topology.entryPoints) roleMap.set(p, 'entry')
  for (const p of topology.hubs) { if (!roleMap.has(p)) roleMap.set(p, 'hub') }
  for (const p of topology.connectors) { if (!roleMap.has(p)) roleMap.set(p, 'connector') }
  for (const p of topology.leafNodes) { if (!roleMap.has(p)) roleMap.set(p, 'leaf') }
  for (const p of topology.orphans) roleMap.set(p, 'orphan')
  for (const p of files.keys()) { if (!roleMap.has(p)) roleMap.set(p, 'regular') }

  // Group by cluster for subgraphs
  const nodeCluster = new Map<string, number>()
  topology.clusters.forEach((cluster, idx) => {
    for (const p of cluster) nodeCluster.set(p, idx)
  })

  let chart = 'flowchart TD\n'

  // If very large (>80 files), aggregate by directory + role
  if (files.size > 80) {
    // Directory-level with role-based coloring
    const dirInfo = new Map<string, { count: number; roles: Set<string> }>()
    for (const [path] of files) {
      const dir = getTopDir(path)
      if (!dirInfo.has(dir)) dirInfo.set(dir, { count: 0, roles: new Set() })
      const info = dirInfo.get(dir)!
      info.count++
      info.roles.add(roleMap.get(path) || 'regular')
    }

    // Determine the dominant role for each directory
    const dirRole = new Map<string, string>()
    for (const [dir, info] of dirInfo) {
      // Priority: entry > hub > connector > regular > leaf > orphan
      const priority = ['entry', 'hub', 'connector', 'regular', 'leaf', 'orphan']
      let best = 'regular'
      for (const r of priority) {
        if (info.roles.has(r)) { best = r; break }
      }
      dirRole.set(dir, best)
    }

    for (const [dir, info] of dirInfo) {
      const id = sanitizeId(dir)
      const role = dirRole.get(dir)!
      const styleClass = `:::${role}Style`
      chart += `  ${id}["${dir}/ (${info.count} files)"]${styleClass}\n`
      nodePathMap.set(id, dir)
    }

    chart += '\n'

    // Directory-level edges
    const dirEdges = new Map<string, Map<string, number>>()
    for (const [from, deps] of graph.edges) {
      const fromDir = getTopDir(from)
      for (const to of deps) {
        const toDir = getTopDir(to)
        if (fromDir === toDir) continue
        if (!dirEdges.has(fromDir)) dirEdges.set(fromDir, new Map())
        const existing = dirEdges.get(fromDir)!.get(toDir) || 0
        dirEdges.get(fromDir)!.set(toDir, existing + 1)
      }
    }

    for (const [fromDir, targets] of dirEdges) {
      for (const [toDir, count] of targets) {
        chart += `  ${sanitizeId(fromDir)} -->|"${count}"| ${sanitizeId(toDir)}\n`
      }
    }

    chart += '\n'
    chart += '  classDef entryStyle fill:#22c55e,stroke:#4ade80,color:#000\n'
    chart += '  classDef hubStyle fill:#f59e0b,stroke:#fbbf24,color:#000\n'
    chart += '  classDef connectorStyle fill:#a855f7,stroke:#c084fc,color:#fff\n'
    chart += '  classDef leafStyle fill:#6b7280,stroke:#9ca3af,color:#fff\n'
    chart += '  classDef orphanStyle fill:#374151,stroke:#4b5563,color:#9ca3af\n'
    chart += '  classDef regularStyle fill:#3b82f6,stroke:#60a5fa,color:#fff\n'

    return {
      type: 'topology',
      title: `Architecture (${dirInfo.size} directories, ${files.size} files)`,
      chart,
      stats: { totalNodes: dirInfo.size, ...commonStats } as DiagramStats,
      nodePathMap,
    }
  }

  // File-level view with cluster subgraphs and role-based coloring
  const clusterFiles = new Map<number, string[]>()
  const unclusteredFiles: string[] = []

  for (const [path] of files) {
    const ci = nodeCluster.get(path)
    if (ci !== undefined) {
      if (!clusterFiles.has(ci)) clusterFiles.set(ci, [])
      clusterFiles.get(ci)!.push(path)
    } else {
      unclusteredFiles.push(path)
    }
  }

  // Render clustered files in subgraphs
  for (const [ci, paths] of clusterFiles) {
    if (paths.length < 2) {
      // Don't subgraph singletons
      for (const p of paths) {
        const id = sanitizeId(p)
        const name = p.split('/').pop() || p
        const role = roleMap.get(p) || 'regular'
        chart += `  ${id}["${name}"]:::${role}Style\n`
        nodePathMap.set(id, p)
      }
      continue
    }
    chart += `  subgraph cluster_${ci}["Cluster ${ci + 1} (${paths.length} files)"]\n`
    for (const p of paths) {
      const id = sanitizeId(p)
      const name = p.split('/').pop() || p
      const role = roleMap.get(p) || 'regular'
      chart += `    ${id}["${name}"]:::${role}Style\n`
      nodePathMap.set(id, p)
    }
    chart += '  end\n'
  }

  // Unclustered files
  for (const p of unclusteredFiles) {
    const id = sanitizeId(p)
    const name = p.split('/').pop() || p
    const role = roleMap.get(p) || 'orphan'
    chart += `  ${id}["${name}"]:::${role}Style\n`
    nodePathMap.set(id, p)
  }

  chart += '\n'

  // Edges
  const circularSet = new Set(graph.circular.map(([a, b]) => `${a}|${b}`))
  for (const [from, deps] of graph.edges) {
    const fromId = sanitizeId(from)
    for (const to of deps) {
      const toId = sanitizeId(to)
      const isCircular = circularSet.has(`${from}|${to}`) || circularSet.has(`${to}|${from}`)
      if (isCircular) chart += `  ${fromId} -. "circular" .-> ${toId}\n`
      else chart += `  ${fromId} --> ${toId}\n`
    }
  }

  chart += '\n'
  chart += '  classDef entryStyle fill:#22c55e,stroke:#4ade80,color:#000\n'
  chart += '  classDef hubStyle fill:#f59e0b,stroke:#fbbf24,color:#000\n'
  chart += '  classDef connectorStyle fill:#a855f7,stroke:#c084fc,color:#fff\n'
  chart += '  classDef leafStyle fill:#6b7280,stroke:#9ca3af,color:#fff\n'
  chart += '  classDef orphanStyle fill:#374151,stroke:#4b5563,color:#9ca3af\n'
  chart += '  classDef regularStyle fill:#3b82f6,stroke:#60a5fa,color:#fff\n'

  return {
    type: 'topology',
    title: `Architecture — Topology (${files.size} files, ${topology.clusters.length} clusters)`,
    chart,
    stats: { totalNodes: files.size, ...commonStats } as DiagramStats,
    nodePathMap,
  }
}

// ---------------------------------------------------------------------------
// 3. Import Graph (unchanged logic, minor cleanup)
// ---------------------------------------------------------------------------

export function generateImportGraph(analysis: FullAnalysis): MermaidDiagramResult {
  const { graph, files } = analysis
  const nodePathMap = new Map<string, string>()
  const commonStats = computeCommonStats(analysis)

  const fileCount = files.size
  const collapsed = fileCount > 50

  let chart = 'flowchart LR\n'

  if (collapsed) {
    const dirEdges = new Map<string, Map<string, number>>()
    const dirFiles = new Map<string, number>()
    for (const [path] of files) {
      const dir = getTopDir(path)
      dirFiles.set(dir, (dirFiles.get(dir) || 0) + 1)
    }
    for (const [from, deps] of graph.edges) {
      const fromDir = getTopDir(from)
      for (const to of deps) {
        const toDir = getTopDir(to)
        if (fromDir === toDir) continue
        if (!dirEdges.has(fromDir)) dirEdges.set(fromDir, new Map())
        const existing = dirEdges.get(fromDir)!.get(toDir) || 0
        dirEdges.get(fromDir)!.set(toDir, existing + 1)
      }
    }
    for (const [dir, count] of dirFiles) {
      const id = sanitizeId(dir)
      chart += `  ${id}["${dir}/ (${count} files)"]\n`
      nodePathMap.set(id, dir)
    }
    chart += '\n'
    for (const [fromDir, targets] of dirEdges) {
      for (const [toDir, count] of targets) {
        chart += `  ${sanitizeId(fromDir)} -->|"${count}"| ${sanitizeId(toDir)}\n`
      }
    }
    return {
      type: 'imports',
      title: `Import Graph (${dirFiles.size} dirs, collapsed from ${fileCount} files)`,
      chart,
      stats: { totalNodes: dirFiles.size, ...commonStats } as DiagramStats,
      nodePathMap,
    }
  }

  // File-level with subgraphs by directory
  const byDir = new Map<string, string[]>()
  for (const [path] of files) {
    const dir = getTopDir(path)
    if (!byDir.has(dir)) byDir.set(dir, [])
    byDir.get(dir)!.push(path)
  }
  for (const [dir, paths] of byDir) {
    chart += `  subgraph ${sanitizeId(dir)}["${dir}/"]\n`
    for (const path of paths) {
      const id = sanitizeId(path)
      chart += `    ${id}["${path.split('/').pop() || path}"]\n`
      nodePathMap.set(id, path)
    }
    chart += '  end\n'
  }
  chart += '\n'
  const circularSet = new Set(graph.circular.map(([a, b]) => `${a}|${b}`))
  for (const [from, deps] of graph.edges) {
    for (const to of deps) {
      const isCircular = circularSet.has(`${from}|${to}`) || circularSet.has(`${to}|${from}`)
      if (isCircular) chart += `  ${sanitizeId(from)} -. "circular" .-> ${sanitizeId(to)}\n`
      else chart += `  ${sanitizeId(from)} --> ${sanitizeId(to)}\n`
    }
  }

  return {
    type: 'imports',
    title: `Import Graph (${fileCount} files)`,
    chart,
    stats: { totalNodes: fileCount, ...commonStats } as DiagramStats,
    nodePathMap,
  }
}

// ---------------------------------------------------------------------------
// 4. Class / Type Diagram (works with Go structs, Rust structs/enums, Python classes)
// ---------------------------------------------------------------------------

export function generateClassDiagram(analysis: FullAnalysis): MermaidDiagramResult {
  const nodePathMap = new Map<string, string>()

  // Sanitize a name so it's valid as a Mermaid class identifier
  const sanitizeName = (n: string) => n.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'Unknown'
  // Sanitize property/method text for display inside a class block
  const sanitizeProp = (p: string) => p.replace(/[{}()<>|~"`;:*#]/g, ' ').replace(/\s+/g, ' ').trim()

  // First pass: collect ALL types/classes and score them by importance
  type TypeEntry = {
    safeName: string
    path: string
    kind: 'interface' | 'enum' | 'type' | 'class'
    properties: string[]
    methods?: string[]
    extends?: string[]
    implements?: string[]
    exported: boolean
    hasRelationship: boolean // has extends/implements
    propCount: number
  }
  const allTypes: TypeEntry[] = []
  const seenNames = new Set<string>()

  for (const [path, fileAnalysis] of analysis.files) {
    for (const t of fileAnalysis.types) {
      if (!t.exported && t.properties.length === 0) continue
      const safeName = sanitizeName(t.name)
      if (seenNames.has(safeName)) continue
      seenNames.add(safeName)
      const hasRel = !!(t.extends && t.extends.length > 0)
      allTypes.push({
        safeName, path, kind: t.kind as 'interface' | 'enum' | 'type',
        properties: t.properties, exported: t.exported, hasRelationship: hasRel,
        propCount: t.properties.length, extends: t.extends,
      })
    }
    for (const cls of fileAnalysis.classes) {
      const safeName = sanitizeName(cls.name)
      if (seenNames.has(safeName)) continue
      seenNames.add(safeName)
      const hasRel = !!(cls.extends || (cls.implements && cls.implements.length > 0))
      allTypes.push({
        safeName, path, kind: 'class',
        properties: cls.properties, methods: cls.methods, exported: true,
        hasRelationship: hasRel, propCount: cls.properties.length + cls.methods.length,
        extends: cls.extends ? [cls.extends] : undefined, implements: cls.implements,
      })
    }
  }

  const totalFound = allTypes.length

  // Score and sort: prioritize types with relationships, then classes, then exported with many props
  allTypes.sort((a, b) => {
    // Types with inheritance/implementation first
    if (a.hasRelationship !== b.hasRelationship) return a.hasRelationship ? -1 : 1
    // Classes before interfaces before types
    const kindOrder = { class: 0, interface: 1, enum: 2, type: 3 }
    if (kindOrder[a.kind] !== kindOrder[b.kind]) return kindOrder[a.kind] - kindOrder[b.kind]
    // More properties = more important
    return b.propCount - a.propCount
  })

  // Limit to 40 types max to prevent Mermaid from creating an impossibly wide diagram
  const MAX_TYPES = 40
  const typesToRender = allTypes.slice(0, MAX_TYPES)

  // Also include any parent types referenced by extends/implements even if they weren't in the top N
  const renderedNames = new Set(typesToRender.map(t => t.safeName))
  for (const t of typesToRender) {
    if (t.extends) for (const ext of t.extends) {
      const safeExt = sanitizeName(ext.trim())
      if (!renderedNames.has(safeExt)) {
        const parent = allTypes.find(a => a.safeName === safeExt)
        if (parent) { typesToRender.push(parent); renderedNames.add(safeExt) }
      }
    }
    if (t.implements) for (const impl of t.implements) {
      const safeImpl = sanitizeName(impl.trim())
      if (!renderedNames.has(safeImpl)) {
        const parent = allTypes.find(a => a.safeName === safeImpl)
        if (parent) { typesToRender.push(parent); renderedNames.add(safeImpl) }
      }
    }
  }

  let chart = 'classDiagram\n'
  let nodeCount = 0
  let edgeCount = 0

  for (const t of typesToRender) {
    nodePathMap.set(t.safeName, t.path)
    nodeCount++
    if (t.kind === 'interface') {
      chart += `  class ${t.safeName} {\n    <<interface>>\n`
      for (const prop of t.properties.slice(0, 8)) {
        const s = sanitizeProp(prop)
        if (s) chart += `    +${s}\n`
      }
      chart += `  }\n`
    } else if (t.kind === 'enum') {
      chart += `  class ${t.safeName} {\n    <<enumeration>>\n`
      for (const prop of t.properties.slice(0, 8)) {
        const s = sanitizeProp(prop)
        if (s) chart += `    ${s}\n`
      }
      chart += `  }\n`
    } else if (t.kind === 'class') {
      chart += `  class ${t.safeName} {\n`
      for (const prop of t.properties.slice(0, 6)) {
        const s = sanitizeProp(prop)
        if (s) chart += `    +${s}\n`
      }
      for (const method of (t.methods || []).slice(0, 6)) {
        const s = sanitizeProp(method)
        if (s) chart += `    +${s}\n`
      }
      chart += `  }\n`
    } else {
      chart += `  class ${t.safeName} {\n    <<type>>\n`
      for (const prop of t.properties.slice(0, 5)) {
        const s = sanitizeProp(prop)
        if (s) chart += `    ${s}\n`
      }
      chart += `  }\n`
    }
    // Relationships
    if (t.extends) for (const ext of t.extends) {
      const safeExt = sanitizeName(ext.trim())
      if (safeExt && safeExt !== t.safeName && renderedNames.has(safeExt)) {
        chart += `  ${safeExt} <|-- ${t.safeName}\n`
        edgeCount++
      }
    }
    if (t.implements) for (const impl of t.implements) {
      const safeImpl = sanitizeName(impl.trim())
      if (safeImpl && renderedNames.has(safeImpl)) {
        chart += `  ${safeImpl} <|.. ${t.safeName}\n`
        edgeCount++
      }
    }
  }

  if (nodeCount === 0) chart = 'flowchart TD\n  empty["No classes, interfaces, or types found"]\n'

  const truncated = totalFound > MAX_TYPES ? ` (showing top ${nodeCount} of ${totalFound})` : ''

  return {
    type: 'classes',
    title: `Type & Class Diagram (${totalFound} types${truncated})`,
    chart,
    stats: { totalNodes: nodeCount, totalEdges: edgeCount },
    nodePathMap,
  }
}

// ---------------------------------------------------------------------------
// 5. Entry Points / Routes (universal)
// ---------------------------------------------------------------------------

export function generateEntryPoints(analysis: FullAnalysis, codeIndex: CodeIndex, files: FileNode[]): MermaidDiagramResult {
  const nodePathMap = new Map<string, string>()
  const { topology, detectedFramework, graph } = analysis
  const allFiles = flattenFiles(files)

  let chart = 'flowchart TD\n'
  let nodeCount = 0

  // If Next.js or Nuxt, try framework-specific route detection first
  if (detectedFramework === 'Next.js' || detectedFramework === 'Nuxt') {
    const routeFiles = allFiles.filter(f => {
      const lower = f.path.toLowerCase()
      return (
        lower.match(/app\/.*\/(page|route|layout|loading|error|not-found|template)\.(ts|tsx|js|jsx)$/) ||
        lower.match(/app\/(page|route|layout|loading|error|not-found|template)\.(ts|tsx|js|jsx)$/) ||
        lower.match(/pages\/.*\.(ts|tsx|js|jsx)$/) ||
        lower.match(/middleware\.(ts|tsx|js|jsx)$/)
      )
    })

    if (routeFiles.length > 0) {
      const routeMap = new Map<string, { type: string; path: string; fullPath: string }[]>()
      for (const file of routeFiles) {
        const parts = file.path.split('/')
        const fileName = parts[parts.length - 1]
        const fileType = fileName.replace(/\.(ts|tsx|js|jsx)$/, '')
        let routePath: string
        const appIdx = parts.indexOf('app')
        if (appIdx >= 0) {
          routePath = '/' + parts.slice(appIdx + 1, -1).join('/')
          if (routePath === '/') routePath = '/'
        } else if (parts.indexOf('pages') >= 0) {
          const pIdx = parts.indexOf('pages')
          routePath = '/' + parts.slice(pIdx + 1, -1).join('/')
          if (routePath === '/') routePath = '/'
          if (fileType !== 'index' && fileType !== '_app' && fileType !== '_document') {
            routePath = routePath === '/' ? `/${fileType}` : `${routePath}/${fileType}`
          }
        } else {
          routePath = '/' + file.name
        }
        if (!routeMap.has(routePath)) routeMap.set(routePath, [])
        routeMap.get(routePath)!.push({ type: fileType, path: file.path, fullPath: routePath })
      }

      const styleMap: Record<string, string> = {
        page: ':::pageStyle', route: ':::apiStyle', layout: ':::layoutStyle',
        loading: ':::loadingStyle', error: ':::errorStyle', 'not-found': ':::errorStyle',
        template: ':::layoutStyle', middleware: ':::middlewareStyle',
      }

      const sortedRoutes = Array.from(routeMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      const middlewareFile = allFiles.find(f => /^middleware\.(ts|tsx|js|jsx)$/.test(f.name))
      if (middlewareFile) {
        const id = sanitizeId('middleware')
        chart += `  ${id}["Middleware"]:::middlewareStyle\n`
        nodePathMap.set(id, middlewareFile.path)
        nodeCount++
      }

      const rootId = sanitizeId('root')
      chart += `  ${rootId}["/ (root)"]:::layoutStyle\n`
      nodePathMap.set(rootId, 'app')
      nodeCount++
      if (middlewareFile) chart += `  ${sanitizeId('middleware')} --> ${rootId}\n`

      for (const [routePath, rfs] of sortedRoutes) {
        for (const rf of rfs) {
          const id = sanitizeId(rf.path)
          const label = rf.type === 'page' || rf.type === 'route' ? routePath || '/' : `${routePath || '/'}[${rf.type}]`
          chart += `  ${id}["${label}"]${styleMap[rf.type] || ''}\n`
          nodePathMap.set(id, rf.path)
          nodeCount++
          const parentPath = routePath === '/' ? null : routePath.split('/').slice(0, -1).join('/') || '/'
          if (parentPath) {
            const parentFiles = routeMap.get(parentPath)
            if (parentFiles) {
              const parentLayout = parentFiles.find(f => f.type === 'layout') || parentFiles[0]
              if (parentLayout) chart += `  ${sanitizeId(parentLayout.path)} --> ${id}\n`
            } else chart += `  ${rootId} --> ${id}\n`
          } else chart += `  ${rootId} --> ${id}\n`
        }
      }

      chart += '\n  classDef pageStyle fill:#3b82f6,stroke:#60a5fa,color:#fff\n'
      chart += '  classDef apiStyle fill:#f59e0b,stroke:#fbbf24,color:#000\n'
      chart += '  classDef layoutStyle fill:#8b5cf6,stroke:#a78bfa,color:#fff\n'
      chart += '  classDef loadingStyle fill:#6b7280,stroke:#9ca3af,color:#fff\n'
      chart += '  classDef errorStyle fill:#ef4444,stroke:#f87171,color:#fff\n'
      chart += '  classDef middlewareStyle fill:#10b981,stroke:#34d399,color:#fff\n'

      return {
        type: 'entrypoints',
        title: `Route Tree (${nodeCount} routes)`,
        chart,
        stats: { totalNodes: nodeCount, totalEdges: 0 },
        nodePathMap,
      }
    }
  }

  // Express/Fastify route detection
  if (detectedFramework === 'Express' || detectedFramework === 'Fastify') {
    const routePattern = /\.(get|post|put|delete|patch|all|use)\s*\(\s*['"](\/[^'"]*)['"]/g
    const routeEntries: { method: string; path: string; file: string }[] = []

    for (const [path, fileAnalysis] of analysis.files) {
      const indexed = codeIndex.files.get(path)
      if (!indexed) continue
      let m: RegExpExecArray | null
      routePattern.lastIndex = 0
      while ((m = routePattern.exec(indexed.content)) !== null) {
        routeEntries.push({ method: m[1].toUpperCase(), path: m[2], file: path })
      }
    }

    if (routeEntries.length > 0) {
      chart += `  server["${detectedFramework} Server"]:::entryStyle\n`
      nodeCount++
      for (const entry of routeEntries) {
        const id = sanitizeId(`${entry.method}_${entry.path}_${entry.file}`)
        chart += `  ${id}["${entry.method} ${entry.path}"]:::routeStyle\n`
        chart += `  server --> ${id}\n`
        nodePathMap.set(id, entry.file)
        nodeCount++
      }
      chart += '\n  classDef entryStyle fill:#22c55e,stroke:#4ade80,color:#000\n'
      chart += '  classDef routeStyle fill:#3b82f6,stroke:#60a5fa,color:#fff\n'

      return {
        type: 'entrypoints',
        title: `${detectedFramework} Routes (${routeEntries.length} routes)`,
        chart,
        stats: { totalNodes: nodeCount, totalEdges: 0 },
        nodePathMap,
      }
    }
  }

  // Flask/FastAPI route detection
  if (detectedFramework === 'Flask' || detectedFramework === 'FastAPI') {
    const pyRoutePattern = /@(?:app|router|bp|blueprint)\.(get|post|put|delete|patch|route)\s*\(\s*['"](\/[^'"]*)['"]/g
    const routeEntries: { method: string; path: string; file: string }[] = []

    for (const [path] of analysis.files) {
      const indexed = codeIndex.files.get(path)
      if (!indexed) continue
      let m: RegExpExecArray | null
      pyRoutePattern.lastIndex = 0
      while ((m = pyRoutePattern.exec(indexed.content)) !== null) {
        routeEntries.push({ method: m[1].toUpperCase(), path: m[2], file: path })
      }
    }

    if (routeEntries.length > 0) {
      chart += `  server["${detectedFramework} App"]:::entryStyle\n`
      nodeCount++
      for (const entry of routeEntries) {
        const id = sanitizeId(`${entry.method}_${entry.path}_${entry.file}`)
        chart += `  ${id}["${entry.method} ${entry.path}"]:::routeStyle\n`
        chart += `  server --> ${id}\n`
        nodePathMap.set(id, entry.file)
        nodeCount++
      }
      chart += '\n  classDef entryStyle fill:#22c55e,stroke:#4ade80,color:#000\n'
      chart += '  classDef routeStyle fill:#3b82f6,stroke:#60a5fa,color:#fff\n'

      return {
        type: 'entrypoints',
        title: `${detectedFramework} Routes (${routeEntries.length} endpoints)`,
        chart,
        stats: { totalNodes: nodeCount, totalEdges: 0 },
        nodePathMap,
      }
    }
  }

  // Generic fallback: use topology entry points
  if (topology.entryPoints.length === 0) {
    chart += '  empty["No entry points detected"]\n'
    return {
      type: 'entrypoints',
      title: 'Entry Points',
      chart,
      stats: { totalNodes: 0, totalEdges: 0 },
      nodePathMap,
    }
  }

  // Show entry points and their first-level dependencies.
  // Use directory context in labels so multiple "index.ts" files are distinguishable.
  const contextLabel = (p: string): string => {
    const parts = p.split('/')
    if (parts.length <= 1) return p
    // Show parent/filename, e.g. "handlers/index.ts"
    return parts.slice(-2).join('/')
  }

  for (const entry of topology.entryPoints) {
    const id = sanitizeId(entry)
    const name = contextLabel(entry)
    const deps = graph.edges.get(entry)
    chart += `  ${id}["${name}"]:::entryStyle\n`
    nodePathMap.set(id, entry)
    nodeCount++

    if (deps) {
      for (const dep of deps) {
        const depId = sanitizeId(dep)
        const depName = contextLabel(dep)
        if (!nodePathMap.has(depId)) {
          chart += `  ${depId}["${depName}"]:::depStyle\n`
          nodePathMap.set(depId, dep)
          nodeCount++
        }
        chart += `  ${id} --> ${depId}\n`
      }
    }
  }

  chart += '\n  classDef entryStyle fill:#22c55e,stroke:#4ade80,color:#000\n'
  chart += '  classDef depStyle fill:#3b82f6,stroke:#60a5fa,color:#fff\n'

  return {
    type: 'entrypoints',
    title: `Entry Points (${topology.entryPoints.length} found)`,
    chart,
    stats: { totalNodes: nodeCount, totalEdges: 0 },
    nodePathMap,
  }
}

// ---------------------------------------------------------------------------
// 6. Module Usage Tree (React components or reverse-dep tree for any lang)
// ---------------------------------------------------------------------------

export function generateModuleUsageTree(analysis: FullAnalysis): MermaidDiagramResult {
  const { graph, topology, files } = analysis
  const nodePathMap = new Map<string, string>()

  // Try JSX component tree first (React/Preact/Solid)
  const componentToFile = new Map<string, string>()
  for (const [path, fileAnalysis] of files) {
    for (const exp of fileAnalysis.exports) {
      if (exp.kind === 'component' || (/^[A-Z]/.test(exp.name) && (exp.kind === 'function' || exp.kind === 'variable'))) {
        componentToFile.set(exp.name, path)
      }
    }
  }

  const jsxEdges = new Map<string, Set<string>>()
  for (const [path, fileAnalysis] of files) {
    for (const jsxComp of fileAnalysis.jsxComponents) {
      const targetFile = componentToFile.get(jsxComp)
      if (targetFile && targetFile !== path) {
        if (!jsxEdges.has(path)) jsxEdges.set(path, new Set())
        jsxEdges.get(path)!.add(targetFile)
      }
    }
  }

  const useJsx = jsxEdges.size > 0
  const edges = useJsx ? jsxEdges : graph.reverseEdges

  let chart = 'flowchart TD\n'
  let nodeCount = 0

  if (useJsx) {
    // JSX component rendering tree
    const allRendered = new Set<string>()
    for (const targets of jsxEdges.values()) for (const t of targets) allRendered.add(t)
    const allRenderers = new Set(jsxEdges.keys())
    const roots = new Set<string>()
    for (const renderer of allRenderers) {
      if (!allRendered.has(renderer)) roots.add(renderer)
    }
    if (roots.size === 0 && allRenderers.size > 0) roots.add(allRenderers.values().next().value!)

    const participatingFiles = new Set<string>([...allRenderers, ...allRendered])
    if (participatingFiles.size === 0) {
      chart += '  empty["No component render tree detected"]\n'
      return { type: 'modules', title: 'Component Tree', chart, stats: { totalNodes: 0, totalEdges: 0 }, nodePathMap }
    }

    const byDir = new Map<string, string[]>()
    for (const path of participatingFiles) {
      const dir = getTopDir(path)
      if (!byDir.has(dir)) byDir.set(dir, [])
      byDir.get(dir)!.push(path)
    }

    for (const [dir, paths] of byDir) {
      chart += `  subgraph ${sanitizeId(dir + '_comp')}["${dir}/"]\n`
      for (const path of paths) {
        const id = sanitizeId(path)
        const fa = files.get(path)
        const compNames = fa?.exports.filter(e => e.kind === 'component' || /^[A-Z]/.test(e.name)).map(e => e.name).slice(0, 3) || []
        const label = compNames.length > 0 ? compNames.join(', ') : path.split('/').pop() || path
        chart += `    ${id}["${label}"]\n`
        nodePathMap.set(id, path)
        nodeCount++
      }
      chart += '  end\n'
    }

    chart += '\n'
    let edgeCount = 0
    for (const [from, targets] of jsxEdges) {
      for (const to of targets) {
        chart += `  ${sanitizeId(from)} --> ${sanitizeId(to)}\n`
        edgeCount++
      }
    }

    return { type: 'modules', title: `Component Tree (${nodeCount} components)`, chart, stats: { totalNodes: nodeCount, totalEdges: edgeCount }, nodePathMap }
  }

  // Non-JSX: show reverse-dependency tree for top hubs
  if (topology.hubs.length === 0) {
    chart += '  empty["No module dependency tree to show"]\n'
    return { type: 'modules', title: 'Module Usage', chart, stats: { totalNodes: 0, totalEdges: 0 }, nodePathMap }
  }

  // Show top hubs and their importers
  const hubsToShow = topology.hubs.slice(0, 8)
  for (const hub of hubsToShow) {
    const hubId = sanitizeId(hub)
    const hubName = hub.split('/').pop() || hub
    chart += `  ${hubId}["${hubName}"]:::hubStyle\n`
    nodePathMap.set(hubId, hub)
    nodeCount++

    const importers = graph.reverseEdges.get(hub)
    if (importers) {
      for (const importer of importers) {
        const impId = sanitizeId(importer)
        if (!nodePathMap.has(impId)) {
          chart += `  ${impId}["${importer.split('/').pop() || importer}"]\n`
          nodePathMap.set(impId, importer)
          nodeCount++
        }
        chart += `  ${impId} --> ${hubId}\n`
      }
    }
  }

  chart += '\n  classDef hubStyle fill:#f59e0b,stroke:#fbbf24,color:#000\n'

  return {
    type: 'modules',
    title: `Module Usage (${hubsToShow.length} hubs)`,
    chart,
    stats: { totalNodes: nodeCount, totalEdges: 0 },
    nodePathMap,
  }
}

// ---------------------------------------------------------------------------
// 7. Treemap
// ---------------------------------------------------------------------------

export function generateTreemap(codeIndex: CodeIndex, files: FileNode[]): TreemapDiagramResult {
  function buildNode(node: FileNode): TreemapNode | null {
    if (node.type === 'file') {
      const indexed = codeIndex.files.get(node.path)
      const lines = indexed?.lineCount || 0
      if (lines === 0) return null
      return { path: node.path, name: node.name, lines, language: indexed?.language }
    }
    if (!node.children) return null
    const children = node.children.map(c => buildNode(c)).filter((c): c is TreemapNode => c !== null)
    if (children.length === 0) return null
    return { path: node.path, name: node.name, lines: children.reduce((s, c) => s + c.lines, 0), children }
  }

  const data = files.map(f => buildNode(f)).filter((n): n is TreemapNode => n !== null)
  let largest: { path: string; count: number } | undefined
  for (const [path, file] of codeIndex.files) {
    if (!largest || file.lineCount > largest.count) largest = { path, count: file.lineCount }
  }

  return {
    type: 'treemap',
    title: `File Size Treemap (${codeIndex.totalFiles} files, ${codeIndex.totalLines.toLocaleString()} lines)`,
    data,
    stats: { totalNodes: codeIndex.totalFiles, totalEdges: 0, mostImported: largest },
  }
}

// ---------------------------------------------------------------------------
// 8. External Dependencies (language-aware)
// ---------------------------------------------------------------------------

const JS_CATEGORIES: Record<string, string[]> = {
  'UI Framework': ['react', 'react-dom', 'next', 'vue', 'svelte', 'angular', 'solid-js', 'preact', 'nuxt'],
  'Styling': ['tailwindcss', 'styled-components', '@emotion', 'sass', 'postcss', 'clsx', 'class-variance-authority', 'tailwind-merge'],
  'UI Components': ['@radix-ui', '@headlessui', '@shadcn', 'lucide-react', '@heroicons', 'framer-motion', 'recharts', 'mermaid'],
  'State & Data': ['zustand', 'redux', '@tanstack', 'swr', 'axios', 'graphql', '@apollo', 'immer', 'jotai'],
  'Auth & Backend': ['@supabase', '@prisma', 'drizzle-orm', '@auth', 'next-auth', 'firebase', 'mongoose', 'pg', 'bcrypt', 'jsonwebtoken'],
  'AI & ML': ['ai', '@ai-sdk', 'openai', '@anthropic-ai', 'langchain'],
  'Validation': ['zod', 'yup', 'joi', 'ajv', 'valibot'],
  'Tooling': ['typescript', 'eslint', 'prettier', 'vitest', 'jest', '@testing-library', 'vite', 'esbuild'],
}

const PYTHON_CATEGORIES: Record<string, string[]> = {
  'Web Framework': ['flask', 'django', 'fastapi', 'starlette', 'tornado', 'aiohttp'],
  'Data Science': ['numpy', 'pandas', 'scipy', 'matplotlib', 'seaborn', 'plotly'],
  'AI & ML': ['torch', 'tensorflow', 'transformers', 'sklearn', 'openai', 'langchain'],
  'Database': ['sqlalchemy', 'psycopg2', 'pymongo', 'redis', 'alembic'],
  'HTTP & API': ['requests', 'httpx', 'pydantic', 'marshmallow'],
  'Testing': ['pytest', 'unittest', 'mock', 'coverage'],
  'Utilities': ['click', 'typer', 'rich', 'tqdm', 'python-dotenv'],
}

const GO_CATEGORIES: Record<string, string[]> = {
  'Web': ['net/http', 'github.com/gin-gonic', 'github.com/gorilla', 'github.com/labstack/echo', 'github.com/gofiber'],
  'Database': ['database/sql', 'github.com/lib/pq', 'gorm.io', 'go.mongodb.org'],
  'Std Library': ['fmt', 'os', 'io', 'strings', 'strconv', 'encoding', 'context', 'sync', 'time', 'log', 'errors', 'path'],
  'Testing': ['testing', 'github.com/stretchr/testify'],
}

function getCategoryMap(primaryLang: string): Record<string, string[]> {
  switch (primaryLang) {
    case 'python': return PYTHON_CATEGORIES
    case 'go': return GO_CATEGORIES
    default: return JS_CATEGORIES
  }
}

export function generateExternalDeps(analysis: FullAnalysis): MermaidDiagramResult {
  const { graph } = analysis
  const nodePathMap = new Map<string, string>()
  const categoryMap = getCategoryMap(analysis.primaryLanguage)

  const pkgToCategory = new Map<string, string>()
  for (const [cat, pkgs] of Object.entries(categoryMap)) {
    for (const pkg of pkgs) pkgToCategory.set(pkg, cat)
  }
  function getCategory(pkg: string): string {
    if (pkgToCategory.has(pkg)) return pkgToCategory.get(pkg)!
    for (const [prefix, cat] of pkgToCategory) {
      if (pkg.startsWith(prefix)) return cat
    }
    return 'Other'
  }

  let chart = 'flowchart LR\n'
  let nodeCount = 0
  const byCat = new Map<string, { pkg: string; importers: number }[]>()
  for (const [pkg, importers] of graph.externalDeps) {
    const cat = getCategory(pkg)
    if (!byCat.has(cat)) byCat.set(cat, [])
    byCat.get(cat)!.push({ pkg, importers: importers.size })
  }

  if (byCat.size === 0) {
    chart += '  empty["No external dependencies detected"]\n'
    return { type: 'externals', title: 'External Dependencies', chart, stats: { totalNodes: 0, totalEdges: 0 }, nodePathMap }
  }

  chart += `  project["Project (${analysis.files.size} files)"]\n`
  const sortedCats = Array.from(byCat.entries()).sort((a, b) => b[1].reduce((s, p) => s + p.importers, 0) - a[1].reduce((s, p) => s + p.importers, 0))

  for (const [cat, pkgs] of sortedCats) {
    const catId = sanitizeId(cat)
    chart += `  subgraph ${catId}["${cat}"]\n`
    pkgs.sort((a, b) => b.importers - a.importers)
    for (const { pkg, importers } of pkgs.slice(0, 15)) {
      const pkgId = sanitizeId(pkg)
      chart += `    ${pkgId}["${pkg} (${importers})"]\n`
      nodePathMap.set(pkgId, pkg)
      nodeCount++
    }
    if (pkgs.length > 15) chart += `    ${sanitizeId(`${cat}_more`)}["... +${pkgs.length - 15} more"]\n`
    chart += '  end\n'
    const totalImports = pkgs.reduce((s, p) => s + p.importers, 0)
    chart += `  project -->|"${totalImports} imports"| ${catId}\n`
  }

  return {
    type: 'externals',
    title: `External Dependencies (${graph.externalDeps.size} packages)`,
    chart,
    stats: { totalNodes: nodeCount, totalEdges: graph.externalDeps.size },
    nodePathMap,
  }
}

// ---------------------------------------------------------------------------
// 9. Focus Mode (file neighborhood)
// ---------------------------------------------------------------------------

export function generateFocusDiagram(analysis: FullAnalysis, targetPath: string, hops: 1 | 2 = 1): MermaidDiagramResult {
  const { graph } = analysis
  const nodePathMap = new Map<string, string>()

  let chart = 'flowchart LR\n'

  // Collect neighborhood
  const neighborhood = new Set<string>([targetPath])

  function addHop(nodes: Set<string>) {
    const newNodes = new Set<string>()
    for (const n of nodes) {
      const deps = graph.edges.get(n)
      if (deps) for (const d of deps) newNodes.add(d)
      const importers = graph.reverseEdges.get(n)
      if (importers) for (const i of importers) newNodes.add(i)
    }
    for (const n of newNodes) nodes.add(n)
    return newNodes
  }

  const firstHop = addHop(neighborhood)
  if (hops === 2) addHop(neighborhood)

  if (neighborhood.size <= 1) {
    chart += `  target["${targetPath.split('/').pop() || targetPath}"]:::targetStyle\n`
    chart += '  note["No connections found"]\n'
    chart += '  target --- note\n'
    chart += '\n  classDef targetStyle fill:#f59e0b,stroke:#fbbf24,color:#000\n'
    nodePathMap.set('target', targetPath)
    return { type: 'focus', title: `Focus: ${targetPath.split('/').pop()}`, chart, stats: { totalNodes: 1, totalEdges: 0 }, nodePathMap }
  }

  // Render nodes
  for (const path of neighborhood) {
    const id = sanitizeId(path)
    const name = path.split('/').pop() || path
    if (path === targetPath) {
      chart += `  ${id}["${name}"]:::targetStyle\n`
    } else if (graph.reverseEdges.get(targetPath)?.has(path) || (hops === 2 && firstHop.has(path))) {
      // Importers of target
      chart += `  ${id}["${name}"]:::importerStyle\n`
    } else {
      chart += `  ${id}["${name}"]:::depStyle\n`
    }
    nodePathMap.set(id, path)
  }

  chart += '\n'

  // Render edges within neighborhood
  let edgeCount = 0
  for (const path of neighborhood) {
    const deps = graph.edges.get(path)
    if (deps) {
      for (const dep of deps) {
        if (neighborhood.has(dep)) {
          chart += `  ${sanitizeId(path)} --> ${sanitizeId(dep)}\n`
          edgeCount++
        }
      }
    }
  }

  chart += '\n  classDef targetStyle fill:#f59e0b,stroke:#fbbf24,color:#000\n'
  chart += '  classDef importerStyle fill:#22c55e,stroke:#4ade80,color:#000\n'
  chart += '  classDef depStyle fill:#3b82f6,stroke:#60a5fa,color:#fff\n'

  return {
    type: 'focus',
    title: `Focus: ${targetPath.split('/').pop()} (${neighborhood.size} files, ${hops}-hop)`,
    chart,
    stats: { totalNodes: neighborhood.size, totalEdges: edgeCount },
    nodePathMap,
  }
}

// ---------------------------------------------------------------------------
// Master generator
// ---------------------------------------------------------------------------

export function generateDiagram(
  type: DiagramType,
  codeIndex: CodeIndex,
  files: FileNode[],
  analysis?: FullAnalysis,
  focusTarget?: string,
  focusHops?: 1 | 2,
): AnyDiagramResult {
  const data = analysis || analyzeCodebase(codeIndex)

  switch (type) {
    case 'summary':
      return generateProjectSummary(data, codeIndex)
    case 'topology':
      return generateTopologyDiagram(data)
    case 'imports':
      return generateImportGraph(data)
    case 'classes':
      return generateClassDiagram(data)
    case 'entrypoints':
      return generateEntryPoints(data, codeIndex, files)
    case 'modules':
      return generateModuleUsageTree(data)
    case 'treemap':
      return generateTreemap(codeIndex, files)
    case 'externals':
      return generateExternalDeps(data)
    case 'focus':
      return generateFocusDiagram(data, focusTarget || '', focusHops || 1)
    default:
      return generateProjectSummary(data, codeIndex)
  }
}
