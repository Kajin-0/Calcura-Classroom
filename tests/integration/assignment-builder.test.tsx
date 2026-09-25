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
import { getClassById } from '../../src/features/classes/classService';
import { ensurePersonalWorkspace } from '../../src/features/workspaces/workspaceService';
import {
  addAssignmentItem,
  archiveAssignment,
  createAssignment,
  discardAssignment,
  getAssignmentById,
  getAssignmentStudentProgress,
  listAssignmentItems,
  listClassAssignments,
  publishAssignment,
  reactivateAssignment,
  removeAssignmentItem,
  reorderAssignmentItems,
  updateAssignmentItem,
  updateAssignmentMetadata,
} from '../../src/features/assignments/assignmentService';
import {
  countActiveClassEnrollments,
  getClassJoinCode,
  renameClass,
  setClassStatus,
} from '../../src/features/classes/classService';
import type {
  AssignmentItemSummary,
  AssignmentSummary,
} from '../../src/features/assignments/assignmentService';
import type { ClassSummary } from '../../src/features/classes/classService';

vi.mock('../../src/features/workspaces/workspaceService', () => ({
  ensurePersonalWorkspace: vi.fn(),
}));
vi.mock('../../src/features/classes/classService', () => ({
  countActiveClassEnrollments: vi.fn(),
  getClassById: vi.fn(),
  getClassJoinCode: vi.fn(),
  renameClass: vi.fn(),
  setClassStatus: vi.fn(),
}));
vi.mock('../../src/features/assignments/assignmentService', () => ({
  addAssignmentItem: vi.fn(),
  archiveAssignment: vi.fn(),
  createAssignment: vi.fn(),
  discardAssignment: vi.fn(),
  getAssignmentById: vi.fn(),
  getAssignmentStudentProgress: vi.fn(),
  listAssignmentItems: vi.fn(),
  listClassAssignments: vi.fn(),
  publishAssignment: vi.fn(),
  reactivateAssignment: vi.fn(),
  removeAssignmentItem: vi.fn(),
  reorderAssignmentItems: vi.fn(),
  updateAssignmentItem: vi.fn(),
  updateAssignmentMetadata: vi.fn(),
}));

const workspace = {
  id: 'workspace-a',
  workspace_type: 'personal',
  name: 'Personal workspace',
  status: 'active',
};
const classItem: ClassSummary = {
  id: 'class-a',
  workspace_id: workspace.id,
  name: 'Calculus I',
  status: 'active',
  created_at: '2026-09-24T00:00:00Z',
  updated_at: '2026-09-24T00:00:00Z',
};
const draft: AssignmentSummary = {
  id: 'assignment-a',
  class_id: classItem.id,
  title: 'Integration practice',
  due_at: null,
  status: 'draft',
  published_at: null,
  created_at: '2026-09-24T00:00:00Z',
  updated_at: '2026-09-24T00:00:00Z',
};
const item: AssignmentItemSummary = {
  id: 'item-a',
  assignment_id: draft.id,
  position: 0,
  activity_contract_version: 1,
  activity_key: 'integration.u_substitution.v1',
  problem_count: 5,
  created_at: '2026-09-24T00:00:00Z',
  updated_at: '2026-09-24T00:00:00Z',
};
const itemTen: AssignmentItemSummary = {
  ...item,
  problem_count: 10,
  updated_at: '2026-09-24T00:01:00Z',
};
const session = {
  user: { id: 'teacher-a', email: 'teacher@example.com' },
} as Session;

