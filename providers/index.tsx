"use client"

import type { ReactNode } from "react"
import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "next-themes"
import { AppProvider, useApp } from "./app-provider"
import { APIKeysProvider, useAPIKeys } from "./api-keys-provider"
import { RepositoryProvider, useRepository, type LoadingStage } from "./repository-provider"
import { DocsProvider, useDocs, useDocsChat } from "./docs-provider"
import { ToursProvider, useTours } from "./tours-provider"

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <APIKeysProvider>
          <RepositoryProvider>
            <ToursProvider>
              <DocsProvider>
                <AppProvider>
                  {children}
                </AppProvider>
              </DocsProvider>
            </ToursProvider>
          </RepositoryProvider>
        </APIKeysProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}

export { useApp, useAPIKeys, useRepository, useDocs, useDocsChat, useTours }
export type { LoadingStage }
export type { PinnedFile, PinnedContentsResult } from '@/types/types'
