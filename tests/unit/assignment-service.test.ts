import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.generated';
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

const assignmentRow = {
  id: 'assignment-a',
  class_id: 'class-a',
  title: 'Practice set',
  due_at: null,
  status: 'draft',
  published_at: null,
  created_at: '2026-09-24T00:00:00Z',
  updated_at: '2026-09-24T00:00:00Z',
};
const itemRow = {
  id: 'item-a',
  assignment_id: 'assignment-a',
  position: 0,
  activity_contract_version: 1,
  activity_key: 'integration.basic_trig.v1',
  problem_count: 5,
  created_at: '2026-09-24T00:00:00Z',
  updated_at: '2026-09-24T00:00:00Z',
};

function clientMock(overrides: Record<string, unknown> = {}) {
  return {
    from: vi.fn(),
    rpc: vi.fn(),
    ...overrides,
  } as unknown as SupabaseClient<Database>;
}

describe('assignment service boundaries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a trimmed draft with only teacher-controlled metadata', async () => {
    const builder = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: assignmentRow, error: null }),
    };
    const client = clientMock({ from: vi.fn().mockReturnValue(builder) });
    await expect(
      createAssignment(
        { classId: 'class-a', title: '  Practice set  ', dueAt: null },
        client,
      ),
    ).resolves.toEqual({ ok: true, value: assignmentRow });
    expect(client.from).toHaveBeenCalledWith('assignments');
    expect(builder.insert).toHaveBeenCalledWith({
      class_id: 'class-a',
      title: 'Practice set',
      due_at: null,
    });
    expect(builder.select).toHaveBeenCalledWith(
      'id, class_id, title, due_at, status, published_at, created_at, updated_at',
    );
  });

  it('rejects invalid title and due date before contacting Supabase', async () => {
    const client = clientMock();
    await expect(
      createAssignment(
        { classId: 'class-a', title: '  ', dueAt: null },
        client,
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_assignment_title' },
    });
    await expect(
      createAssignment(
        { classId: 'class-a', title: 'Good title', dueAt: 'not-a-date' },
        client,
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_due_date' },
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('lists assignments within one class and orders by latest update', async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [assignmentRow], error: null }),
    };
    const client = clientMock({ from: vi.fn().mockReturnValue(builder) });
    await expect(listClassAssignments('class-a', client)).resolves.toEqual({
      ok: true,
      value: [assignmentRow],
    });
    expect(builder.eq).toHaveBeenCalledWith('class_id', 'class-a');
    expect(builder.order).toHaveBeenCalledWith('updated_at', {
      ascending: false,
    });
  });

  it('maps inaccessible assignments safely', async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const client = clientMock({ from: vi.fn().mockReturnValue(builder) });
    await expect(
      getAssignmentById('foreign-id', client),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'assignment_not_found' },
    });
  });

  it('updates only title and due date columns', async () => {
    const builder = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: assignmentRow, error: null }),
    };
    const client = clientMock({ from: vi.fn().mockReturnValue(builder) });
    await expect(
      updateAssignmentMetadata(
        'assignment-a',
        { title: '  Revised  ', dueAt: '2026-10-01T12:00:00Z' },
        client,
      ),
    ).resolves.toMatchObject({ ok: true });
    expect(builder.update).toHaveBeenCalledWith({
      title: 'Revised',
      due_at: '2026-10-01T12:00:00Z',
    });
    expect(builder.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        status: expect.anything(),
        class_id: expect.anything(),
      }),
    );
  });

  it('appends the next deterministic position and uses the versioned activity key', async () => {
    const listBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          { ...itemRow, position: 0 },
          { ...itemRow, id: 'item-b', position: 4 },
        ],
        error: null,
      }),
    };
    const insertBuilder = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({ data: { ...itemRow, position: 5 }, error: null }),
    };
    const client = clientMock({
      from: vi
        .fn()
        .mockReturnValueOnce(listBuilder)
        .mockReturnValueOnce(insertBuilder),
    });
    await expect(
      addAssignmentItem(
        {
          assignmentId: 'assignment-a',
          activityKey: 'integration.by_parts.v1',
          problemCount: 5,
        },
        client,
      ),
    ).resolves.toMatchObject({ ok: true, value: { position: 5 } });
    expect(insertBuilder.insert).toHaveBeenCalledWith({
      assignment_id: 'assignment-a',
      position: 5,
      activity_contract_version: 1,
      activity_key: 'integration.by_parts.v1',
      problem_count: 5,
    });
  });

  it('rejects invalid block count and key before mutation', async () => {
    const client = clientMock();
    await expect(
      addAssignmentItem(
        {
          assignmentId: 'assignment-a',
          activityKey: 'integration.basic_trig.v1',
          problemCount: 0,
        },
        client,
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_problem_count' },
    });
    await expect(
      updateAssignmentItem('item-a', { problemCount: 21 }, client),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_problem_count' },
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('orders blocks through the atomic server reorder operation', async () => {
    const client = clientMock({
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    await expect(
      reorderAssignmentItems('assignment-a', ['item-b', 'item-a'], client),
    ).resolves.toEqual({ ok: true, value: undefined });
    expect(client.rpc).toHaveBeenCalledWith('reorder_assignment_items', {
      p_assignment_id: 'assignment-a',
      p_item_ids: ['item-b', 'item-a'],
    });
  });

  it('lists blocks in position order, updates mutable content, and removes a draft block', async () => {
    const listBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [itemRow], error: null }),
    };
    const updateBuilder = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { ...itemRow, problem_count: 8 },
        error: null,
      }),
    };
    const deleteBuilder = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: { id: 'item-a' }, error: null }),
    };
    const client = clientMock({
      from: vi
        .fn()
        .mockReturnValueOnce(listBuilder)
        .mockReturnValueOnce(updateBuilder)
        .mockReturnValueOnce(deleteBuilder),
    });
    await expect(listAssignmentItems('assignment-a', client)).resolves.toEqual({
      ok: true,
      value: [itemRow],
    });
    expect(listBuilder.order).toHaveBeenCalledWith('position', {
      ascending: true,
    });
    await expect(
      updateAssignmentItem('item-a', { problemCount: 8 }, client),
    ).resolves.toMatchObject({ ok: true, value: { problem_count: 8 } });
    expect(updateBuilder.update).toHaveBeenCalledWith({ problem_count: 8 });
    await expect(removeAssignmentItem('item-a', client)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('uses narrow lifecycle RPCs and maps provider errors to stable messages', async () => {
    const published = {
      ...assignmentRow,
      status: 'published',
      published_at: '2026-09-24T00:00:00Z',
    };
    const client = clientMock({
      rpc: vi.fn().mockResolvedValue({ data: [published], error: null }),
    });
    await expect(
      publishAssignment('assignment-a', client),
    ).resolves.toMatchObject({ ok: true, value: published });
    expect(client.rpc).toHaveBeenCalledWith('publish_assignment', {
      p_assignment_id: 'assignment-a',
    });
    await archiveAssignment('assignment-a', client);
    await reactivateAssignment('assignment-a', client);
    await expect(discardAssignment('assignment-a', client)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(client.rpc).toHaveBeenLastCalledWith('discard_assignment', {
      p_assignment_id: 'assignment-a',
    });

    const rejected = clientMock({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'P0001', message: 'assignment_requires_items' },
      }),
    });
    await expect(
      publishAssignment('assignment-a', rejected),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'assignment_requires_items' },
    });
  });

  it('loads only the typed, validated teacher progress RPC response', async () => {
    const row = {
      student_user_id: '11111111-1111-4111-8111-111111111111',
      student_email: 'student@example.test',
      completed_problem_count: 2,
      total_problem_count: 5,
      progress_status: 'in_progress',
      last_activity_at: '2026-09-24T12:00:00Z',
    };
    const client = clientMock({
      rpc: vi.fn().mockResolvedValue({ data: [row], error: null }),
    });
    await expect(
      getAssignmentStudentProgress('assignment-a', client),
    ).resolves.toEqual({
      ok: true,
      value: [
        {
          studentUserId: row.student_user_id,
          email: row.student_email,
          completedProblemCount: 2,
          totalProblemCount: 5,
          status: 'in_progress',
          lastActivityAt: row.last_activity_at,
        },
      ],
    });
    expect(client.rpc).toHaveBeenCalledWith('get_assignment_student_progress', {
      p_assignment_id: 'assignment-a',
    });

    const malformed = clientMock({
      rpc: vi.fn().mockResolvedValue({
        data: [{ ...row, completed_problem_count: 6 }],
        error: null,
      }),
    });
    await expect(
      getAssignmentStudentProgress('assignment-a', malformed),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'unexpected' },
    });
  });
});
