"use client"

import { signIn, signOut, useSession } from "next-auth/react"
import { Github, LogIn, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"

export function AuthButton() {
  const { data: session, status } = useSession()

  if (status === "loading") {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs text-text-secondary"
        disabled
      >
        <Github className="h-3.5 w-3.5" />
      </Button>
    )
  }

  if (session) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-foreground/5"
        onClick={() => signOut()}
      >
        <LogOut className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Sign out</span>
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-foreground/5"
      onClick={() => signIn("github")}
    >
      <LogIn className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Sign in</span>
    </Button>
  )
}
