// Web Worker entry — runs scanIssues off the main thread.

import { scanIssues, computeScanSummary } from './scanner'
import { scanWithTreeSitter } from './tree-sitter-scanner'
import {
  deserializeCodeIndex,
  deserializeFullAnalysis,
  serializeScanResults,
} from './serialization'
import type { ScanWorkerRequest, ScanWorkerResponse } from './serialization'
import { IDBContentStore } from '../content-store'

self.addEventListener('message', async (event: MessageEvent<ScanWorkerRequest>) => {
  const { id, codeIndex: serializedIndex, analysis: serializedAnalysis, changedFiles, repoKey } = event.data

  try {
    const codeIndex = deserializeCodeIndex(serializedIndex)

    // For IDB-backed repos: load content from IDB
    if (repoKey) {
      const store = new IDBContentStore(repoKey)
      const paths = Array.from(codeIndex.files.keys())
      const contents = await store.getBatch(paths)
      for (const [path, content] of contents) {
        const file = codeIndex.files.get(path)
        if (file) {
          ;(file as { content: string }).content = content
        }
      }
    }

    const analysis = serializedAnalysis ? deserializeFullAnalysis(serializedAnalysis) : null
    const results = scanIssues(codeIndex, analysis, changedFiles)

    // Run async Tree-sitter analysis for multi-language support
    try {
      const treeSitterIssues = await scanWithTreeSitter(codeIndex.files)
      if (treeSitterIssues.length > 0) {
        const existingIds = new Set(results.issues.map(i => i.id))
        for (const issue of treeSitterIssues) {
          if (!existingIds.has(issue.id)) {
            results.issues.push(issue)
          }
        }
        // Recompute summary counts
        results.summary = computeScanSummary(results.issues)
      }
    } catch (err) {
      console.warn('[scanner.worker] Tree-sitter analysis failed:', err)
    }

    const response: ScanWorkerResponse = {
      type: 'result',
      id,
      results: serializeScanResults(results),
    }
    ;(self as unknown as { postMessage(msg: ScanWorkerResponse): void }).postMessage(response)
  } catch (err) {
    const response: ScanWorkerResponse = {
      type: 'error',
      id,
      error: err instanceof Error ? err.message : String(err),
    }
    ;(self as unknown as { postMessage(msg: ScanWorkerResponse): void }).postMessage(response)
  }
})
