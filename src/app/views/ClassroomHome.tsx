import { useState } from 'react';
import { useAuthSession } from '../../features/auth/useAuthSession';

export function ClassroomHome() {
  const { session, signOut } = useAuthSession();
  const [signOutMessage, setSignOutMessage] = useState<string | null>(null);

  const handleSignOut = async () => {
    const result = await signOut();
    if (!result.ok) setSignOutMessage(result.error.message);
  };

  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <a className="wordmark" href="/app">
          Calcura Classroom
        </a>
        <button
          className="button button-quiet"
          type="button"
          onClick={() => void handleSignOut()}
          aria-label={`Sign out${session?.user.email ? ` ${session.user.email}` : ''}`}
        >
          Sign out
        </button>
      </header>
      {signOutMessage && (
        <p className="notice" role="alert">
          {signOutMessage}
        </p>
      )}
      <section className="workspace-content" aria-labelledby="welcome-title">
        <p className="eyebrow">Teacher workspace</p>
        <h1 id="welcome-title">Classroom management is being prepared.</h1>
      </section>
    </main>
  );
}
