import { createContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { signOut } from './authService';

export interface AuthSessionValue {
  session: Session | null;
  loading: boolean;
  initializationError: string | null;
  signOut: () => ReturnType<typeof signOut>;
}

export const AuthSessionContext = createContext<AuthSessionValue | null>(null);
