import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getAssignmentActivity,
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

export interface AssignmentAnalyticsSummary {
  studentsEnrolled: number;
  studentsStarted: number;
  studentsCompleted: number;
  completionRate: number | null;
  totalAssignedProblemSlots: number;
  problemsCompleted: number;
  problemsCorrect: number;
  accuracy: number | null;
  averageAttempts: number | null;
  averageTimeSeconds: number | null;
  surrenders: number;
  surrenderRate: number | null;
}

export interface AssignmentProblemPositionAnalytics {
  problemOrdinal: number;
  problemsCompleted: number;
  problemsCorrect: number;
  accuracy: number | null;
  averageAttempts: number | null;
  averageTimeSeconds: number | null;
  surrenders: number;
}

export interface AssignmentActivityAnalytics {
  assignmentItemId: string;
  position: number;
  activityContractVersion: 1;
  activityKey: AssignmentActivityKey;
  activityLabel: string;
  problemCount: number;
  assignedProblemSlots: number;
  problemsCompleted: number;
  problemsCorrect: number;
  accuracy: number | null;
  averageAttempts: number | null;
  averageTimeSeconds: number | null;
  surrenders: number;
  surrenderRate: number | null;
  problemPositions: AssignmentProblemPositionAnalytics[];
}

export interface AssignmentStudentAnalytics extends AssignmentStudentProgress {
  problemsCorrect: number;
  accuracy: number | null;
  averageAttempts: number | null;
  averageTimeSeconds: number | null;
  surrenders: number;
  surrenderRate: number | null;
}

export interface AssignmentAnalytics {
  summary: AssignmentAnalyticsSummary;
  activities: AssignmentActivityAnalytics[];
  students: AssignmentStudentAnalytics[];
}

const assignmentColumns =
  'id, class_id, title, due_at, status, published_at, created_at, updated_at';
const itemColumns =
  'id, assignment_id, position, activity_contract_version, activity_key, problem_count, created_at, updated_at';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;
const isNullableMetric = (value: unknown): value is number | null =>
  value === null ||
  (typeof value === 'number' && Number.isFinite(value) && value >= 0);
const matchesRatio = (
  value: unknown,
  numerator: number,
  denominator: number,
): value is number | null =>
  denominator === 0
    ? value === null
    : typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1 &&
      Math.abs(value - numerator / denominator) < 1e-9;

function parseAnalyticsPosition(
  value: unknown,
  ordinal: number,
  enrolledCount: number,
): AssignmentProblemPositionAnalytics | null {
  if (!isRecord(value)) return null;
  const completed = value.problems_completed;
  const correct = value.problems_correct;
  const surrenders = value.surrenders;
  if (
    value.problem_ordinal !== ordinal ||
    !isCount(completed) ||
    completed > enrolledCount ||
    !isCount(correct) ||
    !isCount(surrenders) ||
    correct + surrenders !== completed ||
    !matchesRatio(value.accuracy, correct, completed) ||
    !isNullableMetric(value.average_attempts) ||
    !isNullableMetric(value.average_time_seconds) ||
    (completed === 0 &&
      (value.average_attempts !== null ||
        value.average_time_seconds !== null)) ||
    (completed > 0 &&
      (value.average_attempts === null || value.average_time_seconds === null))
  )
    return null;
  return {
    problemOrdinal: ordinal,
    problemsCompleted: completed,
    problemsCorrect: correct,
    accuracy: value.accuracy,
    averageAttempts: value.average_attempts,
    averageTimeSeconds: value.average_time_seconds,
    surrenders,
  };
}

