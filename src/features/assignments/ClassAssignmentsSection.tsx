import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDueAt } from './assignmentFormatters';
import {
  deleteAssignment,
  duplicateAssignment,
  getAssignmentDeleteStatus,
  listClassAssignments,
  type AssignmentSummary,
} from './assignmentService';

function AssignmentRow({
  assignment,
  active,
  onDeleted,
}: {
  assignment: AssignmentSummary;
  active: boolean;
  onDeleted: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    'duplicate' | 'checking-delete' | 'delete' | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteProtected, setDeleteProtected] = useState(false);
  const [message, setMessage] = useState('');

  const duplicate = async () => {
    if (pending || !active) return;
    setPending(true);
    setPendingAction('duplicate');
    setMessage('');
    const result = await duplicateAssignment(assignment.id);
    setPending(false);
    setPendingAction(null);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    navigate(`/app/classes/${assignment.class_id}/assignments/${result.value}`);
  };

  const requestDelete = async () => {
    if (pending || !active) return;
    setPending(true);
    setPendingAction('checking-delete');
    setMessage('');
    setConfirmDelete(false);
    setDeleteProtected(false);
    const result = await getAssignmentDeleteStatus(assignment.id);
    setPending(false);
    setPendingAction(null);
    if (!result.ok) {
      setMessage(result.error.message);
    } else if (result.value) {
      setDeleteProtected(true);
    } else {
      setConfirmDelete(true);
    }
  };

  const confirm = async () => {
    if (pending || !confirmDelete) return;
    setPending(true);
    setPendingAction('delete');
    setMessage('');
    const result = await deleteAssignment(assignment.id);
    setPending(false);
    setPendingAction(null);
    if (!result.ok) {
      setMessage(result.error.message);
      if (result.error.code === 'assignment_has_results') {
        setDeleteProtected(true);
        setConfirmDelete(false);
      }
      return;
    }
    onDeleted(assignment.id);
  };

  return (
    <li className="assignment-list-entry">
      <div className="assignment-list-main">
        <Link className="assignment-row" to={`assignments/${assignment.id}`}>
          <span className="assignment-row-title">{assignment.title}</span>
          <span className="assignment-row-meta">
            {formatDueAt(assignment.due_at)}
            <span className="row-open">Open →</span>
          </span>
        </Link>
        <div className="assignment-row-actions" aria-label="Assignment actions">
          <Link
            className="inline-link"
            to={`assignments/${assignment.id}`}
            aria-label={`Edit ${assignment.title}`}
          >
            Edit
          </Link>
          <button
            className="inline-link"
            type="button"
            disabled={pending || !active}
            onClick={() => void duplicate()}
          >
            {pendingAction === 'duplicate' ? 'Duplicating…' : 'Duplicate'}
          </button>
          <button
            className="inline-link danger-link"
            type="button"
            disabled={pending || !active}
            onClick={() => void requestDelete()}
          >
            {pendingAction === 'checking-delete' ? 'Checking…' : 'Delete'}
          </button>
        </div>
      </div>
      {confirmDelete && (
        <div
          className="assignment-row-confirmation"
          role="group"
          aria-label={`Delete ${assignment.title}?`}
        >
          <span>“{assignment.title}” will be permanently deleted.</span>
          <button
            className="inline-link danger-link"
            type="button"
            disabled={pending}
            onClick={() => void confirm()}
          >
            {pendingAction === 'delete' ? 'Deleting…' : 'Delete assignment'}
          </button>
          <button
            className="inline-link"
            type="button"
            disabled={pending}
            onClick={() => setConfirmDelete(false)}
          >
            Cancel
          </button>
        </div>
      )}
      {deleteProtected && (
        <p className="assignment-row-feedback" role="status">
          This assignment has student results and cannot be deleted. Duplicate
          it to make changes.
        </p>
      )}
      {message && (
        <p className="assignment-row-feedback" role="alert">
          {message}
        </p>
      )}
    </li>
  );
}

function AssignmentRows({
  assignments,
  active,
  onDeleted,
}: {
  assignments: AssignmentSummary[];
  active: boolean;
  onDeleted: (id: string) => void;
}) {
  return (
    <ul className="assignment-list">
      {assignments.map((assignment) => (
        <AssignmentRow
          key={assignment.id}
          assignment={assignment}
          active={active}
          onDeleted={onDeleted}
        />
      ))}
    </ul>
  );
}

export function ClassAssignmentsSection({
  classId,
  active,
}: {
  classId: string;
  active: boolean;
}) {
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let mounted = true;
    void listClassAssignments(classId).then((result) => {
      if (!mounted) return;
      if (!result.ok) {
        setAssignments([]);
        setLoadError(true);
      } else {
        setAssignments(result.value);
        setLoadError(false);
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [classId, revision]);

  const removeAssignment = (id: string) => {
    setAssignments((current) => current.filter((item) => item.id !== id));
  };

  const published = assignments.filter((item) => item.status === 'published');
  const drafts = assignments.filter((item) => item.status === 'draft');
  const archived = assignments.filter((item) => item.status === 'archived');

  return (
    <section
      className="detail-section assignments-section"
      aria-labelledby="assignments-title"
    >
      <div className="section-heading">
        <div>
          <h2 id="assignments-title">Assignments</h2>
          <p className="muted-copy">
            Teacher-authored practice plans for this class.
          </p>
        </div>
        {active && (
          <Link className="button button-quiet" to="assignments/new">
            New assignment
          </Link>
        )}
      </div>

      {loading ? (
        <p className="list-status" role="status">
          Loading assignments…
        </p>
      ) : loadError ? (
        <div className="inline-state">
          <p>We couldn’t load assignments.</p>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setLoading(true);
              setLoadError(false);
              setRevision((value) => value + 1);
            }}
          >
            Retry
          </button>
        </div>
      ) : assignments.length === 0 ? (
        <p className="section-empty">No assignments yet.</p>
      ) : (
        <div className="assignment-groups">
          {published.length > 0 && (
            <section aria-labelledby="published-assignments-title">
              <h3 id="published-assignments-title">Published</h3>
              <AssignmentRows
                assignments={published}
                active={active}
                onDeleted={removeAssignment}
              />
            </section>
          )}
          {drafts.length > 0 && (
            <section aria-labelledby="draft-assignments-title">
              <h3 id="draft-assignments-title">Drafts</h3>
              <AssignmentRows
                assignments={drafts}
                active={active}
                onDeleted={removeAssignment}
              />
            </section>
          )}
          {archived.length > 0 && (
            <section aria-labelledby="archived-assignments-title">
              <h3 id="archived-assignments-title">Archived</h3>
              <AssignmentRows
                assignments={archived}
                active={active}
                onDeleted={removeAssignment}
              />
            </section>
          )}
        </div>
      )}
    </section>
  );
}
