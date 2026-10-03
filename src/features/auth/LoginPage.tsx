import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Button, Spinner, TextField } from '../../components/ui'
import { ru } from '../../i18n/ru'
import { getSupabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'

export function LoginPage() {
  const { session, ready } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (!ready) return <Spinner />
  if (session) return <Navigate to="/lessons" replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const { error: signError } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password })
    setPending(false)
    if (signError) setError(ru.login.failed)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <p className="font-serif text-4xl">{ru.appName}</p>
      <h1 className="mt-2 text-lg text-muted">{ru.login.title}</h1>
      <form className="mt-6 space-y-4 rounded-3xl border border-line bg-card p-5" onSubmit={onSubmit}>
        <TextField label={ru.login.email} type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        <TextField label={ru.login.password} type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        {error && <p className="text-sm text-bad">{error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>
          {ru.login.submit}
        </Button>
        <p className="text-sm text-muted">{ru.login.hint}</p>
      </form>
    </main>
  )
}
