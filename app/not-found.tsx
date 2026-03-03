import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-6 bg-primary-background font-sans text-text-primary">
      <div className="flex flex-col items-center gap-2">
        <span className="text-7xl font-bold text-text-muted">404</span>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="max-w-md text-center text-sm text-text-secondary">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <Button asChild variant="outline" size="lg">
        <Link href="/">Go home</Link>
      </Button>
    </div>
  )
}
