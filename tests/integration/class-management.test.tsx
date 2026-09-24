import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../src/app/routes';
import { AuthSessionContext } from '../../src/features/auth/AuthSessionContext';
import {
  countActiveClassEnrollments,
  createClass,
  getClassById,
  getClassJoinCode,
  listWorkspaceClasses,
  renameClass,
  setClassStatus,
} from '../../src/features/classes/classService';
import { formatJoinCode } from '../../src/features/classes/classFormatters';
import { ensurePersonalWorkspace } from '../../src/features/workspaces/workspaceService';
import type { ClassSummary } from '../../src/features/classes/classService';

vi.mock('../../src/features/workspaces/workspaceService', () => ({
  ensurePersonalWorkspace: vi.fn(),
}));

vi.mock('../../src/features/classes/classService', () => ({
  countActiveClassEnrollments: vi.fn(),
  createClass: vi.fn(),
  getClassById: vi.fn(),
  getClassJoinCode: vi.fn(),
  listWorkspaceClasses: vi.fn(),
  renameClass: vi.fn(),
  setClassStatus: vi.fn(),
}));

const workspace = {
  id: 'workspace-a',
  workspace_type: 'personal',
  name: 'Personal workspace',
  status: 'active',
};

const activeClass: ClassSummary = {
  id: 'class-a',
  workspace_id: 'workspace-a',
  name: 'Calculus I',
  status: 'active',
  created_at: '2026-09-24T00:00:00Z',
  updated_at: '2026-09-24T00:00:00Z',
};

const archivedClass: ClassSummary = {
  ...activeClass,
  id: 'class-b',
  name: 'Calculus II',
  status: 'archived',
};

const signedInSession = {
  user: { id: 'teacher-a', email: 'teacher@example.com' },
} as Session;

function renderApp(path = '/app') {
  return render(
    <AuthSessionContext.Provider
      value={{
        session: signedInSession,
        loading: false,
        initializationError: null,
        signOut: async () => ({ ok: true, value: undefined }),
      }}
    >
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthSessionContext.Provider>,
  );
}

