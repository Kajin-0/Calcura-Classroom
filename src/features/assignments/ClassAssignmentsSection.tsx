import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDueAt } from './assignmentFormatters';
import {
  listClassAssignments,
  type AssignmentSummary,
} from './assignmentService';

function AssignmentRows({ assignments }: { assignments: AssignmentSummary[] }) {
  return (
    <ul className="assignment-list">
      {assignments.map((assignment) => (
        <li key={assignment.id}>
          <Link className="assignment-row" to={`assignments/${assignment.id}`}>
            <span className="assignment-row-title">{assignment.title}</span>
            <span className="assignment-row-meta">
              {formatDueAt(assignment.due_at)}
              <span className="row-open">Open →</span>
            </span>
          </Link>
        </li>
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
              <AssignmentRows assignments={published} />
            </section>
          )}
          {drafts.length > 0 && (
            <section aria-labelledby="draft-assignments-title">
              <h3 id="draft-assignments-title">Drafts</h3>
              <AssignmentRows assignments={drafts} />
            </section>
          )}
          {archived.length > 0 && (
            <section aria-labelledby="archived-assignments-title">
              <h3 id="archived-assignments-title">Archived</h3>
              <AssignmentRows assignments={archived} />
            </section>
          )}
        </div>
      )}
    </section>
  );
}
