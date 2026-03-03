"use client"

import { useCallback, useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import { Moon, Sun, Monitor } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const hasTransitioned = useRef(false)

  const handleThemeChange = useCallback(
    (newTheme: string) => {
      // Add transition class for smooth color change
      if (!hasTransitioned.current) {
        hasTransitioned.current = true
      }
      document.documentElement.classList.add("theme-transition")
      setTheme(newTheme)
      // Remove transition class after animation completes
      const timeout = setTimeout(() => {
        document.documentElement.classList.remove("theme-transition")
      }, 250)
      return () => clearTimeout(timeout)
    },
    [setTheme],
  )

  // Suppress hydration mismatch — render a placeholder until mounted
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
  }, [])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          aria-label="Toggle theme"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleThemeChange("light")}>
          <Sun className="mr-2 h-4 w-4" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange("system")}>
          <Monitor className="mr-2 h-4 w-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
