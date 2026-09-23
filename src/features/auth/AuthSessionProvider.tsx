import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../lib/supabase/client';
import { loadSession, signOut as signOutUser } from './authService';
import {
  AuthSessionContext,
  type AuthSessionValue,
} from './AuthSessionContext';

export function AuthSessionProvider({
  children,
  client = getSupabaseClient(),
}: {
  children: ReactNode;
  client?: SupabaseClient | null;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(client));
  const [initializationError, setInitializationError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!client) {
      return undefined;
    }

    let active = true;
    let authChanged = false;
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      authChanged = true;
      setSession(nextSession);
      setInitializationError(null);
      setLoading(false);
    });

    void loadSession(client).then((result) => {
      if (!active || authChanged) return;
      if (result.ok) setSession(result.value);
      else setInitializationError(result.error.message);
      setLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  const value = useMemo<AuthSessionValue>(
    () => ({
      session,
      loading,
      initializationError,
      signOut: () => signOutUser(client),
    }),
    [client, initializationError, loading, session],
  );

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}
