import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getAccessToken } from "@/lib/auth/token"
import { fetchFileContent } from "@/lib/github/fetcher"

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const owner = searchParams.get("owner")
  const name = searchParams.get("name")
  const branch = searchParams.get("branch")
  const path = searchParams.get("path")

  if (!owner || !name || !branch || !path) {
    return NextResponse.json(
      { error: "Missing required parameters: owner, name, branch, path" },
      { status: 400 }
    )
  }

  try {
    const token = await getAccessToken(request)

    const content = await fetchFileContent(owner, name, branch, path, {
      token,
    })

    return NextResponse.json({ content })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch file"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
