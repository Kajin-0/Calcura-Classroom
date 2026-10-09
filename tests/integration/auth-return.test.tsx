import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  createMemoryRouter,
  RouterProvider,
  type InitialEntry,
} from 'react-router-dom';
import { SignInPage } from '../../src/features/auth/SignInPage';
import { RequireSession } from '../../src/features/auth/RequireSession';
import { AuthSessionContext } from '../../src/features/auth/AuthSessionContext';

const fakeSession = {
  user: { id: 'teacher-1', email: 'teacher@example.com' },
} as Session;

function renderAuthRoute(initialEntry: InitialEntry, authenticated = false) {
  const router = createMemoryRouter(
    [
      { path: '/signin', element: <SignInPage mode="signin" /> },
      { path: '/signup', element: <SignInPage mode="signup" /> },
      {
        element: <RequireSession />,
        children: [{ path: '/app/*', element: <h1>Authenticated app</h1> }],
      },
    ],
    { initialEntries: [initialEntry] },
  );
  const withSession = (session: Session | null) => (
    <AuthSessionContext.Provider
      value={{
        session,
        loading: false,
        initializationError: null,
        signOut: async () => ({ ok: true, value: undefined }),
      }}
    >
      <RouterProvider router={router} />
    </AuthSessionContext.Provider>
  );
  const view = render(withSession(authenticated ? fakeSession : null));
  return {
    router,
    authenticate: () => view.rerender(withSession(fakeSession)),
  };
}

async function expectDestination(
  router: ReturnType<typeof createMemoryRouter>,
  destination: string,
) {
  await screen.findByRole('heading', { name: 'Authenticated app' });
  await waitFor(() => {
    const { pathname, search, hash } = router.state.location;
    expect(pathname + search + hash).toBe(destination);
  });
  expect(router.state.historyAction).toBe('REPLACE');
}

describe.each(['/signin', '/signup'])(
  'post-auth destination from %s',
  (pathname) => {
    it('defaults to /app when there is no return state', async () => {
      const { router, authenticate } = renderAuthRoute(pathname);
      authenticate();
      await expectDestination(router, '/app');
    });

    it.each([
      '/app',
      '/app/classes',
      '/app/billing',
      '/app/billing?intent=pro#plans',
    ])(
      'returns to %s once a session becomes available',
      async (destination) => {
        const { router, authenticate } = renderAuthRoute({
          pathname,
          state: { from: destination },
        });
        authenticate();
        await expectDestination(router, destination);
      },
    );

    it('uses the billing destination for an existing session', async () => {
      const { router } = renderAuthRoute(
        { pathname, state: { from: '/app/billing' } },
        true,
      );
      await expectDestination(router, '/app/billing');
    });

    it.each([
      'https://evil.example',
      '//evil.example',
      'javascript:alert(1)',
      '/signin',
      '/signup',
      '/application',
      '/else/../app/billing',
      ' /app/billing',
      '/\\evil.example/app/billing',
      '/app/../signin',
      '/app/%2e%2e/signup',
      '/app\\evil.example',
      '/app/\n',
      '/app/%',
      '/app/\0',
      '/app/\u007f',
      123,
      { pathname: '/app/billing' },
    ])('rejects unsafe or malformed return state %j', async (from) => {
      const { router, authenticate } = renderAuthRoute({
        pathname,
        state: { from },
      });
      authenticate();
      await expectDestination(router, '/app');
    });

    it('ignores URL query parameters as a source of return destinations', async () => {
      const { router, authenticate } = renderAuthRoute(
        `${pathname}?from=/app/billing`,
      );
      authenticate();
      await expectDestination(router, '/app');
    });
  },
);

describe('switching between sign in and sign up', () => {
  it.each([
    ['/signin', '/signup', 'Create a free teacher account'],
    ['/signup', '/signin', 'Teacher sign in'],
  ])(
    'preserves the billing destination from %s to %s',
    async (pathname, nextPath, linkName) => {
      const destination = '/app/billing?intent=pro#plans';
      const { router, authenticate } = renderAuthRoute({
        pathname,
        state: { from: destination },
      });
      fireEvent.click(screen.getByRole('link', { name: linkName }));
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(nextPath),
      );
      expect(router.state.location.state).toEqual({ from: destination });
      authenticate();
      await expectDestination(router, destination);
    },
  );

  it.each([
    ['/signin', '/signup', 'Create a free teacher account'],
    ['/signup', '/signin', 'Teacher sign in'],
  ])(
    'forwards only the safe default from %s to %s',
    async (pathname, nextPath, linkName) => {
      const { router, authenticate } = renderAuthRoute({
        pathname,
        state: { from: '//evil.example' },
      });
      fireEvent.click(screen.getByRole('link', { name: linkName }));
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(nextPath),
      );
      expect(router.state.location.state).toEqual({ from: '/app' });
      authenticate();
      await expectDestination(router, '/app');
    },
  );

  it('carries purchase intent through the guard and account creation', async () => {
    const destination = '/app/billing?intent=pro#plans';
    const { router, authenticate } = renderAuthRoute(destination);
    fireEvent.click(
      await screen.findByRole('link', {
        name: 'Create a free teacher account',
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/signup'));
    expect(router.state.location.state).toEqual({ from: destination });
    authenticate();
    await expectDestination(router, destination);
  });
});
