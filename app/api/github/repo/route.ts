import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getAccessToken } from "@/lib/auth/token"
import { fetchRepoMetadata } from "@/lib/github/fetcher"

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const owner = searchParams.get("owner")
  const name = searchParams.get("name")

  if (!owner || !name) {
    return NextResponse.json(
      { error: "Missing required parameters: owner, name" },
      { status: 400 }
    )
  }

  try {
    const token = await getAccessToken(request)

    const repo = await fetchRepoMetadata(owner, name, {
      token,
    })

    return NextResponse.json(repo)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch repository"

    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    if (message.includes("Rate limit")) {
      return NextResponse.json({ error: message }, { status: 403 })
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
