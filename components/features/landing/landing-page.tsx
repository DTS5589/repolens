"use client"

import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Github,
  Bug,
  FileText,
  Network,
  Code2,
  Loader2,
  ArrowRight,
  Link,
  Sparkles,
  Compass,
} from "lucide-react"
import { useRepository } from "@/providers"
import { LoadingProgress } from "@/components/features/loading/loading-progress"

interface LandingPageProps {
  repoUrl: string
  onRepoUrlChange: (url: string) => void
  onConnect: () => void
  onConnectWithUrl: (url: string) => void
  isConnecting: boolean
  error: string | null
}

const FEATURES = [
  {
    icon: Github,
    title: "Project Summary",
    description:
      "Get an instant overview of any repository — languages, structure, and key metrics",
  },
  {
    icon: Bug,
    title: "Code Quality",
    description:
      "Automated scanning for TODO/FIXME, complexity issues, and potential problems",
  },
  {
    icon: FileText,
    title: "AI Documentation",
    description:
      "Generate comprehensive docs from your codebase with AI",
  },
  {
    icon: Network,
    title: "Architecture Diagrams",
    description:
      "Auto-generate dependency graphs and architecture diagrams with Mermaid",
  },
  {
    icon: Code2,
    title: "Code Browser",
    description:
      "Syntax-highlighted code browser with search, replace, and keyboard shortcuts",
  },
] as const

const EXAMPLE_REPOS = [
  { name: "pmndrs/zustand", url: "https://github.com/pmndrs/zustand" },
  { name: "shadcn-ui/ui", url: "https://github.com/shadcn-ui/ui" },
  { name: "t3-oss/create-t3-app", url: "https://github.com/t3-oss/create-t3-app" },
  { name: "tailwindlabs/heroicons", url: "https://github.com/tailwindlabs/heroicons" },
] as const

const STEPS = [
  {
    number: 1,
    icon: Link,
    title: "Paste a GitHub URL",
    description: "Just paste any public repository URL",
  },
  {
    number: 2,
    icon: Sparkles,
    title: "AI Analyzes",
    description: "Code is downloaded and analyzed in seconds",
  },
  {
    number: 3,
    icon: Compass,
    title: "Explore",
    description: "Browse docs, diagrams, issues, and more",
  },
] as const

export function LandingPage({
  repoUrl,
  onRepoUrlChange,
  onConnect,
  onConnectWithUrl,
  isConnecting,
  error,
}: LandingPageProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { loadingStage, indexingProgress, isCacheHit } = useRepository()

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(timer)
  }, [])

  const handleExampleClick = (url: string) => {
    onRepoUrlChange(url)
    onConnectWithUrl(url)
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-16 px-6 py-12 sm:py-16">
        {/* ── Hero Section ── */}
        <section className="flex flex-col items-center gap-8 text-center">
          {/* Icon cluster */}
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
              <Github className="h-7 w-7 text-primary" />
            </div>
          </div>

          <div className="flex flex-col items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl lg:text-4xl">
              Understand Any GitHub
              <br className="hidden sm:block" />
              {" "}Repository in Seconds
            </h1>
            <p className="max-w-lg text-sm text-text-secondary sm:text-base">
              AI-powered code analysis, documentation generation, architecture
              diagrams, and more
            </p>
          </div>

          {/* Search input */}
          <div className="w-full max-w-md space-y-3">
            <Input
              ref={inputRef}
              type="url"
              value={repoUrl}
              onChange={(e) => onRepoUrlChange(e.target.value)}
              placeholder="https://github.com/username/repo"
              className="h-11 bg-foreground/5 border-foreground/10 text-text-primary placeholder:text-text-muted focus:border-foreground/20 text-sm sm:text-base"
              onKeyDown={(e) => e.key === "Enter" && onConnect()}
            />
            {error && (
              <p className="text-sm text-status-error">{error}</p>
            )}
            <Button
              className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
              disabled={!repoUrl.trim() || isConnecting}
              onClick={onConnect}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  Connect Repository
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
            {/* Multi-stage progress below the button during connection */}
            {isConnecting && (
              <LoadingProgress
                stage={loadingStage}
                progress={indexingProgress}
                isCacheHit={isCacheHit}
                error={error}
                repoName={repoUrl}
              />
            )}
            <p className="text-xs text-text-muted text-center">
              Tip: Add{" "}
              <span className="font-medium text-text-secondary">m</span>{" "}
              before github.com — e.g.{" "}
              <span className="font-medium text-text-secondary">
                mgithub.com/owner/repo
              </span>
            </p>
          </div>
        </section>

        {/* ── Example Repos ── */}
        <section className="flex flex-col items-center gap-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Try an example
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLE_REPOS.map((repo) => (
              <button
                key={repo.name}
                onClick={() => handleExampleClick(repo.url)}
                disabled={isConnecting}
                className="flex items-center gap-1.5 rounded-full border border-foreground/[0.08] bg-foreground/[0.03] px-3.5 py-1.5 text-xs font-medium text-text-secondary transition-all hover:border-foreground/15 hover:bg-foreground/[0.06] hover:text-text-primary disabled:opacity-50"
              >
                <Github className="h-3 w-3" />
                {repo.name}
              </button>
            ))}
          </div>
        </section>

        {/* ── Feature Cards ── */}
        <section className="flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-1 text-center">
            <h2 className="text-base font-semibold text-text-primary sm:text-lg">
              Everything you need to explore code
            </h2>
            <p className="text-xs text-text-muted sm:text-sm">
              Powerful tools, one paste away
            </p>
          </div>
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon
              return (
                <div
                  key={feature.title}
                  className="group flex flex-col gap-3 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-4 transition-all hover:border-foreground/15 hover:bg-foreground/[0.05]"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-medium text-text-primary">
                      {feature.title}
                    </h3>
                    <p className="text-xs leading-relaxed text-text-secondary">
                      {feature.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── How It Works ── */}
        <section className="flex flex-col items-center gap-6 pb-8">
          <h2 className="text-base font-semibold text-text-primary sm:text-lg">
            How it works
          </h2>
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map((step) => {
              const Icon = step.icon
              return (
                <div
                  key={step.number}
                  className="flex flex-col items-center gap-3 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] px-4 py-6 text-center"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {step.number}
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                      <Icon className="h-4 w-4 text-text-secondary" />
                      {step.title}
                    </div>
                    <p className="text-xs text-text-muted">
                      {step.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
