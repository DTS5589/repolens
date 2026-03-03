import { buildSearchRegex } from "@/lib/code/code-index"
import type { SearchOptions } from "./types"

interface HighlightedTextProps {
  text: string
  query: string
  searchOptions: SearchOptions
}

/** Highlights search matches within a text string. */
export function HighlightedText({ text, query, searchOptions }: HighlightedTextProps) {
  if (!query) return <>{text}</>

  const searchPattern = buildSearchRegex(query, searchOptions, true)
  if (!searchPattern) return <>{text}</>

  const parts = text.split(searchPattern)

  return (
    <>
      {parts.map((part, i) => {
        searchPattern.lastIndex = 0
        return searchPattern.test(part) ? (
          <span key={i} className="bg-code-highlight-bg text-code-highlight-text">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      })}
    </>
  )
}