function renderApp(path: string) {
  return render(
    <AuthSessionContext.Provider
      value={{
        session,
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

describe('teacher assignment workflow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      ok: true,
      value: workspace,
    });
    vi.mocked(getClassById).mockResolvedValue({ ok: true, value: classItem });
    vi.mocked(countActiveClassEnrollments).mockResolvedValue({
      ok: true,
      value: 2,
    });
    vi.mocked(getClassJoinCode).mockResolvedValue({
      ok: true,
      value: 'ABCDEFGHJK',
    });
    vi.mocked(renameClass).mockResolvedValue({ ok: true, value: classItem });
    vi.mocked(setClassStatus).mockResolvedValue({ ok: true, value: classItem });
    vi.mocked(listClassAssignments).mockResolvedValue({ ok: true, value: [] });
    vi.mocked(createAssignment).mockResolvedValue({ ok: true, value: draft });
    vi.mocked(getAssignmentById).mockResolvedValue({ ok: true, value: draft });
    vi.mocked(getAssignmentStudentProgress).mockResolvedValue({
      ok: true,
      value: [],
    });
    vi.mocked(listAssignmentItems).mockResolvedValue({ ok: true, value: [] });
    vi.mocked(addAssignmentItem).mockResolvedValue({ ok: true, value: item });
    vi.mocked(updateAssignmentItem).mockResolvedValue({
      ok: true,
      value: item,
    });
    vi.mocked(removeAssignmentItem).mockResolvedValue({
      ok: true,
      value: undefined,
    });
    vi.mocked(reorderAssignmentItems).mockResolvedValue({
      ok: true,
      value: undefined,
    });
    vi.mocked(updateAssignmentMetadata).mockResolvedValue({
      ok: true,
      value: draft,
    });
    vi.mocked(publishAssignment).mockResolvedValue({
      ok: true,
      value: {
        ...draft,
        status: 'published',
        published_at: '2026-09-24T12:00:00Z',
      },
    });
    vi.mocked(archiveAssignment).mockResolvedValue({
      ok: true,
      value: {
        ...draft,
        status: 'archived',
        published_at: '2026-09-24T12:00:00Z',
      },
    });
    vi.mocked(reactivateAssignment).mockResolvedValue({
      ok: true,
      value: {
        ...draft,
        status: 'published',
        published_at: '2026-09-24T12:00:00Z',
      },
    });
    vi.mocked(discardAssignment).mockResolvedValue({
      ok: true,
      value: undefined,
    });
  });

  it('creates a trimmed draft with an optional due date and opens its builder', async () => {
    renderApp('/app/classes/class-a/assignments/new');
    fireEvent.change(await screen.findByLabelText('Title'), {
      target: { value: '  Integration practice  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(createAssignment).toHaveBeenCalledWith({
      classId: 'class-a',
      title: 'Integration practice',
      dueAt: null,
    });
    expect(
      await screen.findByRole('heading', { name: 'Integration practice' }),
    ).toBeVisible();
  });

  it('requires at least one block, adds a practice block, then confirms publication and locks content', async () => {
    renderApp('/app/classes/class-a/assignments/assignment-a');
    expect(
      await screen.findByRole('button', { name: 'Publish assignment' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Activity'), {
      target: { value: 'integration.by_parts.v1' },
    });
    fireEvent.change(screen.getByLabelText('Problems'), {
      target: { value: '6' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
    await waitFor(() =>
      expect(addAssignmentItem).toHaveBeenCalledWith({
        assignmentId: draft.id,
        activityKey: 'integration.by_parts.v1',
        problemCount: 6,
      }),
    );
    expect(await screen.findAllByLabelText('Practice activity')).toHaveLength(
      1,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Publish assignment' }));
    const confirmation = screen.getByRole('group', {
      name: 'Publish this assignment?',
    });
    expect(
      within(confirmation).getByText(/permanently locks the practice blocks/i),
    ).toBeVisible();
    expect(publishAssignment).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'Publish assignment' }),
    );
    await waitFor(() =>
      expect(publishAssignment).toHaveBeenCalledWith(draft.id),
    );
    expect(await screen.findByText('Content locked')).toBeVisible();
    expect(screen.queryByLabelText('Activity')).not.toBeInTheDocument();
  });

  it('creates and reloads a ten-problem block without truncation', async () => {
    vi.mocked(addAssignmentItem).mockResolvedValue({
      ok: true,
      value: itemTen,
    });
    const view = renderApp('/app/classes/class-a/assignments/assignment-a');
    await screen.findByRole('button', { name: 'Add block' });
    fireEvent.change(screen.getByLabelText('Activity'), {
      target: { value: 'integration.u_substitution.v1' },
    });
    fireEvent.change(screen.getByLabelText('Problems'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add block' }));
    await waitFor(() =>
      expect(addAssignmentItem).toHaveBeenCalledWith({
        assignmentId: draft.id,
        activityKey: 'integration.u_substitution.v1',
        problemCount: 10,
      }),
    );
    expect(
      within(screen.getAllByRole('listitem')[0]!).getByLabelText('Problems'),
    ).toHaveValue(10);

    view.unmount();
    vi.mocked(listAssignmentItems).mockResolvedValue({
      ok: true,
      value: [itemTen],
    });
    renderApp('/app/classes/class-a/assignments/assignment-a');
    await waitFor(() =>
      expect(screen.getAllByLabelText('Problems')[0]).toHaveValue(10),
    );
  });

  it('makes unsaved count edits explicit and persists 5 to 10 across reload', async () => {
    vi.mocked(listAssignmentItems).mockResolvedValue({
      ok: true,
      value: [item],
    });
    vi.mocked(updateAssignmentItem).mockResolvedValue({
      ok: true,
      value: itemTen,
    });
    const view = renderApp('/app/classes/class-a/assignments/assignment-a');
    const problemInputs = await screen.findAllByLabelText('Problems');
    fireEvent.change(problemInputs[0]!, { target: { value: '10' } });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Unsaved changes — select Save block to apply.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save block' }));
    await waitFor(() =>
      expect(updateAssignmentItem).toHaveBeenCalledWith(item.id, {
        activityKey: item.activity_key,
        problemCount: 10,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('status')).not.toBeInTheDocument(),
    );

    view.unmount();
    vi.mocked(listAssignmentItems).mockResolvedValue({
      ok: true,
      value: [itemTen],
    });
    renderApp('/app/classes/class-a/assignments/assignment-a');
    await waitFor(() =>
      expect(screen.getAllByLabelText('Problems')[0]).toHaveValue(10),
    );
  });

  it('reorders and removes draft practice blocks through the builder', async () => {
    const secondItem = {
      ...item,
      id: 'item-b',
      position: 1,
      activity_key: 'integration.by_parts.v1',
    } as const;
    vi.mocked(listAssignmentItems).mockResolvedValue({
      ok: true,
      value: [item, secondItem],
    });
    renderApp('/app/classes/class-a/assignments/assignment-a');
    const blocks = await screen.findAllByRole('listitem');
    fireEvent.click(
      within(blocks[1]!).getByRole('button', { name: 'Move up' }),
    );
    await waitFor(() =>
      expect(reorderAssignmentItems).toHaveBeenCalledWith(draft.id, [
        secondItem.id,
        item.id,
      ]),
    );
    const refreshedBlocks = screen.getAllByRole('listitem');
    fireEvent.click(
      within(refreshedBlocks[0]!).getByRole('button', { name: 'Remove' }),
    );
    await waitFor(() =>
      expect(removeAssignmentItem).toHaveBeenCalledWith(secondItem.id),
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('confirms archive and supports reactivation without losing the assignment', async () => {
    vi.mocked(getAssignmentById).mockResolvedValueOnce({
      ok: true,
      value: {
        ...draft,
        status: 'published',
        published_at: '2026-09-24T12:00:00Z',
      },
    });
    renderApp('/app/classes/class-a/assignments/assignment-a');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Archive assignment' }),
    );
    const confirmation = screen.getByRole('group', {
      name: 'Archive this assignment?',
    });
    expect(archiveAssignment).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'Archive assignment' }),
    );
    await waitFor(() =>
      expect(archiveAssignment).toHaveBeenCalledWith(draft.id),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reactivate assignment' }),
    );
    await waitFor(() =>
      expect(reactivateAssignment).toHaveBeenCalledWith(draft.id),
    );
    expect(await screen.findByText('Content locked')).toBeVisible();
  });

  it('shows authorized enrolled-student progress on published assignments', async () => {
    vi.mocked(getAssignmentById).mockResolvedValueOnce({
      ok: true,
      value: {
        ...draft,
        status: 'published',
        published_at: '2026-09-24T12:00:00Z',
      },
    });
    vi.mocked(listAssignmentItems).mockResolvedValueOnce({
      ok: true,
      value: [item],
    });
    vi.mocked(getAssignmentStudentProgress).mockResolvedValueOnce({
      ok: true,
      value: [
        {
          studentUserId: 'student-a',
          email: 'student-a@example.test',
          completedProblemCount: 0,
          totalProblemCount: 5,
          status: 'not_started',
          lastActivityAt: null,
        },
        {
          studentUserId: 'student-b',
          email: 'student-b@example.test',
          completedProblemCount: 2,
          totalProblemCount: 5,
          status: 'in_progress',
          lastActivityAt: '2026-09-24T12:00:00Z',
        },
        {
          studentUserId: 'student-c',
          email: 'student-c@example.test',
          completedProblemCount: 5,
          totalProblemCount: 5,
          status: 'completed',
          lastActivityAt: '2026-09-24T12:30:00Z',
        },
      ],
    });
    renderApp('/app/classes/class-a/assignments/assignment-a');
    const section = await screen.findByRole('region', {
      name: 'Student progress',
    });
    expect(
      await within(section).findByText('student-a@example.test'),
    ).toBeVisible();
    expect(within(section).getByText('0 / 5')).toBeVisible();
    expect(within(section).getByText('Not started')).toBeVisible();
    expect(within(section).getByText('2 / 5')).toBeVisible();
    expect(within(section).getByText('In progress')).toBeVisible();
    expect(within(section).getByText('Completed')).toBeVisible();
  });

  it('shows a clean no-enrollment state', async () => {
    vi.mocked(getAssignmentById).mockResolvedValueOnce({
      ok: true,
      value: {
        ...draft,
        status: 'published',
        published_at: '2026-09-24T12:00:00Z',
      },
    });
    vi.mocked(getAssignmentStudentProgress).mockResolvedValueOnce({
      ok: true,
      value: [],
    });
    renderApp('/app/classes/class-a/assignments/assignment-a');
    const section = await screen.findByRole('region', {
      name: 'Student progress',
    });
    expect(
      await within(section).findByText(
        'No active students are enrolled in this class yet.',
      ),
    ).toBeVisible();
  });

  it('offers retry when teacher progress cannot be loaded', async () => {
    vi.mocked(getAssignmentById).mockResolvedValueOnce({
      ok: true,
      value: {
        ...draft,
        status: 'published',
        published_at: '2026-09-24T12:00:00Z',
      },
    });
    vi.mocked(getAssignmentStudentProgress)
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'unexpected', message: 'safe' },
      })
      .mockResolvedValueOnce({ ok: true, value: [] });
    renderApp('/app/classes/class-a/assignments/assignment-a');
    const section = await screen.findByRole('region', {
      name: 'Student progress',
    });
    expect(
      await within(section).findByText(
        'Student progress is unavailable right now.',
      ),
    ).toBeVisible();
    fireEvent.click(within(section).getByRole('button', { name: 'Retry' }));
    expect(
      await within(section).findByText(
        'No active students are enrolled in this class yet.',
      ),
    ).toBeVisible();
  });

  it('requires confirmation before discarding a draft', async () => {
    renderApp('/app/classes/class-a/assignments/assignment-a');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Discard draft' }),
    );
    const confirmation = screen.getByRole('group', {
      name: 'Discard this draft?',
    });
    expect(discardAssignment).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'Discard draft' }),
    );
    await waitFor(() =>
      expect(discardAssignment).toHaveBeenCalledWith(draft.id),
    );
    expect(
      await screen.findByRole('heading', { name: 'Assignments' }),
    ).toBeVisible();
  });

  it('shows safe unavailable content when assignment belongs to a different class', async () => {
    vi.mocked(getAssignmentById).mockResolvedValueOnce({
      ok: true,
      value: { ...draft, class_id: 'foreign-class' },
    });
    renderApp('/app/classes/class-a/assignments/assignment-a');
    expect(
      await screen.findByRole('heading', {
        name: 'This assignment is unavailable.',
      }),
    ).toBeVisible();
    expect(screen.queryByText('Integration practice')).not.toBeInTheDocument();
  });

  it('groups real assignments into published, draft, and archived sections', async () => {
    vi.mocked(listClassAssignments).mockResolvedValue({
      ok: true,
      value: [
        { ...draft, status: 'published', published_at: '2026-09-24T00:00:00Z' },
        draft,
        {
          ...draft,
          id: 'assignment-old',
          title: 'Past practice',
          status: 'archived',
          published_at: '2026-09-20T00:00:00Z',
        },
      ],
    });
    renderApp('/app/classes/class-a');
    const published = await screen.findByRole('region', { name: 'Published' });
    const drafts = screen.getByRole('region', { name: 'Drafts' });
    const archived = screen.getByRole('region', { name: 'Archived' });
    expect(within(published).getByText('Integration practice')).toBeVisible();
    expect(within(drafts).getByText('Integration practice')).toBeVisible();
    expect(within(archived).getByText('Past practice')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'New assignment' }),
    ).toHaveAttribute('href', '/app/classes/class-a/assignments/new');
  });
});
