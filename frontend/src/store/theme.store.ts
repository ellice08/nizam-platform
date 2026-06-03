import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'auto'

interface ThemeState {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'auto') return getSystemTheme()
  return theme
}

export function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme)
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)
  return resolved
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'auto',
      resolvedTheme: getSystemTheme(),
      setTheme: (theme) => {
        const resolved = applyTheme(theme)
        set({ theme, resolvedTheme: resolved })

        // If auto, listen for system changes
        if (theme === 'auto') {
          setupSystemListener()
        }
      },
      toggleTheme: () => {
        const current = get().resolvedTheme
        const next = current === 'light' ? 'dark' : 'light'
        const resolved = applyTheme(next)
        set({ theme: next, resolvedTheme: resolved })
      },
    }),
    {
      name: 'nizam-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          const resolved = applyTheme(state.theme)
          state.resolvedTheme = resolved
          if (state.theme === 'auto') setupSystemListener()
        }
      },
    }
  )
)

let mediaListener: (() => void) | null = null

function setupSystemListener() {
  if (mediaListener) return // already listening
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => {
    const store = useThemeStore.getState()
    if (store.theme === 'auto') {
      const resolved = applyTheme('auto')
      useThemeStore.setState({ resolvedTheme: resolved })
    }
  }
  mq.addEventListener('change', handler)
  mediaListener = () => mq.removeEventListener('change', handler)
}