export function parseAssignmentAnalytics(
  value: unknown,
): AssignmentAnalytics | null {
  if (!isRecord(value) || value.schema_version !== 1) return null;
  const summary = value.summary;
  if (!isRecord(summary)) return null;

  const studentsEnrolled = summary.students_enrolled;
  const studentsStarted = summary.students_started;
  const studentsCompleted = summary.students_completed;
  const totalAssignedProblemSlots = summary.total_assigned_problem_slots;
  const problemsCompleted = summary.problems_completed;
  const problemsCorrect = summary.problems_correct;
  const surrenders = summary.surrenders;
  if (
    !isCount(studentsEnrolled) ||
    !isCount(studentsStarted) ||
    !isCount(studentsCompleted) ||
    studentsStarted > studentsEnrolled ||
    studentsCompleted > studentsStarted ||
    !isCount(totalAssignedProblemSlots) ||
    !isCount(problemsCompleted) ||
    problemsCompleted > totalAssignedProblemSlots ||
    !isCount(problemsCorrect) ||
    !isCount(surrenders) ||
    problemsCorrect + surrenders !== problemsCompleted ||
    !matchesRatio(
      summary.completion_rate,
      studentsCompleted,
      studentsEnrolled,
    ) ||
    !matchesRatio(summary.accuracy, problemsCorrect, problemsCompleted) ||
    !matchesRatio(summary.surrender_rate, surrenders, problemsCompleted) ||
    !isNullableMetric(summary.average_attempts) ||
    !isNullableMetric(summary.average_time_seconds) ||
    (problemsCompleted === 0 &&
      (summary.average_attempts !== null ||
        summary.average_time_seconds !== null)) ||
    (problemsCompleted > 0 &&
      (summary.average_attempts === null ||
        summary.average_time_seconds === null)) ||
    !Array.isArray(value.activities) ||
    !Array.isArray(value.students)
  )
    return null;

  const students: AssignmentStudentAnalytics[] = [];
  const studentIds = new Set<string>();
  for (const raw of value.students) {
    if (!isRecord(raw)) return null;
    const completed = raw.completed_problem_count;
    const total = raw.total_problem_count;
    const correct = raw.problems_correct;
    const surrendered = raw.surrenders;
    if (
      !isUuid(raw.student_user_id) ||
      studentIds.has(raw.student_user_id) ||
      !(typeof raw.student_email === 'string' || raw.student_email === null) ||
      !isCount(completed) ||
      !isCount(total) ||
      total > totalAssignedProblemSlots ||
      completed > total ||
      !isCount(correct) ||
      !isCount(surrendered) ||
      correct + surrendered !== completed ||
      !matchesRatio(raw.accuracy, correct, completed) ||
      !matchesRatio(raw.surrender_rate, surrendered, completed) ||
      !isNullableMetric(raw.average_attempts) ||
      !isNullableMetric(raw.average_time_seconds) ||
      (completed === 0 &&
        (raw.average_attempts !== null || raw.average_time_seconds !== null)) ||
      (completed > 0 &&
        (raw.average_attempts === null || raw.average_time_seconds === null)) ||
      !isProgressStatus(raw.progress_status) ||
      !(
        typeof raw.last_activity_at === 'string' ||
        raw.last_activity_at === null
      ) ||
      (typeof raw.last_activity_at === 'string' &&
        !Number.isFinite(Date.parse(raw.last_activity_at)))
    )
      return null;
    const expectedStatus =
      completed === 0
        ? 'not_started'
        : total > 0 && completed >= total
          ? 'completed'
          : 'in_progress';
    if (raw.progress_status !== expectedStatus) return null;
    studentIds.add(raw.student_user_id);
    students.push({
      studentUserId: raw.student_user_id,
      email: raw.student_email,
      completedProblemCount: completed,
      totalProblemCount: total,
      status: raw.progress_status,
      lastActivityAt: raw.last_activity_at,
      problemsCorrect: correct,
      accuracy: raw.accuracy,
      averageAttempts: raw.average_attempts,
      averageTimeSeconds: raw.average_time_seconds,
      surrenders: surrendered,
      surrenderRate: raw.surrender_rate,
    });
  }
  if (students.length !== studentsEnrolled) return null;

  const activities: AssignmentActivityAnalytics[] = [];
  const activityIds = new Set<string>();
  let previousPosition = -1;
  for (const raw of value.activities) {
    if (!isRecord(raw)) return null;
    const itemId = raw.assignment_item_id;
    const activityKey = raw.activity_key;
    const problemCount = raw.problem_count;
    const completed = raw.problems_completed;
    const correct = raw.problems_correct;
    const surrendered = raw.surrenders;
    const position = raw.position;
    const assignedSlots = raw.assigned_problem_slots;
    if (
      !isUuid(itemId) ||
      activityIds.has(itemId) ||
      !Number.isInteger(position) ||
      (position as number) < 0 ||
      (position as number) <= previousPosition ||
      raw.activity_contract_version !== 1 ||
      typeof activityKey !== 'string' ||
      !isAssignmentActivityKey(activityKey) ||
      !isCount(problemCount) ||
      problemCount < 1 ||
      problemCount > 20 ||
      !isCount(assignedSlots) ||
      assignedSlots !== problemCount * studentsEnrolled ||
      !isCount(completed) ||
      completed > assignedSlots ||
      !isCount(correct) ||
      !isCount(surrendered) ||
      correct + surrendered !== completed ||
      !matchesRatio(raw.accuracy, correct, completed) ||
      !matchesRatio(raw.surrender_rate, surrendered, completed) ||
      !isNullableMetric(raw.average_attempts) ||
      !isNullableMetric(raw.average_time_seconds) ||
      (completed === 0 &&
        (raw.average_attempts !== null || raw.average_time_seconds !== null)) ||
      (completed > 0 &&
        (raw.average_attempts === null || raw.average_time_seconds === null)) ||
      !Array.isArray(raw.problem_positions) ||
      raw.problem_positions.length !== problemCount
    )
      return null;
    const activity = getAssignmentActivity(activityKey);
    if (!activity) return null;
    const problemPositions: AssignmentProblemPositionAnalytics[] = [];
    for (let index = 0; index < raw.problem_positions.length; index += 1) {
      const parsed = parseAnalyticsPosition(
        raw.problem_positions[index],
        index + 1,
        studentsEnrolled,
      );
      if (!parsed) return null;
      problemPositions.push(parsed);
    }
    if (
      problemPositions.reduce((sum, row) => sum + row.problemsCompleted, 0) !==
        completed ||
      problemPositions.reduce((sum, row) => sum + row.problemsCorrect, 0) !==
        correct ||
      problemPositions.reduce((sum, row) => sum + row.surrenders, 0) !==
        surrendered
    )
      return null;
    activityIds.add(itemId);
    previousPosition = position as number;
    activities.push({
      assignmentItemId: itemId,
      position: position as number,
      activityContractVersion: 1,
      activityKey,
      activityLabel: activity.label,
      problemCount,
      assignedProblemSlots: assignedSlots,
      problemsCompleted: completed,
      problemsCorrect: correct,
      accuracy: raw.accuracy,
      averageAttempts: raw.average_attempts,
      averageTimeSeconds: raw.average_time_seconds,
      surrenders: surrendered,
      surrenderRate: raw.surrender_rate,
      problemPositions,
    });
  }

  const totals = {
    completed: students.reduce(
      (sum, row) => sum + row.completedProblemCount,
      0,
    ),
    correct: students.reduce((sum, row) => sum + row.problemsCorrect, 0),
    surrenders: students.reduce((sum, row) => sum + row.surrenders, 0),
    started: students.filter((row) => row.completedProblemCount > 0).length,
    completedStudents: students.filter((row) => row.status === 'completed')
      .length,
  };
  if (
    totals.completed !== problemsCompleted ||
    totals.correct !== problemsCorrect ||
    totals.surrenders !== surrenders ||
    totals.started !== studentsStarted ||
    totals.completedStudents !== studentsCompleted ||
    students.reduce((sum, row) => sum + row.totalProblemCount, 0) !==
      totalAssignedProblemSlots ||
    activities.reduce((sum, row) => sum + row.assignedProblemSlots, 0) !==
      totalAssignedProblemSlots ||
    activities.reduce((sum, row) => sum + row.problemsCompleted, 0) !==
      problemsCompleted ||
    activities.reduce((sum, row) => sum + row.problemsCorrect, 0) !==
      problemsCorrect ||
    activities.reduce((sum, row) => sum + row.surrenders, 0) !== surrenders
  )
    return null;

  return {
    summary: {
      studentsEnrolled,
      studentsStarted,
      studentsCompleted,
      completionRate: summary.completion_rate,
      totalAssignedProblemSlots,
      problemsCompleted,
      problemsCorrect,
      accuracy: summary.accuracy,
      averageAttempts: summary.average_attempts,
      averageTimeSeconds: summary.average_time_seconds,
      surrenders,
      surrenderRate: summary.surrender_rate,
    },
    activities,
    students,
  };
}

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

export async function getAssignmentAnalytics(
  assignmentId: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<AssignmentAnalytics>> {
  const resolved = resolveClient(client);
  if (!resolved.ok) return resolved;

  try {
    const { data, error } = await resolved.value.rpc(
      'get_assignment_analytics',
      { p_assignment_id: assignmentId },
    );
    if (error) return mapFailure(error);
    const analytics = parseAssignmentAnalytics(data);
    return analytics ? { ok: true, value: analytics } : failure('unexpected');
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
