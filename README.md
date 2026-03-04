<h1 align="center">RepoLens</h1>
<p align="center"><strong>AI-powered GitHub repository analysis — just add <code>m</code> before any github.com URL</strong></p>

<p align="center">
  <a href="https://github.com/zebbern/repolens/stargazers"><img src="https://img.shields.io/github/stars/zebbern/repolens?style=flat&color=f5a623" alt="GitHub Stars" /></a>
  <a href="https://github.com/zebbern/repolens/releases/latest"><img src="https://img.shields.io/github/v/release/zebbern/repolens" alt="Latest Release" /></a>
  <a href="https://github.com/zebbern/repolens"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License" /></a>
</p>

<p align="center">
  <a href="https://mgithub.com">Website</a> · <a href="#quick-start">Quick Start</a> · <a href="#features">Features</a> · <a href="#screenshots">Screenshots</a> · <a href="#supported-ai-providers">AI Providers</a>
</p>

> **Pro tip:** Turn any GitHub URL into a RepoLens analysis by adding **`m`** before `github.com`.
> For example: `github.com/facebook/react` → [`mgithub.com/facebook/react`](https://mgithub.com/facebook/react)

---

## Screenshots

<div align="center">

<table>
  <tr>
    <td align="center"><strong>Repository Overview</strong></td>
    <td align="center"><strong>Code Browser</strong></td>
    <td align="center"><strong>Issues Scanner</strong></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/repo-overview.png" alt="Repository Overview tab — project summary, detected tech stack, and file tree" width="100%" /></td>
    <td><img src="docs/screenshots/code-browser.png" alt="Code Browser tab — syntax-highlighted source code with file outline and breadcrumbs" width="100%" /></td>
    <td><img src="docs/screenshots/issues-scanner.png" alt="Issues Scanner tab — automated code quality results showing security, performance, and best practice findings" width="100%" /></td>
  </tr>
  <tr>
    <td align="center"><strong>Diagrams</strong></td>
    <td align="center"><strong>Documentation Generator</strong></td>
    <td align="center"><strong>AI Chat</strong></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/diagrams.png" alt="Diagrams tab — auto-generated Mermaid architecture diagram showing component relationships" width="100%" /></td>
    <td><img src="docs/screenshots/docs-generator.png" alt="Documentation Generator tab — AI-generated project documentation with multiple doc types" width="100%" /></td>
    <td><img src="docs/screenshots/ai-chat.png" alt="AI Chat tab — conversational interface asking questions about the codebase" width="100%" /></td>
  </tr>
  <tr>
    <td align="center"><strong>Compare</strong></td>
    <td></td>
    <td></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/compare.png" alt="Compare tab — side-by-side repository comparison view" width="100%" /></td>
    <td></td>
    <td></td>
  </tr>
</table>

</div>

<p align="center">Analyze any public GitHub repository with AI. Browse code, scan for issues, generate documentation, create architecture diagrams, and chat with your codebase — all from a single URL.</p>

---

## Features

- **Repository Overview** — Instant project summary, tech stack detection, and interactive file tree visualization
- **Code Browser** — Syntax-highlighted source viewer powered by Shiki, with file outline and breadcrumb navigation
- **Issues Scanner** — Automated code quality analysis that detects security vulnerabilities, performance problems, and best practice violations
- **Diagrams** — Auto-generated architecture diagrams using Mermaid.js — dependency graphs, component relationships, and more
- **Documentation Generator** — AI-powered docs generation including README, Architecture Overview, API Reference, and Contributing Guide
- **AI Chat** — Ask questions about any codebase with full context awareness and 9 specialized AI tools for deep analysis
- **Compare** — Side-by-side repository comparison to evaluate alternatives

---

## How It Works

1. Navigate to `mgithub.com/owner/repo` (or paste any GitHub URL on the homepage)
2. RepoLens fetches the entire repo via GitHub's Zipball API in a single download
3. Files are indexed and cached in IndexedDB for instant repeat visits
4. All tabs become available — browse code, scan issues, generate docs, chat with AI

---

## Supported AI Providers

RepoLens works with multiple AI providers. You configure API keys directly in the app — no environment variables needed.

| Provider | Example Models |
|---|---|
| **OpenAI** | GPT-4o, GPT-4 Turbo |
| **Google** | Gemini 2.5 Pro, Gemini 2.0 Flash |
| **Anthropic** | Claude 4 Opus, Claude 4 Sonnet |
| **OpenRouter** | Access to hundreds of models |

---

## Quick Start

### Prerequisites

| Requirement | Install | Verify |
|---|---|---|
| **Node.js 18+** | [nodejs.org](https://nodejs.org) | `node -v` |
| **pnpm** | [pnpm.io](https://pnpm.io/installation) | `pnpm -v` |
| **AI API key** | At least one: [OpenAI](https://platform.openai.com/api-keys), [Google AI](https://aistudio.google.com/apikey), [Anthropic](https://console.anthropic.com/settings/keys), or [OpenRouter](https://openrouter.ai/keys) | — |

### Setup

```bash
git clone https://github.com/zebbern/repolens.git
cd repolens/workproject
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), click the **gear icon** (Settings), and enter your API key(s).

### Environment Variables (Optional)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_AUTH_ENABLED=true` | Enable authentication (requires NextAuth setup) |

AI keys are configured in the UI — no environment variables required for basic usage.

---

## Usage

| Action | How |
|---|---|
| Analyze a repo | Add `m` before any `github.com` URL → `mgithub.com/owner/repo` |
| Paste a URL | Enter any GitHub repo URL on the [homepage](https://mgithub.com) |
| Browse code | Open the **Code** tab to view syntax-highlighted files with outline navigation |
| Scan for issues | Open the **Issues** tab for automated security and quality analysis |
| Generate docs | Open the **Docs** tab and select a document type |
| Chat with AI | Open the **Chat** tab and ask questions about the codebase |
| Compare repos | Navigate to the **Compare** tab to evaluate repositories side-by-side |

---

## Tech Stack

| Category | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org) (App Router) |
| UI | [React 19](https://react.dev), [Tailwind CSS](https://tailwindcss.com), [shadcn/ui](https://ui.shadcn.com) |
| Language | [TypeScript 5](https://www.typescriptlang.org) |
| AI | [Vercel AI SDK v6](https://sdk.vercel.ai) |
| Diagrams | [Mermaid.js](https://mermaid.js.org) |
| Syntax highlighting | [Shiki](https://shiki.style) |
| Repo extraction | [JSZip](https://stuk.github.io/jszip/) |
| Testing | [Vitest](https://vitest.dev), [Playwright](https://playwright.dev) |
| Deployment | [Vercel](https://vercel.com) |

---

## Contributing

1. Fork the repo and create a branch.
2. Make your changes.
3. Run `pnpm test` to verify.
4. Open a pull request.

