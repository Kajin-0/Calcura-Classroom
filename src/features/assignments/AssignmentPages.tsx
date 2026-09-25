import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  assignmentActivities,
  type AssignmentActivityKey,
} from '../../contracts/assignmentActivities';
import { useWorkspace } from '../workspaces/useWorkspace';
import { getClassById, type ClassSummary } from '../classes/classService';
import {
  addAssignmentItem,
  archiveAssignment,
  discardAssignment,
  getAssignmentById,
  getAssignmentStudentProgress,
  listAssignmentItems,
  publishAssignment,
  reactivateAssignment,
  removeAssignmentItem,
  reorderAssignmentItems,
  updateAssignmentItem,
  updateAssignmentMetadata,
  type AssignmentItemSummary,
  type AssignmentStudentProgress,
  type AssignmentStatus,
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
  onSave,
  onMove,
  onRemove,
}: {
  item: AssignmentItemSummary;
  index: number;
  total: number;
  editable: boolean;
  pending: boolean;
  onSave: (
    item: AssignmentItemSummary,
    key: AssignmentActivityKey,
    count: number,
  ) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (item: AssignmentItemSummary) => void;
}) {
  const [activityKey, setActivityKey] = useState(item.activity_key);
  const [count, setCount] = useState(String(item.problem_count));

  const activity = assignmentActivities.find(
    (candidate) => candidate.key === item.activity_key,
  );
  const validKey = assignmentActivities.some(
    (candidate) => candidate.key === activityKey,
  );
  const parsedCount = Number(count);
  const validCount =
    Number.isInteger(parsedCount) && parsedCount >= 1 && parsedCount <= 20;
  const changed =
    activityKey !== item.activity_key || parsedCount !== item.problem_count;

  return (
    <li className="practice-block">
      {editable ? (
        <div className="practice-block-editor">
          <div className="practice-block-fields">
            <label>
              Practice activity
              <select
                value={activityKey}
                onChange={(event) => setActivityKey(event.target.value)}
                disabled={pending}
              >
                {assignmentActivities.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Problems
              <input
                type="number"
                min={1}
                max={20}
                step={1}
                value={count}
                onChange={(event) => setCount(event.target.value)}
                disabled={pending}
              />
            </label>
          </div>
          {changed ? (
            <p className="muted-copy" role="status" aria-live="polite">
              Unsaved changes — select Save block to apply.
            </p>
          ) : null}
          <div className="practice-block-actions">
            <button
              className="button button-quiet"
              type="button"
              disabled={pending || !changed || !validKey || !validCount}
              onClick={() =>
                onSave(item, activityKey as AssignmentActivityKey, parsedCount)
              }
            >
              Save block
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
        </div>
      ) : (
        <div className="practice-block-readonly">
          <strong>{activity?.label ?? 'Practice activity'}</strong>
          <span>
            {item.problem_count}{' '}
            {item.problem_count === 1 ? 'problem' : 'problems'}
          </span>
        </div>
      )}
    </li>
  );
}

function AssignmentStudentProgressSection({
  assignmentId,
}: {
  assignmentId: string;
}) {
  const [rows, setRows] = useState<AssignmentStudentProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(
    () => getAssignmentStudentProgress(assignmentId),
    [assignmentId],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    const result = await load();
    if (result.ok) setRows(result.value);
    else setError(true);
    setLoading(false);
  }, [load]);

  useEffect(() => {
    let current = true;
    void load().then((result) => {
      if (!current) return;
      if (result.ok) setRows(result.value);
      else setError(true);
      setLoading(false);
    });
    return () => {
      current = false;
    };
  }, [load]);

  const statusLabel = (status: AssignmentStudentProgress['status']) =>
    status === 'completed'
      ? 'Completed'
      : status === 'in_progress'
        ? 'In progress'
        : 'Not started';

  return (
    <section
      className="assignment-content-section"
      aria-labelledby="student-progress-title"
    >
      <div className="assignment-form-heading">
        <div>
          <h2 id="student-progress-title">Student progress</h2>
          <p className="muted-copy">
            Completion is based on terminal results for assigned problem slots.
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
          Loading student progress…
        </p>
      ) : null}
      {error ? (
        <div className="inline-state" role="alert">
          <p>Student progress is unavailable right now.</p>
          <button
            className="text-button"
            type="button"
            onClick={() => void refresh()}
          >
            Retry
          </button>
        </div>
      ) : null}
      {!loading && !error && rows.length === 0 ? (
        <p className="section-empty">
          No active students are enrolled in this class yet.
        </p>
      ) : null}
      {!loading && !error && rows.length > 0 ? (
        <>
          {!rows.some((row) => row.completedProblemCount > 0) ? (
            <p className="muted-copy">No submitted results yet.</p>
          ) : null}
          <ul
            className="assignment-student-progress"
            aria-label="Enrolled student progress"
          >
            {rows.map((row) => (
              <li key={row.studentUserId}>
                <span className="assignment-student-identity">
                  {row.email || 'Student'}
                </span>
                <span className="assignment-student-count">
                  {row.completedProblemCount} / {row.totalProblemCount}
                </span>
                <span className="assignment-student-status">
                  {statusLabel(row.status)}
                </span>
                {row.lastActivityAt ? (
                  <time dateTime={row.lastActivityAt} className="muted-copy">
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(row.lastActivityAt))}
                  </time>
                ) : (
                  <span className="muted-copy">No activity</span>
                )}
              </li>
            ))}
          </ul>
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
          </div>
          {!editable && (
            <span className="content-locked-label">Content locked</span>
          )}
        </div>
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
                key={`${item.id}-${item.updated_at}`}
                item={item}
                index={index}
                total={items.length}
                editable={editable}
                pending={pending}
                onSave={(target, key, count) =>
                  void saveBlock(target, key, count)
                }
                onMove={(current, direction) =>
                  void moveBlock(current, direction)
                }
                onRemove={(target) => void removeBlock(target)}
              />
            ))}
          </ol>
        )}

        {editable && !itemLoadError && (
          <form
            className="add-block-form"
            onSubmit={(event) => void addBlock(event)}
          >
            <h3>Add practice block</h3>
            <div className="practice-block-fields">
              <label htmlFor="new-block-activity">
                Activity
                <select
                  id="new-block-activity"
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
              <label htmlFor="new-block-count">
                Problems
                <input
                  id="new-block-count"
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
            <button
              className="button button-quiet"
              type="submit"
              disabled={
                pending ||
                !Number.isInteger(Number(problemCount)) ||
                Number(problemCount) < 1 ||
                Number(problemCount) > 20
              }
            >
              Add block
            </button>
          </form>
        )}
      </section>

      {assignment.status !== 'draft' ? (
        <AssignmentStudentProgressSection assignmentId={assignment.id} />
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
