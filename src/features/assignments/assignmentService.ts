import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isAssignmentActivityKey,
  type AssignmentActivityKey,
} from '../../contracts/assignmentActivities';
import { getSupabaseClient } from '../../lib/supabase/client';
import {
  failure,
  mapClassroomError,
  type ServiceResult,
} from '../../lib/supabase/serviceResult';
import type { Database, Tables } from '../../types/database.generated';

type Client = SupabaseClient<Database>;
type AssignmentRow = Tables<'assignments'>;
type AssignmentItemRow = Tables<'assignment_items'>;

export type AssignmentStatus = 'draft' | 'published' | 'archived';
export type AssignmentSummary = Pick<
  AssignmentRow,
  | 'id'
  | 'class_id'
  | 'title'
  | 'due_at'
  | 'status'
  | 'published_at'
  | 'created_at'
  | 'updated_at'
>;
export type AssignmentItemSummary = Pick<
  AssignmentItemRow,
  | 'id'
  | 'assignment_id'
  | 'position'
  | 'activity_contract_version'
  | 'activity_key'
  | 'problem_count'
  | 'created_at'
  | 'updated_at'
>;

export type AssignmentProgressStatus =
  'not_started' | 'in_progress' | 'completed';
export interface AssignmentStudentProgress {
  studentUserId: string;
  email: string | null;
  completedProblemCount: number;
  totalProblemCount: number;
  status: AssignmentProgressStatus;
  lastActivityAt: string | null;
}

const assignmentColumns =
  'id, class_id, title, due_at, status, published_at, created_at, updated_at';
const itemColumns =
  'id, assignment_id, position, activity_contract_version, activity_key, problem_count, created_at, updated_at';

const resolveClient = (client: Client | null): ServiceResult<Client> =>
  client ? { ok: true, value: client } : failure('not_configured');

function validDueAt(dueAt: string | null) {
  return dueAt === null || Number.isFinite(Date.parse(dueAt));
}

function validTitle(title: string) {
  const normalizedTitle = title.trim();
  return normalizedTitle.length > 0 && normalizedTitle.length <= 160
    ? normalizedTitle
    : null;
}

function validProblemCount(count: number) {
  return Number.isInteger(count) && count >= 1 && count <= 20;
}

function mapFailure<T>(error: unknown): ServiceResult<T> {
  return { ok: false, error: mapClassroomError(error) };
}

export async function createAssignment(
  input: { classId: string; title: string; dueAt: string | null },
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<AssignmentSummary>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;
  const title = validTitle(input.title);
  if (!title) return failure('invalid_assignment_title');
  if (!validDueAt(input.dueAt)) return failure('invalid_due_date');

  try {
    const { data, error } = await resolved.value
      .from('assignments')
      .insert({ class_id: input.classId, title, due_at: input.dueAt })
      .select(assignmentColumns)
      .single();
    if (error) return mapFailure(error);
    return { ok: true, value: data };
  } catch (error) {
    return mapFailure(error);
  }
}

export async function listClassAssignments(
  classId: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<AssignmentSummary[]>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;

  try {
    const { data, error } = await resolved.value
      .from('assignments')
      .select(assignmentColumns)
      .eq('class_id', classId)
      .order('updated_at', { ascending: false });
    if (error) return mapFailure(error);
    return { ok: true, value: data };
  } catch (error) {
    return mapFailure(error);
  }
}

export async function getAssignmentById(
  assignmentId: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<AssignmentSummary>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;

  try {
    const { data, error } = await resolved.value
      .from('assignments')
      .select(assignmentColumns)
      .eq('id', assignmentId)
      .maybeSingle();
    if (error) return mapFailure(error);
    if (!data) return failure('assignment_not_found');
    return { ok: true, value: data };
  } catch (error) {
    return mapFailure(error);
  }
}

const isProgressStatus = (value: unknown): value is AssignmentProgressStatus =>
  value === 'not_started' || value === 'in_progress' || value === 'completed';
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

