import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import App from './App.tsx';
import AppInitialiser from './components/AppInitialiser.tsx';
import { queryClient } from './lib/queryClient.ts';
import { applyTheme } from '@/store';
import './index.css';

// Apply persisted or system theme before first render
const savedTheme = localStorage.getItem('nizam-theme')
if (savedTheme) {
  try {
    const parsed = JSON.parse(savedTheme) as { state?: { theme?: string } }
    const t = parsed?.state?.theme
    if (t === 'light' || t === 'dark') applyTheme(t)
  } catch {
    applyTheme('light')
  }
} else {
  applyTheme('light')
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <AppInitialiser>
      <App />
    </AppInitialiser>
    {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
  </QueryClientProvider>
);
