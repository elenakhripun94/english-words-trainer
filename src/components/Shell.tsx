import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ru } from '../i18n/ru'
import { useAuth } from '../features/auth/AuthProvider'
import { Button } from './ui'

export function TeacherShell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/lessons" className="font-serif text-2xl text-ink no-underline">
            {ru.appName}
          </Link>
          <Button variant="ghost" onClick={() => void signOut()}>
            {ru.nav.logout}
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
