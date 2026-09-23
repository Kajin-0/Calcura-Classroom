import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthSession } from './useAuthSession';

export function RequireSession() {
  const { session, loading } = useAuthSession();
  const location = useLocation();

  if (loading) {
    return (
      <main className="page-status" aria-live="polite">
        Checking your session…
      </main>
    );
  }
  if (!session) {
    return (
      <Navigate to="/signin" replace state={{ from: location.pathname }} />
    );
  }
  return <Outlet />;
}
