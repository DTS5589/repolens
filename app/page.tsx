"use client"

import { Header } from "@/components/layout/header"
import { ResizableLayout } from "@/components/layout/resizable-layout"
import { ChatSidebar } from "@/components/features/chat/chat-sidebar"
import { PreviewPanel } from "@/components/features/preview/preview-panel"

export default function HomePage() {
  return (
    <div className="flex h-screen w-full flex-col bg-primary-background font-sans text-text-primary">
      <Header />
      <div className="flex-1 overflow-hidden px-2 pt-2">
        <ResizableLayout
          sidebarContent={<ChatSidebar />}
          mainContent={<PreviewPanel className="rounded-lg overflow-hidden" />}
        />
      </div>
    </div>
  )
}
