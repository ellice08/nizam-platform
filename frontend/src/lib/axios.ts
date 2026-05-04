import axios from 'axios'
import { supabase } from './supabase'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL as string,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use(
  async (config) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`
      }
    } catch (err) {
      console.error('Session fetch error:', err)
    }
    return config
  },
  (error) => Promise.reject(error)
)

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API error:', error.response?.status, error.response?.data)
    if (error.response?.status === 401) {
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