describe('teacher class management routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      ok: true,
      value: workspace,
    });
    vi.mocked(listWorkspaceClasses).mockResolvedValue({ ok: true, value: [] });
    vi.mocked(countActiveClassEnrollments).mockResolvedValue({
      ok: true,
      value: 0,
    });
    vi.mocked(createClass).mockResolvedValue({ ok: true, value: activeClass });
    vi.mocked(getClassById).mockResolvedValue({ ok: true, value: activeClass });
    vi.mocked(getClassJoinCode).mockResolvedValue({
      ok: true,
      value: 'ABCDEFGHJK',
    });
    vi.mocked(renameClass).mockResolvedValue({
      ok: true,
      value: { ...activeClass, name: 'Calculus Foundations' },
    });
    vi.mocked(setClassStatus).mockImplementation(async (_id, status) => ({
      ok: true,
      value: { ...activeClass, status },
    }));
  });

  it('bootstraps a workspace and shows a useful empty class state', async () => {
    renderApp();
    expect(
      await screen.findByRole('heading', { name: 'No classes yet' }),
    ).toBeVisible();
    expect(ensurePersonalWorkspace).toHaveBeenCalledOnce();
    expect(listWorkspaceClasses).toHaveBeenCalledWith('workspace-a');
    expect(
      screen.getByText(
        'Create your first class to generate a student join code.',
      ),
    ).toBeVisible();
  });

  it('renders active classes and keeps archived classes in their own section', async () => {
    vi.mocked(listWorkspaceClasses).mockResolvedValue({
      ok: true,
      value: [activeClass, archivedClass],
    });
    vi.mocked(countActiveClassEnrollments)
      .mockResolvedValueOnce({ ok: true, value: 18 })
      .mockResolvedValueOnce({ ok: true, value: 1 });

    renderApp();
    const active = await screen.findByRole('region', { name: 'Active' });
    const archived = screen.getByRole('region', { name: 'Archived' });
    expect(within(active).getByText('Calculus I')).toBeVisible();
    expect(within(active).getByText('18 students')).toBeVisible();
    expect(within(archived).getByText('Calculus II')).toBeVisible();
    expect(within(archived).getByText('1 student')).toBeVisible();
  });

  it('recovers from a class-list failure with a user-triggered retry', async () => {
    vi.mocked(listWorkspaceClasses)
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: 'unexpected',
          message: 'We could not complete that request. Try again.',
        },
      })
      .mockResolvedValueOnce({ ok: true, value: [] });
    renderApp();
    expect(
      await screen.findByText('We couldn’t load your classes.'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('heading', { name: 'No classes yet' }),
    ).toBeVisible();
    expect(listWorkspaceClasses).toHaveBeenCalledTimes(2);
  });

  it('shows a recoverable workspace bootstrap error and retries', async () => {
    vi.mocked(ensurePersonalWorkspace)
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: 'unexpected',
          message: 'We could not complete that request. Try again.',
        },
      })
      .mockResolvedValueOnce({ ok: true, value: workspace });

    renderApp();
    expect(
      await screen.findByRole('heading', {
        name: 'We couldn’t load your classroom workspace.',
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('heading', { name: 'No classes yet' }),
    ).toBeVisible();
    expect(ensurePersonalWorkspace).toHaveBeenCalledTimes(2);
  });

  it('trims a class name, creates it once, and opens its detail', async () => {
    renderApp();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Create your first class' }),
    );
    const input = screen.getByLabelText('Class name');
    fireEvent.change(input, { target: { value: '  Calculus I  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create class' }));

    expect(createClass).toHaveBeenCalledWith({
      workspaceId: 'workspace-a',
      name: 'Calculus I',
    });
    expect(
      await screen.findByRole('heading', { name: 'Calculus I' }),
    ).toBeVisible();
    expect(screen.getByText('ABCDE-FGHJK')).toBeVisible();
  });

  it('keeps the entered class name when creation fails', async () => {
    vi.mocked(createClass).mockResolvedValue({
      ok: false,
      error: {
        code: 'unexpected',
        message: 'We could not complete that request. Try again.',
      },
    });
    renderApp();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Create your first class' }),
    );
    const input = screen.getByLabelText('Class name');
    fireEvent.change(input, { target: { value: 'Physics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create class' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not complete that request. Try again.',
    );
    expect(input).toHaveValue('Physics');
  });

  it('prevents a duplicate create request while the first submission is pending', async () => {
    const createdClass = { ...activeClass, name: 'Chemistry' };
    let resolveCreate:
      ((result: Awaited<ReturnType<typeof createClass>>) => void) | undefined;
    vi.mocked(getClassById).mockResolvedValue({
      ok: true,
      value: createdClass,
    });
    vi.mocked(createClass).mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    renderApp();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Create your first class' }),
    );
    fireEvent.change(screen.getByLabelText('Class name'), {
      target: { value: 'Chemistry' },
    });
    const submit = screen.getByRole('button', { name: 'Create class' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(createClass).toHaveBeenCalledOnce();
    resolveCreate?.({ ok: true, value: createdClass });
    expect(
      await screen.findByRole('heading', { name: 'Chemistry' }),
    ).toBeVisible();
  });

  it('safely handles an inaccessible class without revealing tenant details', async () => {
    vi.mocked(getClassById).mockResolvedValue({
      ok: false,
      error: {
        code: 'class_not_found',
        message: 'The requested class is unavailable.',
      },
    });
    renderApp('/app/classes/foreign-class');
    expect(
      await screen.findByRole('heading', {
        name: 'This class is unavailable.',
      }),
    ).toBeVisible();
    expect(screen.queryByText('foreign-class')).not.toBeInTheDocument();
  });

  it('shows the join-code copy result and handles clipboard failure', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    renderApp('/app/classes/class-a');
    await screen.findByRole('heading', { name: 'Calculus I' });
    fireEvent.click(await screen.findByRole('button', { name: 'Copy code' }));
    expect(
      await screen.findByText(
        'Could not copy the code. Select and copy it instead.',
        { selector: '.copy-feedback' },
      ),
    ).toHaveTextContent('Could not copy the code. Select and copy it instead.');
  });

  it('copies the presentationally formatted join code', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderApp('/app/classes/class-a');
    await screen.findByRole('heading', { name: 'Calculus I' });
    fireEvent.click(await screen.findByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenCalledWith('ABCDE-FGHJK');
    expect(
      await screen.findByText('Copied', { selector: '.copy-feedback' }),
    ).toBeVisible();
  });

  it('renames, confirms archive, and reactivates a class', async () => {
    renderApp('/app/classes/class-a');
    await screen.findByRole('heading', { name: 'Calculus I' });

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText('Class name');
    fireEvent.change(input, { target: { value: 'Calculus Foundations' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(
      await screen.findByRole('heading', { name: 'Calculus Foundations' }),
    ).toBeVisible();
    expect(renameClass).toHaveBeenCalledWith('class-a', 'Calculus Foundations');

    fireEvent.click(screen.getByRole('button', { name: 'Archive class' }));
    expect(
      screen.getByRole('heading', { name: 'Archive this class?' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Archive class' }));
    await waitFor(() =>
      expect(setClassStatus).toHaveBeenCalledWith('class-a', 'archived'),
    );
    expect(screen.getByText('Archived class')).toBeVisible();

    vi.mocked(setClassStatus).mockResolvedValueOnce({
      ok: true,
      value: activeClass,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reactivate class' }));
    await waitFor(() =>
      expect(setClassStatus).toHaveBeenLastCalledWith('class-a', 'active'),
    );
    expect(screen.getByText('Active class')).toBeVisible();
  });

  it('constrains detail data to the active workspace and keeps code formatting presentation-only', async () => {
    vi.mocked(getClassById).mockResolvedValue({
      ok: true,
      value: { ...activeClass, workspace_id: 'workspace-b' },
    });
    renderApp('/app/classes/class-a');
    expect(
      await screen.findByRole('heading', {
        name: 'This class is unavailable.',
      }),
    ).toBeVisible();
    expect(formatJoinCode('ABCDEFGHIJ')).toBe('ABCDE-FGHIJ');
    expect(getClassJoinCode).not.toHaveBeenCalled();
  });
});
