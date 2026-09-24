import { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useAuthSession } from '../features/auth/useAuthSession';
import { useWorkspace } from '../features/workspaces/useWorkspace';

export function TeacherLayout() {
  const { session, signOut } = useAuthSession();
  const { workspace, loading, error, retry } = useWorkspace();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const handleSignOut = async () => {
    const result = await signOut();
    if (!result.ok) setSignOutError(result.error.message);
  };

  return (
    <div className="teacher-app">
      <header className="workspace-header">
        <Link className="wordmark" to="/app">
          Calcura Classroom
        </Link>
        <div className="account-actions">
          {session?.user.email && (
            <span className="account-email">{session.user.email}</span>
          )}
          <button
            className="button button-quiet"
            type="button"
            onClick={() => void handleSignOut()}
          >
            Sign out
          </button>
        </div>
      </header>
      {signOutError && (
        <p className="notice shell-notice" role="alert">
          {signOutError}
        </p>
      )}
      <main className="teacher-main">
        {loading ? (
          <section
            className="workspace-content"
            aria-live="polite"
            role="status"
          >
            <p className="loading-copy">Loading your classroom workspace…</p>
          </section>
        ) : error || !workspace ? (
          <section className="workspace-content recoverable-state">
            <h1>We couldn’t load your classroom workspace.</h1>
            <p className="muted-copy">
              Check your connection and try again. Your classes have not been
              changed.
            </p>
            <button
              className="button button-primary"
              type="button"
              onClick={retry}
            >
              Retry
            </button>
          </section>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
