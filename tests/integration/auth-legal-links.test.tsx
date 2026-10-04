import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SignInPage } from '../../src/features/auth/SignInPage';
import { AuthSessionContext } from '../../src/features/auth/AuthSessionContext';

describe('production legal links on authentication surfaces', () => {
  it.each(['signin', 'signup'] as const)(
    'exposes the real policy and support routes on %s without changing consent/authentication',
    (mode) => {
      render(
        <AuthSessionContext.Provider
          value={{
            session: null,
            loading: false,
            initializationError: null,
            signOut: async () => ({ ok: true, value: undefined }),
          }}
        >
          <MemoryRouter>
            <SignInPage mode={mode} />
          </MemoryRouter>
        </AuthSessionContext.Provider>,
      );
      for (const [name, href] of [
        ['Privacy', 'https://calcura.study/privacy/'],
        ['Terms', 'https://calcura.study/terms/'],
        ['Contact', 'https://calcura.study/contact/'],
      ]) {
        expect(screen.getByRole('link', { name })).toHaveAttribute(
          'href',
          href,
        );
      }
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Email address')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        mode === 'signup'
          ? 'Create your free teacher account'
          : 'Teacher sign in',
      );
    },
  );
});
