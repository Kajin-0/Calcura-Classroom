import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  assignmentActivities,
  isAssignmentActivityKey,
  type AssignmentActivityKey,
} from '../../contracts/assignmentActivities';
import { useWorkspace } from '../workspaces/useWorkspace';
import { getClassById, type ClassSummary } from '../classes/classService';
import {
  addAssignmentItem,
  archiveAssignment,
  discardAssignment,
  getAssignmentById,
  getAssignmentAnalytics,
  listAssignmentItems,
  publishAssignment,
  reactivateAssignment,
  removeAssignmentItem,
  reorderAssignmentItems,
  updateAssignmentItem,
  updateAssignmentMetadata,
  type AssignmentItemSummary,
  type AssignmentStudentAnalytics,
  type AssignmentStatus,
  type AssignmentAnalytics,
  type AssignmentSummary,
} from './assignmentService';
import { formatDueAt, toDateTimeLocal } from './assignmentFormatters';

function isAssignmentStatus(status: string): status is AssignmentStatus {
  return status === 'draft' || status === 'published' || status === 'archived';
}

function localDateTimeToIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function PracticeBlock({
  item,
  index,
  total,
  editable,
  pending,
  editing,
  onEdit,
  onMove,
  onRemove,
}: {
  item: AssignmentItemSummary;
  index: number;
  total: number;
  editable: boolean;
  pending: boolean;
  editing: boolean;
  onEdit: (item: AssignmentItemSummary) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (item: AssignmentItemSummary) => void;
}) {
  const activity = assignmentActivities.find(
    (candidate) => candidate.key === item.activity_key,
  );

  return (
    <li className="practice-block">
      <div className="practice-block-readonly">
        <div className="practice-block-summary">
          <strong>{activity?.label ?? 'Practice activity'}</strong>
          <span>
            {item.problem_count}{' '}
            {item.problem_count === 1 ? 'problem' : 'problems'}
          </span>
          {editing ? (
            <span className="practice-block-editing">Editing</span>
          ) : null}
        </div>
        {editable ? (
          <div className="practice-block-actions">
            <button
              className="inline-link"
              type="button"
              aria-label={`Edit block ${index + 1}`}
              disabled={pending}
              onClick={() => onEdit(item)}
            >
              Edit
            </button>
            <button
              className="inline-link"
              type="button"
              disabled={pending || index === 0}
              onClick={() => onMove(index, -1)}
            >
              Move up
            </button>
            <button
              className="inline-link"
              type="button"
              disabled={pending || index === total - 1}
              onClick={() => onMove(index, 1)}
            >
              Move down
            </button>
            <button
              className="inline-link danger-link"
              type="button"
              disabled={pending}
              onClick={() => onRemove(item)}
            >
              Remove
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function formatAnalyticsPercent(value: number | null) {
  return value === null
    ? '—'
    : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value * 100)}%`;
}

function formatAnalyticsAverage(value: number | null) {
  return value === null
    ? '—'
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
        value,
      );
}

function formatAnalyticsTime(value: number | null) {
  return value === null ? '—' : `${Math.round(value)} s`;
}

function statusLabel(status: AssignmentStudentAnalytics['status']) {
  return status === 'completed'
    ? 'Completed'
    : status === 'in_progress'
      ? 'In progress'
      : 'Not started';
}

function AnalyticsSummary({ analytics }: { analytics: AssignmentAnalytics }) {
  const { summary } = analytics;
  const completed = `${summary.problemsCompleted} / ${summary.totalAssignedProblemSlots}`;
  const accuracy =
    summary.accuracy === null
      ? '—'
      : `${formatAnalyticsPercent(summary.accuracy)} (${summary.problemsCorrect}/${summary.problemsCompleted})`;

  return (
    <>
      <dl className="assignment-analytics-summary">
        <div>
          <dt>Students enrolled</dt>
          <dd>{summary.studentsEnrolled}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>
            {summary.studentsStarted} / {summary.studentsEnrolled}
          </dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>
            {summary.studentsCompleted} / {summary.studentsEnrolled}
            {summary.completionRate === null
              ? ''
              : ` · ${formatAnalyticsPercent(summary.completionRate)}`}
          </dd>
        </div>
        <div>
          <dt>Problem slots completed</dt>
          <dd>{completed}</dd>
        </div>
        <div>
          <dt>Accuracy</dt>
          <dd>{accuracy}</dd>
        </div>
        <div>
          <dt>Avg attempts</dt>
          <dd>{formatAnalyticsAverage(summary.averageAttempts)}</dd>
        </div>
        <div>
          <dt>Avg time</dt>
          <dd>{formatAnalyticsTime(summary.averageTimeSeconds)}</dd>
        </div>
        <div>
          <dt>Surrenders</dt>
          <dd>
            {summary.surrenders}
            {summary.surrenderRate === null
              ? ''
              : ` · ${formatAnalyticsPercent(summary.surrenderRate)}`}
          </dd>
        </div>
      </dl>
      <p className="muted-copy assignment-analytics-definition">
        Started means a terminal result is recorded; unfinished or abandoned
        work is not tracked. Accuracy uses completed results only. Surrendered
        slots count as complete, not correct. Attempts and time are reported by
        Calcura.
      </p>
    </>
  );
}

function AssignmentAnalyticsSection({
  assignmentId,
}: {
  assignmentId: string;
}) {
  const [analytics, setAnalytics] = useState<AssignmentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(
    () => getAssignmentAnalytics(assignmentId),
    [assignmentId],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    const result = await load();
    if (result.ok) setAnalytics(result.value);
    else setError(true);
    setLoading(false);
  }, [load]);

  useEffect(() => {
    let current = true;
    void load().then((result) => {
      if (!current) return;
      if (result.ok) setAnalytics(result.value);
      else setError(true);
      setLoading(false);
    });
    return () => {
      current = false;
    };
  }, [load]);

  return (
    <section
      className="assignment-content-section assignment-analytics-section"
      aria-labelledby="assignment-analytics-title"
    >
      <div className="assignment-form-heading">
        <div>
          <h2 id="assignment-analytics-title">Assignment analytics</h2>
          <p className="muted-copy">
            Completion and performance from terminal results for assigned
            problem slots.
          </p>
        </div>
        <button
          className="text-button"
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {loading ? (
        <p className="list-status" role="status">
          Loading assignment analytics…
        </p>
      ) : null}
      {error ? (
        <div className="inline-state" role="alert">
          <p>Assignment analytics are unavailable right now.</p>
          <button
            className="text-button"
            type="button"
            onClick={() => void refresh()}
          >
            Retry
          </button>
        </div>
      ) : null}
      {!loading && !error && analytics ? (
        <>
          <AnalyticsSummary analytics={analytics} />
          {analytics.summary.studentsEnrolled === 0 ? (
            <p className="section-empty">
              No active students are enrolled in this class yet.
            </p>
          ) : null}
          {analytics.summary.studentsEnrolled > 0 &&
          analytics.summary.problemsCompleted === 0 ? (
            <p className="section-empty">No completed problems yet.</p>
          ) : null}
          {analytics.activities.length > 0 ? (
            <section
              className="assignment-analytics-subsection"
              aria-labelledby="assignment-activity-analytics-title"
            >
              <h3 id="assignment-activity-analytics-title">Practice blocks</h3>
              <div
                className="assignment-analytics-table-scroll"
                role="region"
                aria-label="Practice block analytics"
                tabIndex={0}
              >
                <table className="assignment-analytics-table">
                  <thead>
                    <tr>
                      <th scope="col">Practice block</th>
                      <th scope="col">Completed slots</th>
                      <th scope="col">Accuracy</th>
                      <th scope="col">Avg attempts</th>
                      <th scope="col">Avg time</th>
                      <th scope="col">Surrenders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.activities.map((activity) => (
                      <tr key={activity.assignmentItemId}>
                        <th scope="row">
                          <span>{activity.activityLabel}</span>
                          <small>
                            {activity.problemCount} assigned problems
                          </small>
                        </th>
                        <td>
                          {activity.problemsCompleted} /{' '}
                          {activity.assignedProblemSlots}
                        </td>
                        <td>
                          {activity.accuracy === null
                            ? '—'
                            : `${formatAnalyticsPercent(activity.accuracy)} (${activity.problemsCorrect}/${activity.problemsCompleted})`}
                        </td>
                        <td>
                          {formatAnalyticsAverage(activity.averageAttempts)}
                        </td>
                        <td>
                          {formatAnalyticsTime(activity.averageTimeSeconds)}
                        </td>
                        <td>
                          {activity.surrenders}
                          {activity.surrenderRate === null
                            ? ''
                            : ` · ${formatAnalyticsPercent(activity.surrenderRate)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="assignment-position-breakdown">
                {analytics.activities.map((activity) => (
                  <details key={activity.assignmentItemId}>
                    <summary>
                      {activity.activityLabel}: performance by assignment
                      position
                    </summary>
                    <div
                      className="assignment-analytics-table-scroll"
                      role="region"
                      aria-label={`${activity.activityLabel} position analytics`}
                      tabIndex={0}
                    >
                      <table className="assignment-analytics-table">
                        <thead>
                          <tr>
                            <th scope="col">Assignment position</th>
                            <th scope="col">Completed</th>
                            <th scope="col">Accuracy</th>
                            <th scope="col">Avg attempts</th>
                            <th scope="col">Avg time</th>
                            <th scope="col">Surrenders</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activity.problemPositions.map((position) => (
                            <tr key={position.problemOrdinal}>
                              <th scope="row">
                                Problem {position.problemOrdinal}
                              </th>
                              <td>
                                {position.problemsCompleted} /{' '}
                                {analytics.summary.studentsEnrolled}
                              </td>
                              <td>
                                {position.accuracy === null
                                  ? '—'
                                  : `${formatAnalyticsPercent(position.accuracy)} (${position.problemsCorrect}/${position.problemsCompleted})`}
                              </td>
                              <td>
                                {formatAnalyticsAverage(
                                  position.averageAttempts,
                                )}
                              </td>
                              <td>
                                {formatAnalyticsTime(
                                  position.averageTimeSeconds,
                                )}
                              </td>
                              <td>{position.surrenders}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="muted-copy">
                      Assignment position is not a shared generated problem;
                      Calcura may give students different expressions at the
                      same position.
                    </p>
                  </details>
                ))}
              </div>
            </section>
          ) : null}
          {analytics.students.length > 0 ? (
            <section
              className="assignment-analytics-subsection"
              aria-labelledby="assignment-student-analytics-title"
            >
              <h3 id="assignment-student-analytics-title">Students</h3>
              <div
                className="assignment-analytics-table-scroll"
                role="region"
                aria-label="Enrolled student analytics"
                tabIndex={0}
              >
                <table className="assignment-analytics-table">
                  <thead>
                    <tr>
                      <th scope="col">Student</th>
                      <th scope="col">Progress</th>
                      <th scope="col">Accuracy</th>
                      <th scope="col">Avg attempts</th>
                      <th scope="col">Avg time</th>
                      <th scope="col">Surrenders</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.students.map((student) => (
                      <tr key={student.studentUserId}>
                        <th scope="row">{student.email || 'Student'}</th>
                        <td>
                          {student.completedProblemCount} /{' '}
                          {student.totalProblemCount}
                          {student.lastActivityAt ? (
                            <small>
                              Last activity{' '}
                              <time dateTime={student.lastActivityAt}>
                                {new Intl.DateTimeFormat(undefined, {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                }).format(new Date(student.lastActivityAt))}
                              </time>
                            </small>
                          ) : null}
                        </td>
                        <td>
                          {student.accuracy === null
                            ? '—'
                            : `${formatAnalyticsPercent(student.accuracy)} (${student.problemsCorrect}/${student.completedProblemCount})`}
                        </td>
                        <td>
                          {formatAnalyticsAverage(student.averageAttempts)}
                        </td>
                        <td>
                          {formatAnalyticsTime(student.averageTimeSeconds)}
                        </td>
                        <td>
                          {student.surrenders}
                          {student.surrenderRate === null
                            ? ''
                            : ` · ${formatAnalyticsPercent(student.surrenderRate)}`}
                        </td>
                        <td>{statusLabel(student.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function AssignmentBuilder({
  classItem,
  initialAssignment,
  initialItems,
  initialItemsError,
}: {
  classItem: ClassSummary;
  initialAssignment: AssignmentSummary;
  initialItems: AssignmentItemSummary[];
  initialItemsError: boolean;
}) {
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState(initialAssignment);
  const [items, setItems] = useState<AssignmentItemSummary[]>(initialItems);
  const [title, setTitle] = useState(initialAssignment.title);
  const [dueAt, setDueAt] = useState(toDateTimeLocal(initialAssignment.due_at));
  const [activityKey, setActivityKey] = useState<AssignmentActivityKey>(
    assignmentActivities[0].key,
  );
  const [problemCount, setProblemCount] = useState('5');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemLoadError, setItemLoadError] = useState(initialItemsError);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [confirmAction, setConfirmAction] = useState<
    'publish' | 'archive' | 'discard' | null
  >(null);

  const loadItems = useCallback(async () => {
    setLoadingItems(true);
    const result = await listAssignmentItems(initialAssignment.id);
    if (result.ok) {
      setItems(result.value);
      setItemLoadError(false);
    } else {
      setItemLoadError(true);
    }
    setLoadingItems(false);
  }, [initialAssignment.id]);

  useEffect(() => {
    document.title = `${assignment.title} · Calcura Classroom`;
  }, [assignment.title]);

  const editable = assignment.status === 'draft';
  const editingItem = items.find((item) => item.id === editingItemId) ?? null;
  const editingIndex = editingItem
    ? items.findIndex((item) => item.id === editingItem.id)
    : -1;
  const parsedProblemCount = Number(problemCount);
  const editorHasValidCount =
    Number.isInteger(parsedProblemCount) &&
    parsedProblemCount >= 1 &&
    parsedProblemCount <= 20;
  const editorHasValidActivity = assignmentActivities.some(
    (activity) => activity.key === activityKey,
  );
  const editorHasChanges = editingItem
    ? activityKey !== editingItem.activity_key ||
      parsedProblemCount !== editingItem.problem_count
    : false;

  const resetEditor = () => {
    setEditingItemId(null);
    setActivityKey(assignmentActivities[0].key);
    setProblemCount('5');
  };

  const editBlock = (item: AssignmentItemSummary) => {
    if (!isAssignmentActivityKey(item.activity_key)) return;
    setEditingItemId(item.id);
    setActivityKey(item.activity_key);
    setProblemCount(String(item.problem_count));
  };

  const saveMetadata = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const normalizedTitle = title.trim();
    if (!normalizedTitle || normalizedTitle.length > 160) {
      setError('Enter an assignment title between 1 and 160 characters.');
      return;
    }
    const normalizedDueAt = localDateTimeToIso(dueAt);
    if (normalizedDueAt === undefined) {
      setError('Enter a valid due date and time.');
      return;
    }
    setPending(true);
    setError('');
    const result = await updateAssignmentMetadata(assignment.id, {
      title: normalizedTitle,
      dueAt: normalizedDueAt,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setAssignment(result.value);
    setTitle(result.value.title);
    setDueAt(toDateTimeLocal(result.value.due_at));
  };

  const addBlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editable || pending) return;
    const count = Number(problemCount);
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      setError('Choose between 1 and 20 problems for each block.');
      return;
    }
    setPending(true);
    setError('');
    const result = await addAssignmentItem({
      assignmentId: assignment.id,
      activityKey,
      problemCount: count,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setItems((current) =>
      [...current, result.value].sort((a, b) => a.position - b.position),
    );
    setActivityKey(assignmentActivities[0].key);
    setProblemCount('5');
  };

  const saveBlock = async (
    item: AssignmentItemSummary,
    key: AssignmentActivityKey,
    count: number,
  ) => {
    if (!editable || pending) return;
    setPending(true);
    setError('');
    const result = await updateAssignmentItem(item.id, {
      activityKey: key,
      problemCount: count,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setItems((current) =>
      current.map((existing) =>
        existing.id === item.id ? result.value : existing,
      ),
    );
    resetEditor();
  };

  const moveBlock = async (index: number, direction: -1 | 1) => {
    if (!editable || pending) return;
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    const currentItem = reordered[index];
    const targetItem = reordered[target];
    if (!currentItem || !targetItem) return;
    reordered[index] = targetItem;
    reordered[target] = currentItem;
    setPending(true);
    setError('');
    const result = await reorderAssignmentItems(
      assignment.id,
      reordered.map((item) => item.id),
    );
    if (!result.ok) {
      setPending(false);
      setError(result.error.message);
      return;
    }
    setItems(reordered.map((item, position) => ({ ...item, position })));
    setPending(false);
  };

  const removeBlock = async (item: AssignmentItemSummary) => {
    if (!editable || pending) return;
    setPending(true);
    setError('');
    const result = await removeAssignmentItem(item.id);
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setItems((current) =>
      current.filter((candidate) => candidate.id !== item.id),
    );
    if (editingItemId === item.id) resetEditor();
  };

  const runConfirmation = async () => {
    if (!confirmAction || pending) return;
    const action = confirmAction;
    setPending(true);
    setError('');
    let message: string | null = null;
    if (action === 'publish') {
      const result = await publishAssignment(assignment.id);
      if (result.ok) setAssignment(result.value);
      else message = result.error.message;
    } else if (action === 'archive') {
      const result = await archiveAssignment(assignment.id);
      if (result.ok) setAssignment(result.value);
      else message = result.error.message;
    } else {
      const result = await discardAssignment(assignment.id);
      if (result.ok) {
        navigate(`/app/classes/${classItem.id}`, { replace: true });
      } else {
        message = result.error.message;
      }
    }
    setPending(false);
    setConfirmAction(null);
    if (message) setError(message);
  };

  const reactivate = async () => {
    if (pending) return;
    setPending(true);
    setError('');
    const result = await reactivateAssignment(assignment.id);
    setPending(false);
    if (!result.ok) setError(result.error.message);
    else setAssignment(result.value);
  };

  const totalProblemCount = items.reduce(
    (total, item) => total + item.problem_count,
    0,
  );

  return (
    <section
      className="workspace-content assignment-page"
      aria-labelledby="assignment-page-title"
    >
      <Link className="back-link" to={`/app/classes/${classItem.id}`}>
        ← {classItem.name}
      </Link>
      <div className="assignment-page-heading">
        <p className="eyebrow">
          Assignment ·{' '}
          <span
            className={`assignment-status assignment-status-${assignment.status}`}
          >
            {assignment.status}
          </span>
        </p>
        <h1 id="assignment-page-title">{assignment.title}</h1>
      </div>

      {error && (
        <p className="form-error assignment-feedback" role="alert">
          {error}
        </p>
      )}

      <form
        className="assignment-form assignment-metadata-form"
        onSubmit={(event) => void saveMetadata(event)}
      >
        <div className="assignment-form-heading">
          <h2>Details</h2>
          <span className="muted-copy">
            {assignment.published_at
              ? `Published ${formatDueAt(assignment.published_at)}`
              : 'Draft'}
          </span>
        </div>
        <label htmlFor="edit-assignment-title">Title</label>
        <input
          id="edit-assignment-title"
          value={title}
          maxLength={160}
          onChange={(event) => setTitle(event.target.value)}
          disabled={pending}
          required
        />
        <label htmlFor="edit-assignment-due">
          Due date and time <span className="optional-label">Optional</span>
        </label>
        <input
          id="edit-assignment-due"
          type="datetime-local"
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
          disabled={pending}
        />
        <p className="field-hint">Due date: {formatDueAt(assignment.due_at)}</p>
        <button
          className="button button-quiet"
          type="submit"
          disabled={
            pending ||
            ((!title.trim() || title.trim() === assignment.title) &&
              dueAt === toDateTimeLocal(assignment.due_at))
          }
        >
          {pending ? 'Saving…' : 'Save details'}
        </button>
      </form>

      <section
        className="assignment-content-section"
        aria-labelledby="practice-content-title"
      >
        <div className="assignment-form-heading">
          <div>
            <h2 id="practice-content-title">Practice blocks</h2>
            <p className="muted-copy">
              Each block asks Calcura to generate the selected type of practice
              later.
            </p>
            <p className="muted-copy" role="status" aria-live="polite">
              {items.length} {items.length === 1 ? 'block' : 'blocks'} ·{' '}
              {totalProblemCount}{' '}
              {totalProblemCount === 1 ? 'problem' : 'problems'} total
            </p>
          </div>
          {!editable && (
            <span className="content-locked-label">Content locked</span>
          )}
        </div>
        {editable && !itemLoadError && (
          <form
            className="add-block-form"
            onSubmit={(event) => {
              if (editingItem) {
                event.preventDefault();
                void saveBlock(editingItem, activityKey, parsedProblemCount);
              } else {
                void addBlock(event);
              }
            }}
          >
            <h3>
              {editingItem
                ? `Edit practice block ${editingIndex + 1}`
                : 'New practice block'}
            </h3>
            <p
              className="muted-copy practice-block-editor-status"
              aria-live="polite"
            >
              {editingItem
                ? editorHasChanges
                  ? 'Unsaved changes'
                  : 'Editing an existing assignment block.'
                : 'New block · not yet part of the assignment.'}
            </p>
            <div className="practice-block-fields">
              <label htmlFor="block-editor-activity">
                Practice activity
                <select
                  id="block-editor-activity"
                  value={activityKey}
                  onChange={(event) =>
                    setActivityKey(event.target.value as AssignmentActivityKey)
                  }
                  disabled={pending}
                >
                  {assignmentActivities.map((activity) => (
                    <option key={activity.key} value={activity.key}>
                      {activity.label}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="block-editor-count">
                Problems
                <input
                  id="block-editor-count"
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={problemCount}
                  onChange={(event) => setProblemCount(event.target.value)}
                  disabled={pending}
                />
              </label>
            </div>
            <div className="practice-block-actions">
              <button
                className="button button-quiet"
                type="submit"
                disabled={
                  pending ||
                  !editorHasValidActivity ||
                  !editorHasValidCount ||
                  (editingItem !== null && !editorHasChanges)
                }
              >
                {editingItem ? 'Save changes' : 'Add block to assignment'}
              </button>
              {editingItem ? (
                <button
                  className="inline-link"
                  type="button"
                  disabled={pending}
                  onClick={resetEditor}
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        )}
        {loadingItems ? (
          <p className="list-status" role="status">
            Loading practice blocks…
          </p>
        ) : itemLoadError ? (
          <div className="inline-state">
            <p>Practice blocks are unavailable.</p>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setLoadingItems(true);
                setItemLoadError(false);
                void loadItems();
              }}
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="section-empty">No practice blocks yet.</p>
        ) : (
          <ol className="practice-block-list">
            {items.map((item, index) => (
              <PracticeBlock
                key={item.id}
                item={item}
                index={index}
                total={items.length}
                editable={editable}
                pending={pending}
                editing={item.id === editingItemId}
                onEdit={editBlock}
                onMove={(current, direction) =>
                  void moveBlock(current, direction)
                }
                onRemove={(target) => void removeBlock(target)}
              />
            ))}
          </ol>
        )}
      </section>

      {assignment.status !== 'draft' ? (
        <AssignmentAnalyticsSection assignmentId={assignment.id} />
      ) : null}

      <section
        className="assignment-lifecycle-section"
        aria-labelledby="assignment-lifecycle-title"
      >
        <h2 id="assignment-lifecycle-title">Assignment status</h2>
        {assignment.status === 'draft' ? (
          <div className="lifecycle-actions">
            <p className="muted-copy">
              Publishing freezes the practice blocks. Students can access this
              assignment when the Classroom schema is deployed and the Calcura
              Classroom feature is enabled.
            </p>
            <button
              className="button button-primary"
              type="button"
              disabled={
                pending || loadingItems || itemLoadError || items.length === 0
              }
              onClick={() => setConfirmAction('publish')}
            >
              Publish assignment
            </button>
            <button
              className="button button-quiet danger-text-button"
              type="button"
              disabled={pending}
              onClick={() => setConfirmAction('discard')}
            >
              Discard draft
            </button>
          </div>
        ) : assignment.status === 'published' ? (
          <div className="lifecycle-actions">
            <p className="muted-copy">
              This assignment is published. Its practice blocks cannot be
              changed.
            </p>
            <button
              className="button button-quiet"
              type="button"
              disabled={pending}
              onClick={() => setConfirmAction('archive')}
            >
              Archive assignment
            </button>
          </div>
        ) : (
          <div className="lifecycle-actions">
            <p className="muted-copy">
              This assignment is archived. Its practice content is preserved.
            </p>
            <button
              className="button button-primary"
              type="button"
              disabled={pending}
              onClick={() => void reactivate()}
            >
              Reactivate assignment
            </button>
          </div>
        )}
        {confirmAction && (
          <div
            className="archive-confirmation assignment-confirmation"
            role="group"
            aria-labelledby="assignment-confirm-title"
          >
            <h3 id="assignment-confirm-title">
              {confirmAction === 'publish'
                ? 'Publish this assignment?'
                : confirmAction === 'archive'
                  ? 'Archive this assignment?'
                  : 'Discard this draft?'}
            </h3>
            <p>
              {confirmAction === 'publish'
                ? 'Publishing permanently locks the practice blocks. You can still edit the title and due date.'
                : confirmAction === 'archive'
                  ? 'This preserves the assignment and its locked practice content.'
                  : 'This permanently deletes the draft and all of its practice blocks.'}
            </p>
            <div className="form-actions">
              <button
                className={
                  confirmAction === 'discard'
                    ? 'button button-danger'
                    : 'button button-primary'
                }
                type="button"
                disabled={pending}
                onClick={() => void runConfirmation()}
              >
                {pending
                  ? 'Working…'
                  : confirmAction === 'publish'
                    ? 'Publish assignment'
                    : confirmAction === 'archive'
                      ? 'Archive assignment'
                      : 'Discard draft'}
              </button>
              <button
                className="button button-quiet"
                type="button"
                disabled={pending}
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}

export function AssignmentBuilderPage() {
  const { classId = '', assignmentId = '' } = useParams();
  const { workspace } = useWorkspace();
  const [classItem, setClassItem] = useState<ClassSummary | null>(null);
  const [assignment, setAssignment] = useState<AssignmentSummary | null>(null);
  const [initialItems, setInitialItems] = useState<AssignmentItemSummary[]>([]);
  const [initialItemsError, setInitialItemsError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!workspace) return undefined;
    let active = true;
    void Promise.all([
      getClassById(classId),
      getAssignmentById(assignmentId),
    ]).then(async ([classResult, assignmentResult]) => {
      if (!active) return;
      if (
        !classResult.ok ||
        !assignmentResult.ok ||
        classResult.value.workspace_id !== workspace.id ||
        assignmentResult.value.class_id !== classId ||
        !isAssignmentStatus(assignmentResult.value.status)
      ) {
        setUnavailable(true);
      } else {
        const itemsResult = await listAssignmentItems(assignmentId);
        if (!active) return;
        setClassItem(classResult.value);
        setAssignment(assignmentResult.value);
        setInitialItems(itemsResult.ok ? itemsResult.value : []);
        setInitialItemsError(!itemsResult.ok);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [assignmentId, classId, revision, workspace]);

  if (loading)
    return (
      <section className="workspace-content" role="status">
        Loading assignment…
      </section>
    );
  if (unavailable || !classItem || !assignment) {
    return (
      <section className="workspace-content unavailable-state">
        <h1>This assignment is unavailable.</h1>
        <Link className="back-link" to="/app">
          Back to classes
        </Link>
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setLoading(true);
            setUnavailable(false);
            setRevision((value) => value + 1);
          }}
        >
          Retry
        </button>
      </section>
    );
  }
  return (
    <AssignmentBuilder
      classItem={classItem}
      initialAssignment={assignment}
      initialItems={initialItems}
      initialItemsError={initialItemsError}
    />
  );
}
