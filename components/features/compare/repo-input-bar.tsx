"use client"

import { useState, useCallback, type FormEvent } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useComparison } from "@/providers/comparison-provider"

export function RepoInputBar() {
  const [url, setUrl] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const { addRepo, isAtCapacity } = useComparison()

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      const trimmed = url.trim()
      if (!trimmed) return

      setIsAdding(true)
      try {
        const success = await addRepo(trimmed)
        if (success) setUrl("")
      } finally {
        setIsAdding(false)
      }
    },
    [url, addRepo]
  )

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        type="text"
        placeholder="owner/repo or https://github.com/owner/repo"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={isAdding || isAtCapacity}
        className="flex-1"
        aria-label="Repository URL"
      />
      <Button
        type="submit"
        size="sm"
        disabled={isAdding || isAtCapacity || !url.trim()}
      >
        <Plus className="mr-1 h-4 w-4" />
        {isAdding ? "Adding…" : "Add Repo"}
      </Button>
    </form>
  )
}
