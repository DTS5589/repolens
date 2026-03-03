import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getAccessToken } from "@/lib/auth/token"
import { fetchRepoTree } from "@/lib/github/fetcher"

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const owner = searchParams.get("owner")
  const name = searchParams.get("name")
  const sha = searchParams.get("sha") ?? "HEAD"

  if (!owner || !name) {
    return NextResponse.json(
      { error: "Missing required parameters: owner, name" },
      { status: 400 }
    )
  }

  try {
    const token = await getAccessToken(request)

    const tree = await fetchRepoTree(owner, name, sha, {
      token,
    })

    return NextResponse.json(tree)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch tree"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
