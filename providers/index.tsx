"use client"

import type { ReactNode } from "react"
import { ThemeProvider } from "next-themes"
import { AppProvider, useApp } from "./app-provider"
import { APIKeysProvider, useAPIKeys } from "./api-keys-provider"
import { RepositoryProvider, useRepository } from "./repository-provider"

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <APIKeysProvider>
        <RepositoryProvider>
          <AppProvider>
            {children}
          </AppProvider>
        </RepositoryProvider>
      </APIKeysProvider>
    </ThemeProvider>
  )
}

export { useApp, useAPIKeys, useRepository }
