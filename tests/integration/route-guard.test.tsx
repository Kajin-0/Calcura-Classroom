import { render, screen, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireSession } from '../../src/features/auth/RequireSession';
import { AuthSessionContext } from '../../src/features/auth/AuthSessionContext';

const fakeSession = {
  user: { id: 'teacher-1', email: 'teacher@example.com' },
} as Session;

function renderProtectedRoute(withSession: boolean) {
  return render(
    <AuthSessionContext.Provider
      value={{
        session: withSession ? fakeSession : null,
        loading: false,
        initializationError: null,
        signOut: async () => ({ ok: true, value: undefined }),
      }}
    >
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/signin" element={<h1>Sign in route</h1>} />
          <Route element={<RequireSession />}>
            <Route path="/app" element={<h1>Authenticated app</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthSessionContext.Provider>,
  );
}

describe('authenticated route guard', () => {
  it('sends an unauthenticated visitor to sign in', async () => {
    renderProtectedRoute(false);
    expect(
      await screen.findByRole('heading', { name: 'Sign in route' }),
    ).toBeInTheDocument();
  });

  it('allows a user with a saved session into the app', async () => {
    renderProtectedRoute(true);
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Authenticated app' }),
      ).toBeInTheDocument(),
    );
  });
});
