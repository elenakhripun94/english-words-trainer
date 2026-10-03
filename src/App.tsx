import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ru } from './i18n/ru'
import { isConfigured } from './lib/env'
import { AuthProvider } from './features/auth/AuthProvider'
import { AppRouter } from './router'
import { ToastProvider } from './components/Toast'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

export function App() {
  if (!isConfigured()) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
        <h1 className="font-serif text-4xl">{ru.setup.title}</h1>
        <p className="mt-3 text-lg">{ru.setup.body}</p>
      </main>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <AppRouter />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
