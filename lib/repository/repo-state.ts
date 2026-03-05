// ---------------------------------------------------------------------------
// Repository state types & defaults
// ---------------------------------------------------------------------------

export type LoadingStage =
  | 'idle'
  | 'metadata'
  | 'tree'
  | 'downloading'
  | 'extracting'
  | 'indexing'
  | 'ready'
  | 'cached'

export interface SearchState {
  searchQuery: string
  debouncedSearchQuery: string
  replaceQuery: string
  showReplace: boolean
  fileFilter: string
  searchOptions: {
    caseSensitive: boolean
    regex: boolean
    wholeWord: boolean
  }
}

export const DEFAULT_SEARCH_STATE: SearchState = {
  searchQuery: '',
  debouncedSearchQuery: '',
  replaceQuery: '',
  showReplace: false,
  fileFilter: '',
  searchOptions: {
    caseSensitive: false,
    regex: false,
    wholeWord: false,
  },
}
