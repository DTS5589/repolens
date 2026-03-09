import type { Dispatch, SetStateAction } from 'react'
import type { GitHubRepo, FileNode } from '@/types/repository'
import { detectLanguage } from '@/lib/github/fetcher'
import { fetchFileViaProxy } from '@/lib/github/client'
import type { CodeIndex } from '@/lib/code/code-index'
import { createEmptyIndex, createEmptyIndexWithStore, batchIndexFiles, flattenFiles } from '@/lib/code/code-index'
import { IDBContentStore } from '@/lib/code/content-store'
import { fetchRepoZipball, isFileIndexable } from '@/lib/github/zipball'
import { setCachedRepo } from '@/lib/cache/repo-cache'
import { fetchWithConcurrency } from './fetch-utils'
import { IDB_CONTENT_STORE_THRESHOLD_KB } from '@/config/constants'
import { toast } from 'sonner'

const CONCURRENCY_LIMIT = 10

/** Subset of LoadingStage relevant during indexing. */
type IndexingStage = 'downloading' | 'extracting' | 'indexing' | 'ready'

interface IndexingProgress {
  current: number
  total: number
  isComplete: boolean
}

interface IndexingCallbacks {
  setIndexingProgress: Dispatch<SetStateAction<IndexingProgress>>
  setLoadingStage: (stage: IndexingStage) => void
  setCodeIndex: (index: CodeIndex) => void
  setFailedFiles: (files: Array<{ path: string; error: string }>) => void
}

/**
 * Downloads, indexes, and caches repository files.
 *
 * Tries a zipball download first (for repos < 200 MB), then falls back to
 * per-file fetching with concurrency control.
 */
export async function startIndexing(
  repoData: GitHubRepo,
  fileTree: FileNode[],
  treeSha: string,
  signal: AbortSignal,
  callbacks: IndexingCallbacks,
  options: { token?: string } = {},
): Promise<void> {
  const { setIndexingProgress, setLoadingStage, setCodeIndex, setFailedFiles } = callbacks

  // Get all indexable files from tree metadata
  const indexableFiles = flattenFiles(fileTree).filter(f =>
    isFileIndexable(f.name, f.size || 0),
  )

  setIndexingProgress({ current: 0, total: indexableFiles.length, isComplete: false })

  if (indexableFiles.length === 0) {
    setIndexingProgress({ current: 0, total: 0, isComplete: true })
    setLoadingStage('ready')
    return
  }

  const accumulated: Array<{ path: string; content: string; language?: string }> = []
  const errors: Array<{ path: string; error: string }> = []
  let zipballUsed = false

  // B1: Try zipball for repos under 200 MB (GitHub API reports size in KB)
  if (repoData.size != null && repoData.size < 200_000) {
    try {
      setLoadingStage('downloading')
      const zipFiles = await fetchRepoZipball(
        repoData.owner,
        repoData.name,
        repoData.defaultBranch,
        { signal, token: options.token },
      )

      if (signal.aborted) return

      setLoadingStage('extracting')
      for (const [path, content] of zipFiles) {
        const filename = path.split('/').pop() || path
        accumulated.push({ path, content, language: detectLanguage(filename) })
      }

      zipballUsed = true
      setIndexingProgress({
        current: accumulated.length,
        total: accumulated.length,
        isComplete: false,
      })
    } catch (err) {
      // Zipball failed — fall back to per-file fetch
      if (signal.aborted) return
      console.warn('Zipball download failed, falling back to per-file fetch:', err)
    }
  }

  // Per-file fetch fallback
  if (!zipballUsed) {
    setLoadingStage('indexing')
    let processed = 0

    await fetchWithConcurrency(
      indexableFiles,
      async (file) => {
        if (signal.aborted) return

        try {
          const content = await fetchFileViaProxy(
            repoData.owner,
            repoData.name,
            repoData.defaultBranch,
            file.path,
          )

          if (signal.aborted) return

          accumulated.push({ path: file.path, content, language: file.language })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          errors.push({ path: file.path, error: message })
        }

        processed++
        if (processed % 5 === 0 || processed === indexableFiles.length) {
          setIndexingProgress(prev => ({ ...prev, current: processed }))
        }
      },
      CONCURRENCY_LIMIT,
    )
  }

  if (signal.aborted) return

  setLoadingStage('indexing')

  // B3: Batch-index all accumulated files at once (avoids O(N²) Map copies)
  const useIDB = repoData.size != null && repoData.size >= IDB_CONTENT_STORE_THRESHOLD_KB
  const baseIndex = useIDB
    ? createEmptyIndexWithStore(new IDBContentStore(`${repoData.owner}/${repoData.name}`))
    : createEmptyIndex()
  const finalIndex = batchIndexFiles(baseIndex, accumulated)

  setCodeIndex(finalIndex)
  setFailedFiles(errors)
  setIndexingProgress({
    current: accumulated.length,
    total: zipballUsed ? accumulated.length : indexableFiles.length,
    isComplete: true,
  })
  setLoadingStage('ready')

  // B2: Persist to IndexedDB cache
  setCachedRepo(repoData.owner, repoData.name, treeSha, accumulated, fileTree, {
    description: repoData.description,
    stars: repoData.stars,
    language: repoData.language,
  })
    .catch(() => { /* cache write failure is non-critical */ })

  // B6: Notify user of failed files
  if (errors.length > 0) {
    toast.error(
      `Indexed ${accumulated.length} files (${errors.length} failed)`,
    )
  }
}
