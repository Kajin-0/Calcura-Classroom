import { useContext } from 'react';
import { AuthSessionContext } from './AuthSessionContext';

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context)
    throw new Error('useAuthSession must be used inside AuthSessionProvider.');
  return context;
}
