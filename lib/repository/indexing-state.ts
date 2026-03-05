// ---------------------------------------------------------------------------
// Indexing progress tracking
// ---------------------------------------------------------------------------

export interface IndexingProgress {
  current: number
  total: number
  isComplete: boolean
}

export const DEFAULT_INDEXING_PROGRESS: IndexingProgress = {
  current: 0,
  total: 0,
  isComplete: false,
}
