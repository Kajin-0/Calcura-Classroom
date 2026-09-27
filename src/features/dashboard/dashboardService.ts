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
import type { Database } from '../../types/database.generated';

type Client = SupabaseClient<Database>;

export interface DashboardSummary {
  activeClasses: number;
  students: number;
  activeAssignments: number;
  studentAssignmentOpportunities: number;
  studentsCompleted: number;
  completionRate: number | null;
  problemsCompleted: number;
  problemsCorrect: number;
  accuracy: number | null;
}

export interface DashboardClass {
  classId: string;
  name: string;
  studentsEnrolled: number;
  activeAssignments: number;
  studentAssignmentOpportunities: number;
  studentsCompleted: number;
  completionRate: number | null;
  problemsCompleted: number;
  problemsCorrect: number;
  accuracy: number | null;
  lastActivityAt: string | null;
}

export interface DashboardAssignment {
  assignmentId: string;
  classId: string;
  title: string;
  dueAt: string | null;
  publishedAt: string;
  totalProblemCount: number;
  studentsEnrolled: number;
  studentsStarted: number;
  studentsCompleted: number;
  completionRate: number | null;
  problemsCompleted: number;
  problemsCorrect: number;
  accuracy: number | null;
  averageAttempts: number | null;
  surrenders: number;
  lastActivityAt: string | null;
}

export interface DashboardActivity {
  activityKey: AssignmentActivityKey;
  label: string;
  practiceBlocks: number;
  problemsCompleted: number;
  problemsCorrect: number;
  accuracy: number | null;
  averageAttempts: number | null;
  surrenders: number;
  surrenderRate: number | null;
}

