import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store'

const FirstLogin = () => {
  const navigate = useNavigate()
  const { user, isAdmin, setFirstLogin } = useAuthStore()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    try {
      setLoading(true)

      // Update password in Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })

      if (updateError) throw updateError

      // Update first_login to false in tenant_users
      if (user) {
        await supabase
          .from('tenant_users')
          .update({ first_login: false })
          .eq('user_id', user.id)
      }

      // Update local store
      setFirstLogin(false)

      // Navigate to correct dashboard
      navigate(isAdmin ? '/admin' : '/dashboard', { replace: true })

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0E0E0C',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'Arial, sans-serif',
    }}>
      <div style={{
        background: '#141410',
        border: '1px solid #2A2A26',
        borderRadius: '12px',
        padding: '48px',
        width: '100%',
        maxWidth: '400px',
      }}>
        <p style={{
          margin: '0 0 4px',
          fontSize: '11px',
          color: '#7A2535',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          fontWeight: 600,
        }}>
          First login
        </p>
        <h1 style={{
          margin: '0 0 8px',
          fontSize: '28px',
          fontWeight: 600,
          color: '#FAFAFA',
          letterSpacing: '-0.02em',
        }}>
          Set your password
        </h1>
        <p style={{
          margin: '0 0 32px',
          fontSize: '14px',
          color: '#888880',
          lineHeight: 1.6,
        }}>
          Choose a secure password to complete your account setup.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              fontSize: '12px',
              color: '#888880',
              marginBottom: '6px',
              letterSpacing: '0.04em',
            }}>
              New password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              required
              style={{
                width: '100%',
                background: '#0E0E0C',
                border: '1px solid #2A2A26',
                borderRadius: '6px',
                padding: '10px 14px',
                color: '#FAFAFA',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              fontSize: '12px',
              color: '#888880',
              marginBottom: '6px',
              letterSpacing: '0.04em',
            }}>
              Confirm password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat your password"
              required
              style={{
                width: '100%',
                background: '#0E0E0C',
                border: '1px solid #2A2A26',
                borderRadius: '6px',
                padding: '10px 14px',
                color: '#FAFAFA',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <p style={{
              color: '#F0C5CC',
              fontSize: '13px',
              marginBottom: '16px',
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: loading ? '#4A1520' : '#7A2535',
              color: '#FAFAFA',
              border: 'none',
              borderRadius: '6px',
              padding: '12px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '0.02em',
            }}
          >
            {loading ? 'Setting password...' : 'Set password and continue'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default FirstLogin
