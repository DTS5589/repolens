import type { ReactNode } from "react"
import { ComparisonProvider } from "@/providers/comparison-provider"

export const metadata = {
  title: "Compare Repositories",
}

export default function CompareLayout({ children }: { children: ReactNode }) {
  return <ComparisonProvider>{children}</ComparisonProvider>
}
