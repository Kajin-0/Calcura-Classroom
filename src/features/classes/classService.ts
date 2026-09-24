import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.generated';
import { getSupabaseClient } from '../../lib/supabase/client';
import {
  failure,
  mapClassroomError,
  type ServiceResult,
} from '../../lib/supabase/serviceResult';

type Client = SupabaseClient<Database>;
type ClassRow = Database['public']['Tables']['classes']['Row'];
type EnrollmentRow = Database['public']['Tables']['class_enrollments']['Row'];

export type ClassSummary = Pick<
  ClassRow,
  'id' | 'workspace_id' | 'name' | 'status' | 'created_at' | 'updated_at'
>;
export type ClassStatus = 'active' | 'archived';
export type EnrollmentSummary = Pick<
  EnrollmentRow,
  'class_id' | 'student_user_id' | 'status' | 'joined_at' | 'updated_at'
>;
export interface JoinedClass {
  classId: string;
  className: string;
  workspaceId: string;
  enrollmentStatus: string;
}

const resolveClient = (client: Client | null): ServiceResult<Client> =>
  client ? { ok: true, value: client } : failure('not_configured');

export async function createClass(
  input: { workspaceId: string; name: string },
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<ClassSummary>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;

  const name = input.name.trim();
  if (name.length < 1 || name.length > 120) {
    return failure('invalid_class_name');
  }

  let response;
  try {
    response = await resolved.value
      .from('classes')
      .insert({ workspace_id: input.workspaceId, name })
      .select('id, workspace_id, name, status, created_at, updated_at')
      .single();
  } catch (error) {
    return { ok: false, error: mapClassroomError(error) };
  }
  const { data, error } = response;
  if (error) return { ok: false, error: mapClassroomError(error) };

  return { ok: true, value: data };
}

export async function listWorkspaceClasses(
  workspaceId: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<ClassSummary[]>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;

  let response;
  try {
    response = await resolved.value
      .from('classes')
      .select('id, workspace_id, name, status, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false });
  } catch (error) {
    return { ok: false, error: mapClassroomError(error) };
  }
  const { data, error } = response;
  if (error) return { ok: false, error: mapClassroomError(error) };

  return { ok: true, value: data };
}

export async function getClassById(
  classId: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<ClassSummary>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;

  let response;
  try {
    response = await resolved.value
      .from('classes')
      .select('id, workspace_id, name, status, created_at, updated_at')
      .eq('id', classId)
      .maybeSingle();
  } catch (error) {
    return { ok: false, error: mapClassroomError(error) };
  }
  const { data, error } = response;
  if (error) return { ok: false, error: mapClassroomError(error) };
  if (!data) return failure('class_not_found');

  return { ok: true, value: data };
}

export async function countActiveClassEnrollments(
  classId: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<number>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;

  let response;
  try {
    response = await resolved.value
      .from('class_enrollments')
      .select('class_id', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('status', 'active');
  } catch (error) {
    return { ok: false, error: mapClassroomError(error) };
  }
  const { count, error } = response;
  if (error) return { ok: false, error: mapClassroomError(error) };

  return { ok: true, value: count ?? 0 };
}

export async function renameClass(
  classId: string,
  name: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<ClassSummary>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;

  const normalizedName = name.trim();
  if (normalizedName.length < 1 || normalizedName.length > 120) {
    return failure('invalid_class_name');
  }

  let response;
  try {
    response = await resolved.value
      .from('classes')
      .update({ name: normalizedName })
      .eq('id', classId)
      .select('id, workspace_id, name, status, created_at, updated_at')
      .maybeSingle();
  } catch (error) {
    return { ok: false, error: mapClassroomError(error) };
  }
  const { data, error } = response;
  if (error) return { ok: false, error: mapClassroomError(error) };
  if (!data) return failure('class_not_found');

  return { ok: true, value: data };
}

export async function setClassStatus(
  classId: string,
  status: ClassStatus,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<ClassSummary>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;

  let response;
  try {
    response = await resolved.value
      .from('classes')
      .update({ status })
      .eq('id', classId)
      .select('id, workspace_id, name, status, created_at, updated_at')
      .maybeSingle();
  } catch (error) {
    return { ok: false, error: mapClassroomError(error) };
  }
  const { data, error } = response;
  if (error) return { ok: false, error: mapClassroomError(error) };
  if (!data) return failure('class_not_found');

  return { ok: true, value: data };
}

export async function getClassJoinCode(
  classId: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<string>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;

  let response;
  try {
    response = await resolved.value.rpc('get_class_join_code', {
      p_class_id: classId,
    });
  } catch (error) {
    return { ok: false, error: mapClassroomError(error) };
  }
  const { data, error } = response;
  if (error) return { ok: false, error: mapClassroomError(error) };
  if (!data) return failure('class_not_found');

  return { ok: true, value: data };
}

export async function joinClassByCode(
  code: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<JoinedClass>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;

  let response;
  try {
    response = await resolved.value.rpc('join_class_by_code', {
      p_code: code,
    });
  } catch (error) {
    return { ok: false, error: mapClassroomError(error) };
  }
  const { data, error } = response;
  if (error) return { ok: false, error: mapClassroomError(error) };
  const joined = data?.[0];
  if (!joined) return failure('class_not_found');

  return {
    ok: true,
    value: {
      classId: joined.class_id,
      className: joined.class_name,
      workspaceId: joined.workspace_id,
      enrollmentStatus: joined.enrollment_status,
    },
  };
}

export async function listMyEnrollments(
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<EnrollmentSummary[]>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;

  let response;
  try {
    response = await resolved.value
      .from('class_enrollments')
      .select('class_id, student_user_id, status, joined_at, updated_at')
      .order('joined_at', { ascending: false });
  } catch (error) {
    return { ok: false, error: mapClassroomError(error) };
  }
  const { data, error } = response;
  if (error) return { ok: false, error: mapClassroomError(error) };

  return { ok: true, value: data };
}
