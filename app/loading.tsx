import { Spinner } from '@/components/ui/spinner'

export default function Loading() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-primary-background">
      <Spinner className="size-8 text-text-secondary" />
    </div>
  )
}
