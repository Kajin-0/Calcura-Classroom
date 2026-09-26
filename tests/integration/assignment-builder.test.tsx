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
  getAssignmentAnalytics,
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
  AssignmentAnalytics,
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
  getAssignmentAnalytics: vi.fn(),
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

const emptyAnalytics: AssignmentAnalytics = {
  summary: {
    studentsEnrolled: 0,
    studentsStarted: 0,
    studentsCompleted: 0,
    completionRate: null,
    totalAssignedProblemSlots: 0,
    problemsCompleted: 0,
    problemsCorrect: 0,
    accuracy: null,
    averageAttempts: null,
    averageTimeSeconds: null,
    surrenders: 0,
    surrenderRate: null,
  },
  activities: [],
  students: [],
};

const assignmentAnalytics: AssignmentAnalytics = {
  summary: {
    studentsEnrolled: 3,
    studentsStarted: 2,
    studentsCompleted: 1,
    completionRate: 1 / 3,
    totalAssignedProblemSlots: 15,
    problemsCompleted: 7,
    problemsCorrect: 5,
    accuracy: 5 / 7,
    averageAttempts: 2,
    averageTimeSeconds: 48,
    surrenders: 2,
    surrenderRate: 2 / 7,
  },
  activities: [
    {
      assignmentItemId: 'item-a',
      position: 0,
      activityContractVersion: 1,
      activityKey: 'integration.u_substitution.v1',
      activityLabel: 'U-substitution',
      problemCount: 5,
      assignedProblemSlots: 15,
      problemsCompleted: 7,
      problemsCorrect: 5,
      accuracy: 5 / 7,
      averageAttempts: 2,
      averageTimeSeconds: 48,
      surrenders: 2,
      surrenderRate: 2 / 7,
      problemPositions: [
        {
          problemOrdinal: 1,
          problemsCompleted: 2,
          problemsCorrect: 1,
          accuracy: 0.5,
          averageAttempts: 1.5,
          averageTimeSeconds: 45,
          surrenders: 1,
        },
        {
          problemOrdinal: 2,
          problemsCompleted: 2,
          problemsCorrect: 2,
          accuracy: 1,
          averageAttempts: 2,
          averageTimeSeconds: 50,
          surrenders: 0,
        },
        {
          problemOrdinal: 3,
          problemsCompleted: 1,
          problemsCorrect: 1,
          accuracy: 1,
          averageAttempts: 2,
          averageTimeSeconds: 45,
          surrenders: 0,
        },
        {
          problemOrdinal: 4,
          problemsCompleted: 1,
          problemsCorrect: 0,
          accuracy: 0,
          averageAttempts: 3,
          averageTimeSeconds: 60,
          surrenders: 1,
        },
        {
          problemOrdinal: 5,
          problemsCompleted: 1,
          problemsCorrect: 1,
          accuracy: 1,
          averageAttempts: 1,
          averageTimeSeconds: 40,
          surrenders: 0,
        },
      ],
    },
  ],
  students: [
    {
      studentUserId: 'student-a',
      email: 'student-a@example.test',
      completedProblemCount: 0,
      totalProblemCount: 5,
      status: 'not_started',
      lastActivityAt: null,
      problemsCorrect: 0,
      accuracy: null,
      averageAttempts: null,
      averageTimeSeconds: null,
      surrenders: 0,
      surrenderRate: null,
    },
    {
      studentUserId: 'student-b',
      email: 'student-b@example.test',
      completedProblemCount: 2,
      totalProblemCount: 5,
      status: 'in_progress',
      lastActivityAt: '2026-09-24T12:00:00Z',
      problemsCorrect: 1,
      accuracy: 0.5,
      averageAttempts: 1.5,
      averageTimeSeconds: 35,
      surrenders: 1,
      surrenderRate: 0.5,
    },
    {
      studentUserId: 'student-c',
      email: 'student-c@example.test',
      completedProblemCount: 5,
      totalProblemCount: 5,
      status: 'completed',
      lastActivityAt: '2026-09-24T12:30:00Z',
      problemsCorrect: 4,
      accuracy: 0.8,
      averageAttempts: 2.2,
      averageTimeSeconds: 55,
      surrenders: 1,
      surrenderRate: 0.2,
    },
  ],
};

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
    vi.mocked(getAssignmentAnalytics).mockResolvedValue({
      ok: true,
      value: emptyAnalytics,
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
    vi.mocked(addAssignmentItem).mockResolvedValue({
      ok: true,
      value: { ...item, problem_count: 6 },
    });
    renderApp('/app/classes/class-a/assignments/assignment-a');
    expect(
      await screen.findByRole('button', { name: 'Publish assignment' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Practice activity'), {
      target: { value: 'integration.by_parts.v1' },
    });
    fireEvent.change(screen.getByLabelText('Problems'), {
      target: { value: '6' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Add block to assignment' }),
    );
    await waitFor(() =>
      expect(addAssignmentItem).toHaveBeenCalledWith({
        assignmentId: draft.id,
        activityKey: 'integration.by_parts.v1',
        problemCount: 6,
      }),
    );
    expect(
      within(screen.getAllByRole('listitem')[0]!).getByText('6 problems'),
    ).toBeVisible();

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
    expect(
      screen.queryByLabelText('Practice activity'),
    ).not.toBeInTheDocument();
  });

  it('retains four uniquely identified blocks through add, edit, reorder, and reload', async () => {
    const persistedItems: AssignmentItemSummary[] = [];
    const activityKeys: AssignmentItemSummary['activity_key'][] = [
      'integration.u_substitution.v1',
      'integration.u_substitution.v1',
      'integration.by_parts.v1',
      'integration.log_u_substitution.v1',
    ];
    const countsAfterEachAdd = [5, 10, 15, 20];

    vi.mocked(listAssignmentItems).mockImplementation(async () => ({
      ok: true,
      value: [...persistedItems].sort((a, b) => a.position - b.position),
    }));
    vi.mocked(addAssignmentItem).mockImplementation(async (input) => {
      const next: AssignmentItemSummary = {
        ...item,
        id: `item-${persistedItems.length + 1}`,
        position: persistedItems.length,
        activity_key: input.activityKey,
        problem_count: input.problemCount,
      };
      persistedItems.push(next);
      return { ok: true, value: next };
    });
    vi.mocked(updateAssignmentItem).mockImplementation(
      async (itemId, changes) => {
        const index = persistedItems.findIndex(
          (candidate) => candidate.id === itemId,
        );
        const existing = persistedItems[index];
        if (!existing) throw new Error(`Unknown assignment item: ${itemId}`);
        const updated: AssignmentItemSummary = {
          ...existing,
          activity_key: changes.activityKey ?? existing.activity_key,
          problem_count: changes.problemCount ?? existing.problem_count,
          updated_at: '2026-09-24T00:02:00Z',
        };
        persistedItems[index] = updated;
        return { ok: true, value: updated };
      },
    );
    vi.mocked(reorderAssignmentItems).mockImplementation(
      async (_assignmentId, itemIds) => {
        const reordered = itemIds.map((id) => {
          const existing = persistedItems.find(
            (candidate) => candidate.id === id,
          );
          if (!existing) throw new Error(`Unknown assignment item: ${id}`);
          return existing;
        });
        persistedItems.splice(
          0,
          persistedItems.length,
          ...reordered.map((candidate, position) => ({
            ...candidate,
            position,
          })),
        );
        return { ok: true, value: undefined };
      },
    );

    const view = renderApp('/app/classes/class-a/assignments/assignment-a');
    const addActivity = await screen.findByLabelText('Practice activity');
    const addCount = screen.getByLabelText('Problems');
    expect(
      screen.getByRole('heading', { name: 'New practice block' }),
    ).toBeVisible();
    expect(
      screen.getByText('New block · not yet part of the assignment.'),
    ).toBeVisible();
    expect(
      await screen.findByText('0 blocks · 0 problems total'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Add block to assignment' }),
    ).toBeVisible();

    for (let index = 0; index < activityKeys.length; index += 1) {
      fireEvent.change(addActivity, {
        target: { value: activityKeys[index] },
      });
      fireEvent.change(addCount, { target: { value: '5' } });
      fireEvent.click(
        screen.getByRole('button', { name: 'Add block to assignment' }),
      );
      await waitFor(() => {
        expect(persistedItems).toHaveLength(index + 1);
        expect(screen.getAllByRole('listitem')).toHaveLength(index + 1);
      });
      expect(
        await screen.findByText(
          `${index + 1} ${index === 0 ? 'block' : 'blocks'} · ${countsAfterEachAdd[index]} problems total`,
        ),
      ).toBeVisible();
      expect(
        new Set(persistedItems.map((candidate) => candidate.id)).size,
      ).toBe(index + 1);
      expect(persistedItems[index]).toMatchObject({
        position: index,
        activity_key: activityKeys[index],
        problem_count: 5,
      });
    }

    expect(addAssignmentItem).toHaveBeenNthCalledWith(1, {
      assignmentId: draft.id,
      activityKey: activityKeys[0],
      problemCount: 5,
    });
    expect(addAssignmentItem).toHaveBeenNthCalledWith(2, {
      assignmentId: draft.id,
      activityKey: activityKeys[1],
      problemCount: 5,
    });
    expect(addAssignmentItem).toHaveBeenNthCalledWith(3, {
      assignmentId: draft.id,
      activityKey: activityKeys[2],
      problemCount: 5,
    });
    expect(addAssignmentItem).toHaveBeenNthCalledWith(4, {
      assignmentId: draft.id,
      activityKey: activityKeys[3],
      problemCount: 5,
    });

    let blocks = screen.getAllByRole('listitem');
    fireEvent.click(
      within(blocks[1]!).getByRole('button', { name: 'Edit block 2' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Edit practice block 2' }),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText('Problems'), {
      target: { value: '7' },
    });
    expect(screen.getByText('Unsaved changes')).toBeVisible();
    expect(screen.getByText('4 blocks · 20 problems total')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(persistedItems[1]?.problem_count).toBe(7));
    expect(
      await screen.findByText('4 blocks · 22 problems total'),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'New practice block' }),
    ).toBeVisible();

    blocks = screen.getAllByRole('listitem');
    fireEvent.click(
      within(blocks[1]!).getByRole('button', { name: 'Move down' }),
    );
    await waitFor(() =>
      expect(reorderAssignmentItems).toHaveBeenCalledWith(
        draft.id,
        expect.any(Array),
      ),
    );
    expect(
      screen.getAllByRole('listitem').map((block) =>
        within(block)
          .getByText(/problems$/)
          .textContent?.trim(),
      ),
    ).toEqual(['5 problems', '5 problems', '7 problems', '5 problems']);

    view.unmount();
    renderApp('/app/classes/class-a/assignments/assignment-a');
    await screen.findByRole('heading', { name: 'Integration practice' });
    expect(
      await screen.findByText('4 blocks · 22 problems total'),
    ).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(
      screen.getAllByRole('listitem').map((block) =>
        within(block)
          .getByText(/problems$/)
          .textContent?.trim(),
      ),
    ).toEqual(['5 problems', '5 problems', '7 problems', '5 problems']);
    expect(new Set(persistedItems.map((candidate) => candidate.id)).size).toBe(
      4,
    );
  });

  it('creates and reloads a ten-problem block without truncation', async () => {
    vi.mocked(addAssignmentItem).mockResolvedValue({
      ok: true,
      value: itemTen,
    });
    const view = renderApp('/app/classes/class-a/assignments/assignment-a');
    await screen.findByRole('button', { name: 'Add block to assignment' });
    fireEvent.change(screen.getByLabelText('Practice activity'), {
      target: { value: 'integration.u_substitution.v1' },
    });
    fireEvent.change(screen.getByLabelText('Problems'), {
      target: { value: '10' },
    });
    expect(screen.getByText('0 blocks · 0 problems total')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Add block to assignment' }),
    );
    await waitFor(() =>
      expect(addAssignmentItem).toHaveBeenCalledWith({
        assignmentId: draft.id,
        activityKey: 'integration.u_substitution.v1',
        problemCount: 10,
      }),
    );
    expect(
      within(screen.getAllByRole('listitem')[0]!).getByText('10 problems'),
    ).toBeVisible();
    expect(screen.getByText('1 block · 10 problems total')).toBeVisible();

    view.unmount();
    vi.mocked(listAssignmentItems).mockResolvedValue({
      ok: true,
      value: [itemTen],
    });
    renderApp('/app/classes/class-a/assignments/assignment-a');
    await waitFor(() =>
      expect(
        within(screen.getAllByRole('listitem')[0]!).getByText('10 problems'),
      ).toBeVisible(),
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
    const block = (await screen.findAllByRole('listitem'))[0]!;
    fireEvent.click(
      within(block).getByRole('button', { name: 'Edit block 1' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Edit practice block 1' }),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText('Problems'), {
      target: { value: '10' },
    });
    expect(screen.getByText('Unsaved changes')).toBeVisible();
    expect(screen.getByText('1 block · 5 problems total')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(updateAssignmentItem).toHaveBeenCalledWith(item.id, {
        activityKey: item.activity_key,
        problemCount: 10,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument(),
    );

    view.unmount();
    vi.mocked(listAssignmentItems).mockResolvedValue({
      ok: true,
      value: [itemTen],
    });
    renderApp('/app/classes/class-a/assignments/assignment-a');
    await waitFor(() =>
      expect(
        within(screen.getAllByRole('listitem')[0]!).getByText('10 problems'),
      ).toBeVisible(),
    );
  });

  it('cancels existing-block edits without changing the assignment', async () => {
    vi.mocked(listAssignmentItems).mockResolvedValue({
      ok: true,
      value: [item],
    });
    const view = renderApp('/app/classes/class-a/assignments/assignment-a');
    const block = (await screen.findAllByRole('listitem'))[0]!;
    fireEvent.click(
      within(block).getByRole('button', { name: 'Edit block 1' }),
    );
    fireEvent.change(screen.getByLabelText('Problems'), {
      target: { value: '7' },
    });
    expect(screen.getByText('Unsaved changes')).toBeVisible();
    expect(screen.getByText('1 block · 5 problems total')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }));
    expect(
      screen.getByRole('heading', { name: 'New practice block' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Problems')).toHaveValue(5);
    expect(screen.getByText('1 block · 5 problems total')).toBeVisible();
    expect(updateAssignmentItem).not.toHaveBeenCalled();
    expect(screen.getByText('5 problems')).toBeVisible();
    view.unmount();
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

  it('shows authorized aggregate, activity, position, and student analytics', async () => {
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
    vi.mocked(getAssignmentAnalytics).mockResolvedValueOnce({
      ok: true,
      value: assignmentAnalytics,
    });
    renderApp('/app/classes/class-a/assignments/assignment-a');
    const section = await screen.findByRole('region', {
      name: 'Assignment analytics',
    });
    expect(
      await within(section).findByText('student-a@example.test'),
    ).toBeVisible();
    expect(within(section).getByText('0 / 5')).toBeVisible();
    expect(within(section).getByText('Not started')).toBeVisible();
    expect(within(section).getByText('2 / 5')).toBeVisible();
    expect(within(section).getByText('In progress')).toBeVisible();
    expect(within(section).getAllByText('Completed')).toHaveLength(3);
    expect(within(section).getByText('U-substitution')).toBeVisible();
    expect(within(section).getAllByText('7 / 15')).toHaveLength(2);
    expect(within(section).getAllByText('71.4% (5/7)')).toHaveLength(2);
    expect(
      within(section).getByText(
        'U-substitution: performance by assignment position',
      ),
    ).toBeVisible();
    fireEvent.click(
      within(section).getByText(
        'U-substitution: performance by assignment position',
      ),
    );
    expect(within(section).getByText('Problem 1')).toBeVisible();
    const positionTable = within(
      within(section).getByRole('region', {
        name: 'U-substitution position analytics',
      }),
    ).getByRole('table');
    expect(within(positionTable).getAllByText('2 / 3')).toHaveLength(2);
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
    vi.mocked(getAssignmentAnalytics).mockResolvedValueOnce({
      ok: true,
      value: emptyAnalytics,
    });
    renderApp('/app/classes/class-a/assignments/assignment-a');
    const section = await screen.findByRole('region', {
      name: 'Assignment analytics',
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
    vi.mocked(getAssignmentAnalytics)
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'unexpected', message: 'safe' },
      })
      .mockResolvedValueOnce({ ok: true, value: emptyAnalytics });
    renderApp('/app/classes/class-a/assignments/assignment-a');
    const section = await screen.findByRole('region', {
      name: 'Assignment analytics',
    });
    expect(
      await within(section).findByText(
        'Assignment analytics are unavailable right now.',
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
