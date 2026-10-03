import { Navigate, Outlet } from 'react-router-dom'
import { Spinner } from '../../components/ui'
import { useAuth } from './AuthProvider'

export function RequireAuth() {
  const { session, ready } = useAuth()
  if (!ready) return <Spinner />
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}
