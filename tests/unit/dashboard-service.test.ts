import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.generated';
import {
  getWorkspaceDashboard,
  parseWorkspaceDashboard,
} from '../../src/features/dashboard/dashboardService';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const classId = '22222222-2222-4222-8222-222222222222';
const assignmentId = '33333333-3333-4333-8333-333333333333';
const payload = {
  schema_version: 1,
  summary: {
    active_classes: 1,
    students: 2,
    active_assignments: 1,
    student_assignment_opportunities: 2,
    students_completed: 1,
    completion_rate: 0.5,
    problems_completed: 3,
    problems_correct: 2,
    accuracy: 2 / 3,
  },
  classes: [
    {
      class_id: classId,
      name: 'Calculus I',
      students_enrolled: 2,
      active_assignments: 1,
      student_assignment_opportunities: 2,
      students_completed: 1,
      completion_rate: 0.5,
      problems_completed: 3,
      problems_correct: 2,
      accuracy: 2 / 3,
      last_activity_at: '2026-09-27T12:00:00Z',
    },
  ],
  assignments: [
    {
      assignment_id: assignmentId,
      class_id: classId,
      title: 'Integration practice',
      due_at: null,
      published_at: '2026-09-26T12:00:00Z',
      total_problem_count: 2,
      students_enrolled: 2,
      students_started: 2,
      students_completed: 1,
      completion_rate: 0.5,
      problems_completed: 3,
      problems_correct: 2,
      accuracy: 2 / 3,
      average_attempts: 2,
      surrenders: 1,
      last_activity_at: '2026-09-27T12:00:00Z',
    },
  ],
  activities: [
    {
      activity_key: 'integration.basic_trig.v1',
      practice_blocks: 1,
      problems_completed: 3,
      problems_correct: 2,
      accuracy: 2 / 3,
      average_attempts: 2,
      surrenders: 1,
      surrender_rate: 1 / 3,
    },
  ],
};

describe('workspace dashboard response boundary', () => {
  it('accepts a coherent aggregate and resolves activity labels', () => {
    expect(parseWorkspaceDashboard(payload)).toMatchObject({
      summary: { activeClasses: 1, completionRate: 0.5, accuracy: 2 / 3 },
      classes: [{ name: 'Calculus I' }],
      activities: [{ label: 'Basic trigonometric integration' }],
    });
  });

  it('accepts an empty workspace without inventing zero accuracy', () => {
    const empty = {
      schema_version: 1,
      summary: {
        active_classes: 0,
        students: 0,
        active_assignments: 0,
        student_assignment_opportunities: 0,
        students_completed: 0,
        completion_rate: null,
        problems_completed: 0,
        problems_correct: 0,
        accuracy: null,
      },
      classes: [],
      assignments: [],
      activities: [],
    };
    expect(parseWorkspaceDashboard(empty)?.summary.accuracy).toBeNull();
  });

  it('rejects malformed, cross-class, duplicated, or contradictory aggregates', () => {
    expect(
      parseWorkspaceDashboard({ ...payload, schema_version: 2 }),
    ).toBeNull();
    expect(
      parseWorkspaceDashboard({
        ...payload,
        assignments: [{ ...payload.assignments[0], class_id: workspaceId }],
      }),
    ).toBeNull();
    expect(
      parseWorkspaceDashboard({
        ...payload,
        summary: { ...payload.summary, problems_correct: 3 },
      }),
    ).toBeNull();
    expect(
      parseWorkspaceDashboard({
        ...payload,
        classes: [...payload.classes, payload.classes[0]],
      }),
    ).toBeNull();
  });

  it('uses one authorized RPC and safely rejects invalid responses', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: payload, error: null });
    const client = { rpc } as unknown as SupabaseClient<Database>;
    await expect(
      getWorkspaceDashboard(workspaceId, client),
    ).resolves.toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('get_workspace_dashboard', {
      p_workspace_id: workspaceId,
    });
    rpc.mockResolvedValue({ data: { ...payload, classes: [] }, error: null });
    await expect(
      getWorkspaceDashboard(workspaceId, client),
    ).resolves.toMatchObject({ ok: false });
  });
});
