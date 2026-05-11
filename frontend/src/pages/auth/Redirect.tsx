import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store'

const Redirect = () => {
  const navigate = useNavigate()
  const { isLoading, isAdmin, user, firstLogin } = useAuthStore()

  useEffect(() => {
    if (isLoading) return
    if (!user) { navigate('/login', { replace: true }); return }

    // Force password change on first login
    if (firstLogin) {
      navigate('/first-login', { replace: true })
      return
    }

    // Route based on role
    if (isAdmin) { navigate('/admin', { replace: true }); return }
    navigate('/dashboard', { replace: true })
  }, [isLoading, isAdmin, user, firstLogin, navigate])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#0E0E0C',
      color: '#FAFAFA',
      fontSize: '14px',
      fontFamily: 'Arial, sans-serif',
      letterSpacing: '0.05em',
    }}>
      Loading...
    </div>
  )
}

export default Redirect
