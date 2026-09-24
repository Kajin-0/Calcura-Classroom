import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database.generated';
import {
  countActiveClassEnrollments,
  createClass,
  getClassById,
  joinClassByCode,
  listWorkspaceClasses,
  renameClass,
  setClassStatus,
} from '../../src/features/classes/classService';
import { ensurePersonalWorkspace } from '../../src/features/workspaces/workspaceService';
import { mapClassroomError } from '../../src/lib/supabase/serviceResult';

const classRow = {
  id: 'class-a',
  workspace_id: 'workspace-a',
  name: 'Algebra',
  status: 'active',
  created_at: '2026-09-24T00:00:00Z',
  updated_at: '2026-09-24T00:00:00Z',
};

function clientMock(overrides: Record<string, unknown> = {}) {
  return {
    rpc: vi.fn(),
    from: vi.fn(),
    ...overrides,
  } as unknown as SupabaseClient<Database>;
}

describe('Classroom database service boundaries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bootstraps a personal workspace without accepting a user ID', async () => {
    const client = clientMock({
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            workspace_id: 'workspace-a',
            workspace_type: 'personal',
            name: 'Personal workspace',
            status: 'active',
          },
        ],
        error: null,
      }),
    });

    await expect(ensurePersonalWorkspace(client)).resolves.toEqual({
      ok: true,
      value: {
        id: 'workspace-a',
        workspace_type: 'personal',
        name: 'Personal workspace',
        status: 'active',
      },
    });
    expect(client.rpc).toHaveBeenCalledWith('ensure_personal_workspace');
    expect(client.rpc).toHaveBeenCalledOnce();
  });

  it('creates a class with only workspace scope and a trimmed name', async () => {
    const builder = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: classRow, error: null }),
    };
    const client = clientMock({ from: vi.fn().mockReturnValue(builder) });

    await expect(
      createClass({ workspaceId: 'workspace-a', name: '  Algebra  ' }, client),
    ).resolves.toEqual({ ok: true, value: classRow });
    expect(client.from).toHaveBeenCalledWith('classes');
    expect(builder.insert).toHaveBeenCalledWith({
      workspace_id: 'workspace-a',
      name: 'Algebra',
    });
    expect(builder.select).not.toHaveBeenCalledWith(
      expect.stringContaining('join_code'),
    );
  });

  it('maps workspace RPC authorization errors without exposing database text', async () => {
    const client = clientMock({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: '42501', message: 'row-level policy detail' },
      }),
    });

    await expect(ensurePersonalWorkspace(client)).resolves.toEqual({
      ok: false,
      error: {
        code: 'not_authorized',
        message: 'You do not have access to this Classroom item.',
      },
    });
  });

  it('rejects an empty class name before contacting Supabase', async () => {
    const client = clientMock();
    await expect(
      createClass({ workspaceId: 'workspace-a', name: '   ' }, client),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_class_name' },
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('loads one permitted class summary and maps an inaccessible class safely', async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: classRow, error: null }),
    };
    const client = clientMock({ from: vi.fn().mockReturnValue(builder) });
    await expect(getClassById('class-a', client)).resolves.toEqual({
      ok: true,
      value: classRow,
    });
    expect(builder.select).toHaveBeenCalledWith(
      'id, workspace_id, name, status, created_at, updated_at',
    );
    expect(builder.eq).toHaveBeenCalledWith('id', 'class-a');

    builder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(getClassById('foreign-class', client)).resolves.toMatchObject({
      ok: false,
      error: { code: 'class_not_found' },
    });
  });

  it('uses an exact filtered head count for active enrollments', async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: undefined,
    };
    Object.assign(builder, {
      then: (resolve: (value: unknown) => unknown) =>
        resolve({ count: 7, error: null }),
    });
    const client = clientMock({ from: vi.fn().mockReturnValue(builder) });

    await expect(
      countActiveClassEnrollments('class-a', client),
    ).resolves.toEqual({
      ok: true,
      value: 7,
    });
    expect(client.from).toHaveBeenCalledWith('class_enrollments');
    expect(builder.select).toHaveBeenCalledWith('class_id', {
      count: 'exact',
      head: true,
    });
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'class_id', 'class-a');
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'status', 'active');
  });

  it('sends only mutable class columns for rename and lifecycle updates', async () => {
    const builder = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: classRow, error: null }),
    };
    const client = clientMock({ from: vi.fn().mockReturnValue(builder) });

    await expect(
      renameClass('class-a', '  Algebra II ', client),
    ).resolves.toMatchObject({
      ok: true,
      value: classRow,
    });
    expect(builder.update).toHaveBeenCalledWith({ name: 'Algebra II' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'class-a');

    await setClassStatus('class-a', 'archived', client);
    expect(builder.update).toHaveBeenLastCalledWith({ status: 'archived' });
    await setClassStatus('class-a', 'active', client);
    expect(builder.update).toHaveBeenLastCalledWith({ status: 'active' });
    expect(builder.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: expect.anything() }),
    );
  });

  it('orders class lists by most recently updated first', async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [classRow], error: null }),
    };
    const client = clientMock({ from: vi.fn().mockReturnValue(builder) });
    await expect(
      listWorkspaceClasses('workspace-a', client),
    ).resolves.toMatchObject({
      ok: true,
      value: [classRow],
    });
    expect(builder.order).toHaveBeenCalledWith('updated_at', {
      ascending: false,
    });
  });

  it('passes join-code formatting to the database normalizer', async () => {
    const client = clientMock({
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            class_id: 'class-a',
            class_name: 'Algebra',
            workspace_id: 'workspace-a',
            enrollment_status: 'active',
          },
        ],
        error: null,
      }),
    });

    await expect(joinClassByCode('  abcde-fghjk  ', client)).resolves.toEqual({
      ok: true,
      value: {
        classId: 'class-a',
        className: 'Algebra',
        workspaceId: 'workspace-a',
        enrollmentStatus: 'active',
      },
    });
    expect(client.rpc).toHaveBeenCalledWith('join_class_by_code', {
      p_code: '  abcde-fghjk  ',
    });
  });

  it('maps rejected join codes to the stable application error', async () => {
    const client = clientMock({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'P0001', message: 'invalid_join_code' },
      }),
    });

    await expect(joinClassByCode('bad-code', client)).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_join_code' },
    });
  });

  it('maps stable database errors without exposing provider details', () => {
    expect(
      mapClassroomError({
        code: 'P0001',
        message: 'class_archived',
      }),
    ).toEqual({
      code: 'class_archived',
      message: 'That class is archived and cannot accept new students.',
    });
    expect(
      mapClassroomError({
        code: 'P0001',
        message: 'private table detail and SQL',
      }),
    ).toEqual({
      code: 'unexpected',
      message: 'We could not complete that request. Try again.',
    });
  });
});
