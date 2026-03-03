// API Provider types
export type AIProvider = 'openai' | 'google' | 'anthropic' | 'openrouter'

export interface APIKeyConfig {
  key: string
  isValid: boolean | null
  lastValidated: Date | null
}

export interface APIKeysState {
  openai: APIKeyConfig
  google: APIKeyConfig
  anthropic: APIKeyConfig
  openrouter: APIKeyConfig
}

export interface ProviderModel {
  id: string
  name: string
  provider: AIProvider
  contextLength?: number
}

export interface ProviderInfo {
  id: AIProvider
  name: string
  description: string
  docsUrl: string
  keyPrefix: string
}

// Chat and Message types
export interface Message {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp?: Date
}

export interface ChatSession {
    id: string
    messages: Message[]
    createdAt: Date
    updatedAt: Date
}

// Component generation types
export interface ComponentGenerationRequest {
    message: string
    system?: string
    model?: string
}

export interface ComponentGenerationResponse {
    success: boolean
    demoUrl?: string
    aiMessage?: string
    error?: string
    generatedFiles?: GeneratedFile[]
}

export interface GeneratedFile {
    name: string
    content: string
    status: 'generated' | 'modified' | 'unchanged'
    type: 'component' | 'page' | 'api' | 'config'
}

// UI Component types
export interface ResizableLayoutProps {
    defaultSidebarWidth?: number
    minSidebarWidth?: number
    maxSidebarWidth?: number
}

export interface PreviewPanelProps {
    previewUrl: string | null
    isLoading?: boolean
}

export interface SidebarProps {
    setPreviewUrl: (url: string | null) => void
    className?: string
}