export interface WorkspaceDashboard {
  summary: DashboardSummary;
  classes: DashboardClass[];
  assignments: DashboardAssignment[];
  activities: DashboardActivity[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isMetric = (value: unknown): value is number | null =>
  value === null ||
  (typeof value === 'number' && Number.isFinite(value) && value >= 0);
const isId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const isOptionalTimestamp = (value: unknown): value is string | null =>
  value === null || isTimestamp(value);
const isRatio = (
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

function parseSummary(raw: unknown): DashboardSummary | null {
  if (!isRecord(raw)) return null;
  const activeClasses = raw.active_classes;
  const students = raw.students;
  const activeAssignments = raw.active_assignments;
  const opportunities = raw.student_assignment_opportunities;
  const completedStudents = raw.students_completed;
  const problemsCompleted = raw.problems_completed;
  const problemsCorrect = raw.problems_correct;
  if (
    !isCount(activeClasses) ||
    !isCount(students) ||
    !isCount(activeAssignments) ||
    !isCount(opportunities) ||
    !isCount(completedStudents) ||
    completedStudents > opportunities ||
    !isCount(problemsCompleted) ||
    !isCount(problemsCorrect) ||
    problemsCorrect > problemsCompleted ||
    !isRatio(raw.completion_rate, completedStudents, opportunities) ||
    !isRatio(raw.accuracy, problemsCorrect, problemsCompleted)
  )
    return null;
  return {
    activeClasses,
    students,
    activeAssignments,
    studentAssignmentOpportunities: opportunities,
    studentsCompleted: completedStudents,
    completionRate: raw.completion_rate,
    problemsCompleted,
    problemsCorrect,
    accuracy: raw.accuracy,
  };
}

function parseClass(raw: unknown): DashboardClass | null {
  if (!isRecord(raw)) return null;
  const studentsEnrolled = raw.students_enrolled;
  const activeAssignments = raw.active_assignments;
  const opportunities = raw.student_assignment_opportunities;
  const studentsCompleted = raw.students_completed;
  const problemsCompleted = raw.problems_completed;
  const problemsCorrect = raw.problems_correct;
  if (
    !isId(raw.class_id) ||
    !isText(raw.name) ||
    !isCount(studentsEnrolled) ||
    !isCount(activeAssignments) ||
    !isCount(opportunities) ||
    !isCount(studentsCompleted) ||
    studentsCompleted > opportunities ||
    !isCount(problemsCompleted) ||
    !isCount(problemsCorrect) ||
    problemsCorrect > problemsCompleted ||
    !isRatio(raw.completion_rate, studentsCompleted, opportunities) ||
    !isRatio(raw.accuracy, problemsCorrect, problemsCompleted) ||
    !isOptionalTimestamp(raw.last_activity_at)
  )
    return null;
  return {
    classId: raw.class_id,
    name: raw.name,
    studentsEnrolled,
    activeAssignments,
    studentAssignmentOpportunities: opportunities,
    studentsCompleted,
    completionRate: raw.completion_rate,
    problemsCompleted,
    problemsCorrect,
    accuracy: raw.accuracy,
    lastActivityAt: raw.last_activity_at,
  };
}

function parseAssignment(raw: unknown): DashboardAssignment | null {
  if (!isRecord(raw)) return null;
  const studentsEnrolled = raw.students_enrolled;
  const studentsStarted = raw.students_started;
  const studentsCompleted = raw.students_completed;
  const problemsCompleted = raw.problems_completed;
  const problemsCorrect = raw.problems_correct;
  const surrenders = raw.surrenders;
  if (
    !isId(raw.assignment_id) ||
    !isId(raw.class_id) ||
    !isText(raw.title) ||
    !isOptionalTimestamp(raw.due_at) ||
    !isTimestamp(raw.published_at) ||
    !isCount(raw.total_problem_count) ||
    !isCount(studentsEnrolled) ||
    !isCount(studentsStarted) ||
    studentsStarted > studentsEnrolled ||
    !isCount(studentsCompleted) ||
    studentsCompleted > studentsStarted ||
    !isCount(problemsCompleted) ||
    !isCount(problemsCorrect) ||
    !isCount(surrenders) ||
    problemsCorrect + surrenders !== problemsCompleted ||
    !isRatio(raw.completion_rate, studentsCompleted, studentsEnrolled) ||
    !isRatio(raw.accuracy, problemsCorrect, problemsCompleted) ||
    !isMetric(raw.average_attempts) ||
    (problemsCompleted === 0) !== (raw.average_attempts === null) ||
    !isOptionalTimestamp(raw.last_activity_at)
  )
    return null;
  return {
    assignmentId: raw.assignment_id,
    classId: raw.class_id,
    title: raw.title,
    dueAt: raw.due_at,
    publishedAt: raw.published_at,
    totalProblemCount: raw.total_problem_count,
    studentsEnrolled,
    studentsStarted,
    studentsCompleted,
    completionRate: raw.completion_rate,
    problemsCompleted,
    problemsCorrect,
    accuracy: raw.accuracy,
    averageAttempts: raw.average_attempts,
    surrenders,
    lastActivityAt: raw.last_activity_at,
  };
}

function parseActivity(raw: unknown): DashboardActivity | null {
  if (!isRecord(raw)) return null;
  const key = raw.activity_key;
  const blocks = raw.practice_blocks;
  const completed = raw.problems_completed;
  const correct = raw.problems_correct;
  const surrenders = raw.surrenders;
  if (
    typeof key !== 'string' ||
    !isAssignmentActivityKey(key) ||
    !isCount(blocks) ||
    blocks < 1 ||
    !isCount(completed) ||
    !isCount(correct) ||
    !isCount(surrenders) ||
    correct + surrenders !== completed ||
    !isRatio(raw.accuracy, correct, completed) ||
    !isRatio(raw.surrender_rate, surrenders, completed) ||
    !isMetric(raw.average_attempts) ||
    (completed === 0) !== (raw.average_attempts === null)
  )
    return null;
  const activity = getAssignmentActivity(key);
  if (!activity) return null;
  return {
    activityKey: key,
    label: activity.label,
    practiceBlocks: blocks,
    problemsCompleted: completed,
    problemsCorrect: correct,
    accuracy: raw.accuracy,
    averageAttempts: raw.average_attempts,
    surrenders,
    surrenderRate: raw.surrender_rate,
  };
}

export function parseWorkspaceDashboard(
  value: unknown,
): WorkspaceDashboard | null {
  if (!isRecord(value) || value.schema_version !== 1) return null;
  const summary = parseSummary(value.summary);
  if (
    !summary ||
    !Array.isArray(value.classes) ||
    !Array.isArray(value.assignments) ||
    !Array.isArray(value.activities)
  )
    return null;
  const classes = value.classes.map(parseClass);
  const assignments = value.assignments.map(parseAssignment);
  const activities = value.activities.map(parseActivity);
  if (
    classes.some((row) => row === null) ||
    assignments.some((row) => row === null) ||
    activities.some((row) => row === null)
  )
    return null;
  const validClasses = classes as DashboardClass[];
  const validAssignments = assignments as DashboardAssignment[];
  const validActivities = activities as DashboardActivity[];
  const classIds = new Set(validClasses.map((row) => row.classId));
  if (
    classIds.size !== validClasses.length ||
    new Set(validAssignments.map((row) => row.assignmentId)).size !==
      validAssignments.length ||
    new Set(validActivities.map((row) => row.activityKey)).size !==
      validActivities.length ||
    validAssignments.some((row) => !classIds.has(row.classId)) ||
    summary.activeClasses !== validClasses.length ||
    summary.activeAssignments !== validAssignments.length ||
    summary.studentAssignmentOpportunities !==
      validAssignments.reduce((sum, row) => sum + row.studentsEnrolled, 0) ||
    summary.studentsCompleted !==
      validAssignments.reduce((sum, row) => sum + row.studentsCompleted, 0) ||
    summary.problemsCompleted !==
      validAssignments.reduce((sum, row) => sum + row.problemsCompleted, 0) ||
    summary.problemsCorrect !==
      validAssignments.reduce((sum, row) => sum + row.problemsCorrect, 0)
  )
    return null;
  return {
    summary,
    classes: validClasses,
    assignments: validAssignments,
    activities: validActivities,
  };
}

export async function getWorkspaceDashboard(
  workspaceId: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<WorkspaceDashboard>> {
  if (!isId(workspaceId)) return failure('workspace_not_found');
  if (!client) return failure('not_configured');
  try {
    const { data, error } = await client.rpc('get_workspace_dashboard', {
      p_workspace_id: workspaceId,
    });
    if (error) return { ok: false, error: mapClassroomError(error) };
    const dashboard = parseWorkspaceDashboard(data);
    return dashboard ? { ok: true, value: dashboard } : failure('unexpected');
  } catch (error) {
    return { ok: false, error: mapClassroomError(error) };
  }
}
