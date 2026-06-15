import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store'
import LoadingScreen from '@/components/LoadingScreen'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAdmin?: boolean
}

export const ProtectedRoute = ({
  children,
  requireAdmin = false,
}: ProtectedRouteProps) => {
  const { user, isAdmin, isLoading } = useAuthStore()

  // Wait for useAuth to finish restoring session
  // isLoading starts true and is set false by useAuth
  // after getSession resolves — so this is never a permanent block
  if (isLoading) {
    return <LoadingScreen />
  }

  // Session restored — now make routing decisions
  if (!user) return <Navigate to="/login" replace />
  if (requireAdmin && !isAdmin) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}

export default ProtectedRoute
