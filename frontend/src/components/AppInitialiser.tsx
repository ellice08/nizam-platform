import type { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function AppInitialiser({ children }: { children: ReactNode }) {
  useAuth();
  return <>{children}</>;
}
