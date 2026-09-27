import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from '../../src/features/dashboard/DashboardPage';
import { getWorkspaceDashboard } from '../../src/features/dashboard/dashboardService';
import { WorkspaceContext } from '../../src/features/workspaces/WorkspaceContext';
import type { WorkspaceDashboard } from '../../src/features/dashboard/dashboardService';

vi.mock('../../src/features/dashboard/dashboardService', () => ({
  getWorkspaceDashboard: vi.fn(),
}));

const workspaceId = '11111111-1111-4111-8111-111111111111';
const classId = '22222222-2222-4222-8222-222222222222';
const assignmentId = '33333333-3333-4333-8333-333333333333';

const empty: WorkspaceDashboard = {
  summary: {
    activeClasses: 0,
    students: 0,
    activeAssignments: 0,
    studentAssignmentOpportunities: 0,
    studentsCompleted: 0,
    completionRate: null,
    problemsCompleted: 0,
    problemsCorrect: 0,
    accuracy: null,
  },
  classes: [],
  assignments: [],
  activities: [],
};
const populated: WorkspaceDashboard = {
  summary: {
    activeClasses: 1,
    students: 2,
    activeAssignments: 1,
    studentAssignmentOpportunities: 2,
    studentsCompleted: 1,
    completionRate: 0.5,
    problemsCompleted: 3,
    problemsCorrect: 2,
    accuracy: 2 / 3,
  },
  classes: [
    {
      classId,
      name: 'Calculus I',
      studentsEnrolled: 2,
      activeAssignments: 1,
      studentAssignmentOpportunities: 2,
      studentsCompleted: 1,
      completionRate: 0.5,
      problemsCompleted: 3,
      problemsCorrect: 2,
      accuracy: 2 / 3,
      lastActivityAt: '2026-09-27T12:00:00Z',
    },
  ],
  assignments: [
    {
      assignmentId,
      classId,
      title: 'Integration practice',
      dueAt: null,
      publishedAt: '2026-09-26T12:00:00Z',
      totalProblemCount: 2,
      studentsEnrolled: 2,
      studentsStarted: 2,
      studentsCompleted: 1,
      completionRate: 0.5,
      problemsCompleted: 3,
      problemsCorrect: 2,
      accuracy: 2 / 3,
      averageAttempts: 2,
      surrenders: 1,
      lastActivityAt: '2026-09-27T12:00:00Z',
    },
  ],
  activities: [
    {
      activityKey: 'integration.basic_trig.v1',
      label: 'Basic trigonometric integration',
      practiceBlocks: 1,
      problemsCompleted: 3,
      problemsCorrect: 2,
      accuracy: 2 / 3,
      averageAttempts: 2,
      surrenders: 1,
      surrenderRate: 1 / 3,
    },
  ],
};

function renderDashboard() {
  return render(
    <WorkspaceContext.Provider
      value={{
        workspace: {
          id: workspaceId,
          workspace_type: 'personal',
          name: 'Personal workspace',
          status: 'active',
        },
        loading: false,
        error: null,
        retry: vi.fn(),
      }}
    >
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </WorkspaceContext.Provider>,
  );
}

describe('teacher dashboard', () => {
  beforeEach(() => vi.resetAllMocks());

  it('holds structure while the single dashboard request loads', async () => {
    vi.mocked(getWorkspaceDashboard).mockReturnValue(new Promise(() => {}));
    renderDashboard();
    expect(
      await screen.findByRole('status', { name: 'Loading dashboard' }),
    ).toBeVisible();
    expect(getWorkspaceDashboard).toHaveBeenCalledExactlyOnceWith(workspaceId);
  });

  it('gives a useful empty state without claiming zero accuracy', async () => {
    vi.mocked(getWorkspaceDashboard).mockResolvedValue({
      ok: true,
      value: empty,
    });
    renderDashboard();
    expect(
      await screen.findByRole('heading', { name: 'No classes yet' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Create your first class' }),
    ).toBeVisible();
    expect(screen.getByText('—')).toBeVisible();
  });

  it('renders real completion, outcome, class, activity, and assignment sections', async () => {
    vi.mocked(getWorkspaceDashboard).mockResolvedValue({
      ok: true,
      value: populated,
    });
    renderDashboard();
    expect(
      await screen.findByRole('heading', { name: 'Completion by class' }),
    ).toBeVisible();
    const summary = screen
      .getByText('Completion', { selector: 'dt' })
      .closest('.dashboard-kpi');
    expect(within(summary as HTMLElement).getByText('50%')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Outcome quality' }),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Surrendered problems count toward completion, not accuracy.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Technique performance' }),
    ).toBeVisible();
    expect(screen.getByText('Basic trigonometric integration')).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Integration practice/ }),
    ).toHaveAttribute(
      'href',
      `/app/classes/${classId}/assignments/${assignmentId}`,
    );
    expect(screen.getByRole('link', { name: 'All classes →' })).toHaveAttribute(
      'href',
      '/app/classes',
    );
  });

  it('distinguishes published work without student results', async () => {
    vi.mocked(getWorkspaceDashboard).mockResolvedValue({
      ok: true,
      value: {
        ...populated,
        summary: {
          ...populated.summary,
          problemsCompleted: 0,
          problemsCorrect: 0,
          accuracy: null,
        },
        classes: [
          {
            ...populated.classes[0]!,
            problemsCompleted: 0,
            problemsCorrect: 0,
            accuracy: null,
          },
        ],
        assignments: [
          {
            ...populated.assignments[0]!,
            problemsCompleted: 0,
            problemsCorrect: 0,
            accuracy: null,
          },
        ],
      },
    });
    renderDashboard();
    expect(await screen.findByText('No completed problems yet.')).toBeVisible();
  });

  it('guides a teacher with classes but no published assignments', async () => {
    vi.mocked(getWorkspaceDashboard).mockResolvedValue({
      ok: true,
      value: {
        summary: {
          ...empty.summary,
          activeClasses: 1,
          students: 2,
        },
        classes: [
          {
            ...populated.classes[0]!,
            activeAssignments: 0,
            studentAssignmentOpportunities: 0,
            studentsCompleted: 0,
            completionRate: null,
            problemsCompleted: 0,
            problemsCorrect: 0,
            accuracy: null,
            lastActivityAt: null,
          },
        ],
        assignments: [],
        activities: [],
      },
    });
    renderDashboard();
    expect(await screen.findByText('No completion data yet.')).toBeVisible();
    expect(screen.getByText('No published assignments yet.')).toBeVisible();
    expect(screen.getByText('No practice blocks published yet.')).toBeVisible();
  });

  it('shows a recoverable error with a working retry', async () => {
    vi.mocked(getWorkspaceDashboard)
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'unexpected', message: 'Failed' },
      })
      .mockResolvedValueOnce({ ok: true, value: populated });
    renderDashboard();
    expect(
      await screen.findByRole('heading', { name: 'Dashboard unavailable' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('heading', { name: 'Completion by class' }),
    ).toBeVisible();
    expect(getWorkspaceDashboard).toHaveBeenCalledTimes(2);
  });
});
