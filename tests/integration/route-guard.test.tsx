import { render, screen, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { RequireSession } from '../../src/features/auth/RequireSession';
import { AuthSessionContext } from '../../src/features/auth/AuthSessionContext';

const fakeSession = {
  user: { id: 'teacher-1', email: 'teacher@example.com' },
} as Session;

function renderProtectedRoute(withSession: boolean, initialEntry = '/app') {
  const router = createMemoryRouter(
    [
      { path: '/signin', element: <h1>Sign in route</h1> },
      {
        element: <RequireSession />,
        children: [{ path: '/app/*', element: <h1>Authenticated app</h1> }],
      },
    ],
    { initialEntries: [initialEntry] },
  );
  render(
    <AuthSessionContext.Provider
      value={{
        session: withSession ? fakeSession : null,
        loading: false,
        initializationError: null,
        signOut: async () => ({ ok: true, value: undefined }),
      }}
    >
      <RouterProvider router={router} />
    </AuthSessionContext.Provider>,
  );
  return router;
}

describe('authenticated route guard', () => {
  it.each(['/app', '/app/classes', '/app/billing', '/app/billing?foo=bar#x'])(
    'preserves %s when sending an unauthenticated visitor to sign in',
    async (destination) => {
      const router = renderProtectedRoute(false, destination);
      expect(
        await screen.findByRole('heading', { name: 'Sign in route' }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/signin');
      expect(router.state.location.state).toEqual({ from: destination });
      expect(router.state.historyAction).toBe('REPLACE');
    },
  );

  it.each(['/app', '/app/billing?intent=pro#plans'])(
    'allows a user with a saved session into %s',
    async (destination) => {
      const router = renderProtectedRoute(true, destination);
      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: 'Authenticated app' }),
        ).toBeInTheDocument(),
      );
      const { pathname, search, hash } = router.state.location;
      expect(pathname + search + hash).toBe(destination);
    },
  );
});
