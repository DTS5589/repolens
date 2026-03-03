import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getAccessToken } from "@/lib/auth/token"

const GITHUB_API_BASE = "https://api.github.com"

export async function GET(request: NextRequest) {
  try {
    const token = await getAccessToken(request)

    const headers: HeadersInit = {
      Accept: "application/vnd.github.v3+json",
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch(`${GITHUB_API_BASE}/rate_limit`, { headers })

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch rate limit" },
        { status: response.status }
      )
    }

    const data = await response.json()
    const core = data.rate ?? data.resources?.core

    return NextResponse.json({
      limit: core?.limit ?? 0,
      remaining: core?.remaining ?? 0,
      reset: core?.reset ?? 0,
      authenticated: !!token,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch rate limit"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