export async function getAssignmentStudentProgress(
  assignmentId: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<AssignmentStudentProgress[]>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;

  try {
    const { data, error } = await resolved.value.rpc(
      'get_assignment_student_progress',
      { p_assignment_id: assignmentId },
    );
    if (error) return mapFailure(error);
    if (!Array.isArray(data)) return failure('unexpected');
    const rows: AssignmentStudentProgress[] = [];
    for (const value of data as unknown[]) {
      if (!value || typeof value !== 'object') return failure('unexpected');
      const row = value as Record<string, unknown>;
      if (
        !isUuid(row.student_user_id) ||
        !(
          typeof row.student_email === 'string' || row.student_email === null
        ) ||
        !Number.isInteger(row.completed_problem_count) ||
        !Number.isInteger(row.total_problem_count) ||
        (row.completed_problem_count as number) < 0 ||
        (row.total_problem_count as number) < 0 ||
        (row.completed_problem_count as number) >
          (row.total_problem_count as number) ||
        !isProgressStatus(row.progress_status) ||
        !(
          typeof row.last_activity_at === 'string' ||
          row.last_activity_at === null
        ) ||
        (typeof row.last_activity_at === 'string' &&
          !Number.isFinite(Date.parse(row.last_activity_at)))
      )
        return failure('unexpected');
      const expectedStatus =
        row.completed_problem_count === 0
          ? 'not_started'
          : row.completed_problem_count === row.total_problem_count
            ? 'completed'
            : 'in_progress';
      if (row.progress_status !== expectedStatus) return failure('unexpected');
      rows.push({
        studentUserId: row.student_user_id,
        email: row.student_email,
        completedProblemCount: row.completed_problem_count as number,
        totalProblemCount: row.total_problem_count as number,
        status: row.progress_status,
        lastActivityAt: row.last_activity_at,
      });
    }
    return { ok: true, value: rows };
  } catch (error) {
    return mapFailure(error);
  }
}

export async function updateAssignmentMetadata(
  assignmentId: string,
  changes: { title?: string; dueAt?: string | null },
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<AssignmentSummary>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;
  const update: Database['public']['Tables']['assignments']['Update'] = {};
  if (changes.title !== undefined) {
    const title = validTitle(changes.title);
    if (!title) return failure('invalid_assignment_title');
    update.title = title;
  }
  if (changes.dueAt !== undefined) {
    if (!validDueAt(changes.dueAt)) return failure('invalid_due_date');
    update.due_at = changes.dueAt;
  }
  if (Object.keys(update).length === 0) return failure('unexpected');

  try {
    const { data, error } = await resolved.value
      .from('assignments')
      .update(update)
      .eq('id', assignmentId)
      .select(assignmentColumns)
      .maybeSingle();
    if (error) return mapFailure(error);
    if (!data) return failure('assignment_not_found');
    return { ok: true, value: data };
  } catch (error) {
    return mapFailure(error);
  }
}

export async function listAssignmentItems(
  assignmentId: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<AssignmentItemSummary[]>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;

  try {
    const { data, error } = await resolved.value
      .from('assignment_items')
      .select(itemColumns)
      .eq('assignment_id', assignmentId)
      .order('position', { ascending: true });
    if (error) return mapFailure(error);
    return { ok: true, value: data };
  } catch (error) {
    return mapFailure(error);
  }
}

