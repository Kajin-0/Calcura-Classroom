import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useWorkspace } from '../workspaces/useWorkspace';
import { getClassById, type ClassSummary } from '../classes/classService';
import { createAssignment } from './assignmentService';

function localDateTimeToIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function NewAssignmentForm({ classItem }: { classItem: ClassSummary }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const normalizedTitle = title.trim();
    if (!normalizedTitle || normalizedTitle.length > 160) {
      setError('Enter an assignment title between 1 and 160 characters.');
      return;
    }
    const isoDueAt = localDateTimeToIso(dueAt);
    if (isoDueAt === undefined) {
      setError('Enter a valid due date and time.');
      return;
    }
    setPending(true);
    setError('');
    const result = await createAssignment({
      classId: classItem.id,
      title: normalizedTitle,
      dueAt: isoDueAt,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    navigate(`/app/classes/${classItem.id}/assignments/${result.value.id}`);
  };

  return (
    <section
      className="workspace-content assignment-page"
      aria-labelledby="new-assignment-title"
    >
      <Link className="back-link" to={`/app/classes/${classItem.id}`}>
        ← {classItem.name}
      </Link>
      <div className="assignment-page-heading">
        <p className="eyebrow">New assignment</p>
        <h1 id="new-assignment-title">Create an assignment</h1>
        <p className="muted-copy">
          Start with a title. You can add practice blocks next.
        </p>
      </div>
      <form
        className="assignment-form"
        onSubmit={(event) => void submit(event)}
      >
        <label htmlFor="assignment-title">Title</label>
        <input
          id="assignment-title"
          name="title"
          value={title}
          maxLength={160}
          onChange={(event) => {
            setTitle(event.target.value);
            if (error) setError('');
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'assignment-title-error' : undefined}
          disabled={pending}
          autoFocus
          required
        />
        <label htmlFor="assignment-due-at">
          Due date and time <span className="optional-label">Optional</span>
        </label>
        <input
          id="assignment-due-at"
          name="dueAt"
          type="datetime-local"
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
          disabled={pending}
        />
        {error && (
          <p className="form-error" id="assignment-title-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            className="button button-primary"
            type="submit"
            disabled={pending || !title.trim()}
          >
            {pending ? 'Creating…' : 'Create draft'}
          </button>
          <Link
            className="button button-quiet"
            to={`/app/classes/${classItem.id}`}
          >
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}

export function NewAssignmentPage() {
  const { classId = '' } = useParams();
  const { workspace } = useWorkspace();
  const [classItem, setClassItem] = useState<ClassSummary | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!workspace) return undefined;
    let active = true;
    void getClassById(classId).then((result) => {
      if (!active) return;
      if (
        !result.ok ||
        result.value.workspace_id !== workspace.id ||
        result.value.status !== 'active'
      ) {
        setUnavailable(true);
      } else {
        setClassItem(result.value);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [classId, revision, workspace]);

  useEffect(() => {
    document.title = 'New assignment · Calcura Classroom';
  }, []);

  if (loading)
    return (
      <section className="workspace-content" role="status">
        Loading class…
      </section>
    );
  if (unavailable || !classItem) {
    return (
      <section className="workspace-content unavailable-state">
        <Link className="back-link" to="/app">
          ← Classes
        </Link>
        <h1>This class is unavailable.</h1>
        <Link className="inline-link" to="/app">
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
  return <NewAssignmentForm classItem={classItem} />;
}
