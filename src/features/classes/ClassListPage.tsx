import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../workspaces/useWorkspace';
import {
  countActiveClassEnrollments,
  listWorkspaceClasses,
  type ClassSummary,
} from './classService';
import { CreateClassForm } from './CreateClassForm';

type CountMap = Record<string, number | null>;

function studentLabel(count: number | null) {
  if (count === null) return 'Count unavailable';
  return `${count} ${count === 1 ? 'student' : 'students'}`;
}

function ClassRows({
  classes,
  counts,
}: {
  classes: ClassSummary[];
  counts: CountMap;
}) {
  return (
    <ul className="class-list">
      {classes.map((classItem) => (
        <li key={classItem.id}>
          <Link className="class-row" to={`/app/classes/${classItem.id}`}>
            <span className="class-row-name">{classItem.name}</span>
            <span className="class-row-meta">
              {classItem.status === 'archived' && (
                <span className="status-label">Archived</span>
              )}
              <span>{studentLabel(counts[classItem.id] ?? null)}</span>
              <span className="row-open" aria-hidden="true">
                Open <span>→</span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ClassListPage() {
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [counts, setCounts] = useState<CountMap>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [reload, setReload] = useState(0);

  const reloadClasses = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    setReload((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!workspace) return undefined;
    let active = true;

    void (async () => {
      const result = await listWorkspaceClasses(workspace.id);
      if (!active) return;
      if (!result.ok) {
        setClasses([]);
        setCounts({});
        setLoadError(true);
        setLoading(false);
        return;
      }

      setClasses(result.value);
      const countResults = await Promise.all(
        result.value.map(async (classItem) => ({
          id: classItem.id,
          result: await countActiveClassEnrollments(classItem.id),
        })),
      );
      if (!active) return;
      setCounts(
        Object.fromEntries(
          countResults.map(({ id, result: countResult }) => [
            id,
            countResult.ok ? countResult.value : null,
          ]),
        ),
      );
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [workspace, reload]);

  useEffect(() => {
    document.title = 'Classes · Calcura Classroom';
  }, []);

  const activeClasses = classes.filter(
    (classItem) => classItem.status === 'active',
  );
  const archivedClasses = classes.filter(
    (classItem) => classItem.status === 'archived',
  );
  const countHasError = Object.values(counts).some((count) => count === null);

  const handleCreated = (classId: string) => {
    navigate(`/app/classes/${classId}`);
  };

  return (
    <section
      className="workspace-content class-list-page"
      aria-labelledby="classes-title"
    >
      <div className="page-heading">
        <div>
          <p className="eyebrow">Teaching</p>
          <h1 id="classes-title">Classes</h1>
        </div>
        {!formOpen && (
          <button
            className="button button-primary new-class-button"
            type="button"
            onClick={() => setFormOpen(true)}
          >
            New class
          </button>
        )}
      </div>

      {formOpen && (
        <CreateClassForm
          workspaceId={workspace?.id ?? ''}
          onCreated={handleCreated}
          onCancel={() => setFormOpen(false)}
        />
      )}

      {loading ? (
        <p className="list-status" aria-live="polite" role="status">
          Loading classes…
        </p>
      ) : loadError ? (
        <div className="recoverable-state inline-state">
          <p>We couldn’t load your classes.</p>
          <button className="text-button" type="button" onClick={reloadClasses}>
            Retry
          </button>
        </div>
      ) : classes.length === 0 ? (
        <div className="empty-state">
          <h2>No classes yet</h2>
          <p>Create your first class to generate a student join code.</p>
          {!formOpen && (
            <button
              className="button button-primary"
              type="button"
              onClick={() => setFormOpen(true)}
            >
              Create your first class
            </button>
          )}
        </div>
      ) : (
        <div className="class-sections">
          {countHasError && (
            <p className="subtle-alert" role="status">
              Some student counts could not be loaded.{' '}
              <button
                className="inline-link"
                type="button"
                onClick={reloadClasses}
              >
                Retry
              </button>
            </p>
          )}
          <section
            className="class-section"
            aria-labelledby="active-classes-title"
          >
            <h2 id="active-classes-title">Active</h2>
            {activeClasses.length ? (
              <ClassRows classes={activeClasses} counts={counts} />
            ) : (
              <p className="section-empty">No active classes.</p>
            )}
          </section>
          {archivedClasses.length > 0 && (
            <section
              className="class-section archived-section"
              aria-labelledby="archived-classes-title"
            >
              <h2 id="archived-classes-title">Archived</h2>
              <ClassRows classes={archivedClasses} counts={counts} />
            </section>
          )}
          <p className="class-count-note">
            Student counts include active enrollments only.
          </p>
        </div>
      )}
    </section>
  );
}
