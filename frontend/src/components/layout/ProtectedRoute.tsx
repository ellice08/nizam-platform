import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store'

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
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'hsl(var(--background))',
          color: '#FAFAFA',
          fontSize: '13px',
          fontFamily: 'Arial, sans-serif',
          letterSpacing: '0.08em',
        }}
      >
        Loading...
      </div>
    )
  }

  // Session restored — now make routing decisions
  if (!user) return <Navigate to="/login" replace />
  if (requireAdmin && !isAdmin) return <Navigate to="/dashboard" replace />

  return <>{children}</>
}

export default ProtectedRoute