export async function addAssignmentItem(
  input: {
    assignmentId: string;
    activityKey: AssignmentActivityKey;
    problemCount: number;
  },
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<AssignmentItemSummary>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;
  if (!isAssignmentActivityKey(input.activityKey)) {
    return failure('invalid_activity_key');
  }
  if (!validProblemCount(input.problemCount)) {
    return failure('invalid_problem_count');
  }

  const current = await listAssignmentItems(input.assignmentId, resolved.value);
  if (!current.ok) return current;
  const position =
    current.value.reduce((max, item) => Math.max(max, item.position), -1) + 1;

  try {
    const { data, error } = await resolved.value
      .from('assignment_items')
      .insert({
        assignment_id: input.assignmentId,
        position,
        activity_contract_version: 1,
        activity_key: input.activityKey,
        problem_count: input.problemCount,
      })
      .select(itemColumns)
      .single();
    if (error) return mapFailure(error);
    return { ok: true, value: data };
  } catch (error) {
    return mapFailure(error);
  }
}

export async function updateAssignmentItem(
  itemId: string,
  changes: {
    activityKey?: AssignmentActivityKey;
    problemCount?: number;
  },
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<AssignmentItemSummary>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;
  const update: Database['public']['Tables']['assignment_items']['Update'] = {};
  if (changes.activityKey !== undefined) {
    if (!isAssignmentActivityKey(changes.activityKey)) {
      return failure('invalid_activity_key');
    }
    update.activity_key = changes.activityKey;
  }
  if (changes.problemCount !== undefined) {
    if (!validProblemCount(changes.problemCount)) {
      return failure('invalid_problem_count');
    }
    update.problem_count = changes.problemCount;
  }
  if (Object.keys(update).length === 0) return failure('unexpected');

  try {
    const { data, error } = await resolved.value
      .from('assignment_items')
      .update(update)
      .eq('id', itemId)
      .select(itemColumns)
      .maybeSingle();
    if (error) return mapFailure(error);
    if (!data) return failure('assignment_not_found');
    return { ok: true, value: data };
  } catch (error) {
    return mapFailure(error);
  }
}

export async function removeAssignmentItem(
  itemId: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<void>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;

  try {
    const { data, error } = await resolved.value
      .from('assignment_items')
      .delete()
      .eq('id', itemId)
      .select('id')
      .maybeSingle();
    if (error) return mapFailure(error);
    if (!data) return failure('assignment_not_found');
    return { ok: true, value: undefined };
  } catch (error) {
    return mapFailure(error);
  }
}

export async function reorderAssignmentItems(
  assignmentId: string,
  itemIds: string[],
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<void>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;
  try {
    const { error } = await resolved.value.rpc('reorder_assignment_items', {
      p_assignment_id: assignmentId,
      p_item_ids: itemIds,
    });
    if (error) return mapFailure(error);
    return { ok: true, value: undefined };
  } catch (error) {
    return mapFailure(error);
  }
}

async function lifecycleResult(
  operation:
    'publish_assignment' | 'archive_assignment' | 'reactivate_assignment',
  assignmentId: string,
  client: Client | null,
): Promise<ServiceResult<AssignmentSummary>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;
  try {
    const { data, error } = await resolved.value.rpc(operation, {
      p_assignment_id: assignmentId,
    });
    if (error) return mapFailure(error);
    const assignment = data?.[0];
    if (!assignment) return failure('assignment_not_found');
    return { ok: true, value: assignment };
  } catch (error) {
    return mapFailure(error);
  }
}

export function publishAssignment(
  assignmentId: string,
  client: Client | null = getSupabaseClient(),
) {
  return lifecycleResult('publish_assignment', assignmentId, client);
}

export function archiveAssignment(
  assignmentId: string,
  client: Client | null = getSupabaseClient(),
) {
  return lifecycleResult('archive_assignment', assignmentId, client);
}

export function reactivateAssignment(
  assignmentId: string,
  client: Client | null = getSupabaseClient(),
) {
  return lifecycleResult('reactivate_assignment', assignmentId, client);
}

export async function discardAssignment(
  assignmentId: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<void>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;
  try {
    const { error } = await resolved.value.rpc('discard_assignment', {
      p_assignment_id: assignmentId,
    });
    if (error) return mapFailure(error);
    return { ok: true, value: undefined };
  } catch (error) {
    return mapFailure(error);
  }
}
