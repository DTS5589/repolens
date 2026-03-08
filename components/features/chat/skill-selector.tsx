"use client"

import { useState, useCallback } from "react"
import { Sparkles, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { useSkills } from "@/hooks/use-skills"

interface SkillSelectorProps {
  activeSkills: Set<string>
  onToggle: (skillId: string) => void
  className?: string
}

export function SkillSelector({
  activeSkills,
  onToggle,
  className,
}: SkillSelectorProps) {
  const [open, setOpen] = useState(false)
  const { skills, isLoading, error } = useSkills()

  const handleSelect = useCallback(
    (skillId: string) => {
      onToggle(skillId)
    },
    [onToggle],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "flex items-center gap-1.5 text-xs text-text-secondary hover:bg-foreground/5",
            activeSkills.size > 0 && "text-accent-primary",
            className,
          )}
          aria-label="Select skills"
          aria-haspopup="dialog"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          {activeSkills.size > 0 && (
            <span className="text-[10px]">{activeSkills.size}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        align="start"
        side="top"
        role="dialog"
        aria-label="Skill selector"
      >
        <Command shouldFilter={true}>
          <CommandInput placeholder="Search skills..." />
          <CommandList>
            {error ? (
              <div className="py-6 text-center text-xs text-destructive">Failed to load skills</div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
              </div>
            ) : (
              <>
                <CommandEmpty>No skills available.</CommandEmpty>
                <CommandGroup>
                  {skills.map((skill) => {
                    const isActive = activeSkills.has(skill.id)
                    return (
                      <CommandItem
                        key={skill.id}
                        value={skill.name}
                        onSelect={() => handleSelect(skill.id)}
                        className={cn(
                          "flex items-center gap-2",
                          isActive && "bg-accent-primary/5",
                        )}
                      >
                        {isActive ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-accent-primary" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="block truncate text-xs">{skill.name}</span>
                          <span className="block truncate text-[10px] text-text-muted">
                            {skill.description}
                          </span>
                        </div>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
