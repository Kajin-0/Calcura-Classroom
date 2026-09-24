import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import { useWorkspace } from '../workspaces/useWorkspace';
import { ClassAssignmentsSection } from '../assignments/ClassAssignmentsSection';
import { formatJoinCode } from './classFormatters';
import {
  countActiveClassEnrollments,
  getClassById,
  getClassJoinCode,
  renameClass,
  setClassStatus,
  type ClassSummary,
  type ClassStatus,
} from './classService';

function studentLabel(count: number) {
  return `${count} ${count === 1 ? 'student' : 'students'}`;
}

function RenameClassForm({
  classItem,
  onSaved,
  onCancel,
}: {
  classItem: ClassSummary;
  onSaved: (classItem: ClassSummary) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(classItem.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const normalizedName = name.trim();
    if (!normalizedName || normalizedName.length > 120) {
      setError('Enter a class name between 1 and 120 characters.');
      return;
    }
    setPending(true);
    setError(null);
    const result = await renameClass(classItem.id, normalizedName);
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onSaved(result.value);
  };

  return (
    <form
      className="rename-form"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <label htmlFor="rename-class">Class name</label>
      <input
        id="rename-class"
        value={name}
        maxLength={120}
        onChange={(event) => {
          setName(event.target.value);
          if (error) setError(null);
        }}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'rename-class-error' : undefined}
        disabled={pending}
        autoFocus
      />
      {error && (
        <p className="form-error" id="rename-class-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button
          className="button button-primary"
          type="submit"
          disabled={pending}
        >
          {pending ? 'Saving…' : 'Save name'}
        </button>
        <button
          className="button button-quiet"
          type="button"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ClassDetailPage() {
  const { classId = '' } = useParams();
  return <ClassDetailContent key={classId} classId={classId} />;
}

function ClassDetailContent({ classId }: { classId: string }) {
  const { workspace } = useWorkspace();
  const [classItem, setClassItem] = useState<ClassSummary | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(true);
  const [codeError, setCodeError] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(true);
  const [countError, setCountError] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const codeRequestRef = useRef(0);
  const countRequestRef = useRef(0);
  const copyTimerRef = useRef<number | null>(null);

  const loadCode = useCallback(async () => {
    const requestId = ++codeRequestRef.current;
    setCodeLoading(true);
    setCodeError(false);
    const result = await getClassJoinCode(classId);
    if (codeRequestRef.current !== requestId) return;
    if (result.ok) setJoinCode(result.value);
    else setCodeError(true);
    setCodeLoading(false);
  }, [classId]);

  const loadCount = useCallback(async () => {
    const requestId = ++countRequestRef.current;
    setCountLoading(true);
    setCountError(false);
    const result = await countActiveClassEnrollments(classId);
    if (countRequestRef.current !== requestId) return;
    if (result.ok) setStudentCount(result.value);
    else setCountError(true);
    setCountLoading(false);
  }, [classId]);

  useEffect(() => {
    if (!workspace) return undefined;
    let active = true;

    void (async () => {
      const result = await getClassById(classId);
      if (!active) return;
      if (!result.ok || result.value.workspace_id !== workspace.id) {
        setUnavailable(true);
        setLoading(false);
        return;
      }
      setClassItem(result.value);
      setLoading(false);
      void loadCode();
      void loadCount();
    })();

    return () => {
      active = false;
      codeRequestRef.current += 1;
      countRequestRef.current += 1;
    };
  }, [classId, workspace, loadCode, loadCount]);

  useEffect(() => {
    document.title = classItem
      ? `${classItem.name} · Calcura Classroom`
      : 'Class · Calcura Classroom';
  }, [classItem]);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    },
    [],
  );

  const updateStatus = async (status: ClassStatus) => {
    if (!classItem || statusPending) return;
    setStatusPending(true);
    setStatusError(false);
    const result = await setClassStatus(classItem.id, status);
    setStatusPending(false);
    if (!result.ok) {
      setStatusError(true);
      return;
    }
    setClassItem(result.value);
    setConfirmArchive(false);
  };

  const handleCopy = async () => {
    if (!joinCode) return;
    try {
      await navigator.clipboard.writeText(formatJoinCode(joinCode));
      setCopyStatus('Copied');
    } catch {
      setCopyStatus('Could not copy the code. Select and copy it instead.');
    }
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => setCopyStatus(''), 2200);
  };

  if (loading) {
    return (
      <section
        className="workspace-content class-detail-page"
        role="status"
        aria-live="polite"
      >
        Loading class…
      </section>
    );
  }

  if (unavailable || !classItem) {
    return (
      <section className="workspace-content unavailable-state">
        <Link className="back-link" to="/app">
          ← Classes
        </Link>
        <h1>This class is unavailable.</h1>
        <p className="muted-copy">
          It may have been moved or you may not have access.
        </p>
      </section>
    );
  }

  return (
    <section
      className="workspace-content class-detail-page"
      aria-labelledby="class-title"
    >
      <Link className="back-link" to="/app">
        ← Classes
      </Link>
      <div className="detail-heading">
        <div>
          {editingName ? (
            <RenameClassForm
              classItem={classItem}
              onSaved={(updated) => {
                setClassItem(updated);
                setEditingName(false);
              }}
              onCancel={() => setEditingName(false)}
            />
          ) : (
            <>
              <h1 id="class-title">{classItem.name}</h1>
              <p className="class-status-copy">
                <span
                  className={`status-indicator ${classItem.status === 'active' ? 'is-active' : 'is-archived'}`}
                  aria-hidden="true"
                />
                {classItem.status === 'active'
                  ? 'Active class'
                  : 'Archived class'}
              </p>
            </>
          )}
        </div>
        {!editingName && (
          <button
            className="button button-quiet"
            type="button"
            onClick={() => setEditingName(true)}
          >
            Rename
          </button>
        )}
      </div>

      <div className="detail-sections">
        <section
          className="detail-section join-code-section"
          aria-labelledby="join-code-title"
        >
          <div className="section-heading">
            <div>
              <h2 id="join-code-title">Student join code</h2>
              <p className="muted-copy">
                Students use this code to join the class.
              </p>
            </div>
          </div>
          {classItem.status === 'archived' && (
            <p className="subtle-alert">
              This class is archived. Students cannot join while it is archived.
            </p>
          )}
          <div className="join-code-row">
            {codeLoading ? (
              <span className="join-code-placeholder" role="status">
                Loading code…
              </span>
            ) : codeError || !joinCode ? (
              <div className="inline-error">
                <span>Join code unavailable.</span>
                <button
                  className="inline-link"
                  type="button"
                  onClick={() => void loadCode()}
                >
                  Retry
                </button>
              </div>
            ) : (
              <code className="join-code-value">
                {formatJoinCode(joinCode)}
              </code>
            )}
            {joinCode && !codeLoading && (
              <button
                className="button button-quiet copy-button"
                type="button"
                onClick={() => void handleCopy()}
              >
                Copy code
              </button>
            )}
          </div>
          <p className="copy-feedback" aria-live="polite" role="status">
            {copyStatus}
          </p>
        </section>

        <section className="detail-section" aria-labelledby="students-title">
          <div className="section-heading">
            <div>
              <h2 id="students-title">Students</h2>
              {countLoading ? (
                <p className="muted-copy" role="status">
                  Loading enrollment count…
                </p>
              ) : countError || studentCount === null ? (
                <p className="muted-copy">
                  Enrollment count unavailable.{' '}
                  <button
                    className="inline-link"
                    type="button"
                    onClick={() => void loadCount()}
                  >
                    Retry
                  </button>
                </p>
              ) : (
                <p className="muted-copy">
                  {studentLabel(studentCount)} enrolled
                </p>
              )}
            </div>
          </div>
        </section>

        <ClassAssignmentsSection
          classId={classItem.id}
          active={classItem.status === 'active'}
        />

        <section
          className="detail-section class-management"
          aria-labelledby="management-title"
        >
          <h2 id="management-title">Class management</h2>
          {statusError && (
            <p className="form-error" role="alert">
              We couldn’t update this class. Try again.
            </p>
          )}
          {classItem.status === 'active' ? (
            confirmArchive ? (
              <div
                className="archive-confirmation"
                role="group"
                aria-labelledby="archive-title"
              >
                <h3 id="archive-title">Archive this class?</h3>
                <p>
                  Students will no longer be able to join using its class code.
                  Existing class data will be preserved.
                </p>
                <div className="form-actions">
                  <button
                    className="button button-danger"
                    type="button"
                    disabled={statusPending}
                    onClick={() => void updateStatus('archived')}
                  >
                    {statusPending ? 'Archiving…' : 'Archive class'}
                  </button>
                  <button
                    className="button button-quiet"
                    type="button"
                    disabled={statusPending}
                    onClick={() => setConfirmArchive(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="management-action">
                <p>
                  Archiving preserves this class and prevents new students from
                  joining.
                </p>
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => setConfirmArchive(true)}
                >
                  Archive class
                </button>
              </div>
            )
          ) : (
            <div className="management-action">
              <p>
                Reactivating allows students to join again using the existing
                code.
              </p>
              <button
                className="button button-primary"
                type="button"
                disabled={statusPending}
                onClick={() => void updateStatus('active')}
              >
                {statusPending ? 'Reactivating…' : 'Reactivate class'}
              </button>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
