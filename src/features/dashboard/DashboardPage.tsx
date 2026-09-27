import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CreateClassForm } from '../classes/CreateClassForm';
import { useWorkspace } from '../workspaces/useWorkspace';
import {
  getWorkspaceDashboard,
  type DashboardActivity,
  type DashboardAssignment,
  type DashboardClass,
  type WorkspaceDashboard,
} from './dashboardService';
import './dashboard.css';

interface LoadState {
  workspaceId: string;
  revision: number;
  dashboard: WorkspaceDashboard | null;
  error: boolean;
}

const countLabel = (count: number, singular: string, plural = `${singular}s`) =>
  `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
const percent = (ratio: number | null) =>
  ratio === null ? '—' : `${Math.round(ratio * 100)}%`;
const attempts = (value: number | null) =>
  value === null ? '—' : value.toFixed(1);
const shortDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
      }).format(new Date(value))
    : '—';

function RateTrack({
  rate,
  tone = 'accent',
}: {
  rate: number | null;
  tone?: 'accent' | 'muted';
}) {
  return (
    <span className="dashboard-rate-track" aria-hidden="true">
      <span
        className={`dashboard-rate-fill dashboard-rate-fill-${tone}`}
        style={{ width: `${(rate ?? 0) * 100}%` }}
      />
    </span>
  );
}

function DashboardSkeleton() {
  return (
    <div
      className="dashboard-skeleton"
      role="status"
      aria-label="Loading dashboard"
    >
      <span className="visually-hidden">Loading dashboard…</span>
      <div className="dashboard-kpis">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="dashboard-skeleton-card" key={index}>
            <span className="dashboard-skeleton-line short" />
            <span className="dashboard-skeleton-line value" />
            <span className="dashboard-skeleton-line" />
          </div>
        ))}
      </div>
      <div className="dashboard-primary-grid">
        <div className="dashboard-skeleton-panel" />
        <div className="dashboard-skeleton-panel" />
      </div>
      <div className="dashboard-skeleton-panel lower" />
    </div>
  );
}

function ClassCompletion({ classes }: { classes: DashboardClass[] }) {
  const withAssignments = classes.filter((item) => item.activeAssignments > 0);
  const withoutAssignments = classes.length - withAssignments.length;
  return (
    <section
      className="dashboard-panel dashboard-completion"
      aria-labelledby="class-completion-title"
    >
      <div className="dashboard-panel-heading">
        <div>
          <p className="dashboard-overline">Progress</p>
          <h2 id="class-completion-title">Completion by class</h2>
        </div>
        <span className="dashboard-panel-note">Published assignments</span>
      </div>
      {withAssignments.length === 0 ? (
        <div className="dashboard-panel-empty">
          <p>No completion data yet.</p>
          <span>Publish an assignment to see class progress here.</span>
        </div>
      ) : (
        <>
          <ul
            className="dashboard-chart-list"
            aria-label="Class completion rates"
          >
            {withAssignments.map((item) => (
              <li key={item.classId}>
                <div className="dashboard-chart-line">
                  <Link to={`/app/classes/${item.classId}`}>{item.name}</Link>
                  <strong>{percent(item.completionRate)}</strong>
                </div>
                <RateTrack rate={item.completionRate} />
                <span className="dashboard-chart-caption">
                  {item.studentsCompleted} of{' '}
                  {item.studentAssignmentOpportunities} student-assignment
                  completions
                </span>
              </li>
            ))}
          </ul>
          {withoutAssignments > 0 && (
            <p className="dashboard-completion-note">
              {countLabel(withoutAssignments, 'class')} without published
              assignments
            </p>
          )}
        </>
      )}
    </section>
  );
}

function OutcomeQuality({ dashboard }: { dashboard: WorkspaceDashboard }) {
  const { problemsCompleted, problemsCorrect, accuracy } = dashboard.summary;
  const surrendered = problemsCompleted - problemsCorrect;
  return (
    <section
      className="dashboard-panel dashboard-outcomes"
      aria-labelledby="outcome-title"
    >
      <div className="dashboard-panel-heading">
        <div>
          <p className="dashboard-overline">Performance</p>
          <h2 id="outcome-title">Outcome quality</h2>
        </div>
      </div>
      {problemsCompleted === 0 ? (
        <div className="dashboard-panel-empty">
          <p>No completed problems yet.</p>
          <span>Accuracy appears after students finish assigned problems.</span>
        </div>
      ) : (
        <>
          <p className="dashboard-outcome-value">{percent(accuracy)}</p>
          <p className="dashboard-outcome-subtitle">correct terminal results</p>
          <div className="dashboard-outcome-track" aria-hidden="true">
            <span style={{ width: `${(accuracy ?? 0) * 100}%` }} />
          </div>
          <dl className="dashboard-outcome-legend">
            <div>
              <dt>Correct</dt>
              <dd>{problemsCorrect.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Surrendered</dt>
              <dd>{surrendered.toLocaleString()}</dd>
            </div>
          </dl>
          <p className="dashboard-outcome-footnote">
            Surrendered problems count toward completion, not accuracy.
          </p>
        </>
      )}
    </section>
  );
}

function ClassOverview({ classes }: { classes: DashboardClass[] }) {
  return (
    <section
      className="dashboard-panel dashboard-class-overview"
      aria-labelledby="class-overview-title"
    >
      <div className="dashboard-panel-heading">
        <div>
          <p className="dashboard-overline">Your teaching space</p>
          <h2 id="class-overview-title">Classes</h2>
        </div>
        <Link className="dashboard-section-link" to="/app/classes">
          All classes →
        </Link>
      </div>
      <ul className="dashboard-class-list">
        {classes.map((item) => (
          <li key={item.classId}>
            <Link
              className="dashboard-class-row"
              to={`/app/classes/${item.classId}`}
            >
              <span className="dashboard-class-name">
                <strong>{item.name}</strong>
                <small>Last result {shortDate(item.lastActivityAt)}</small>
              </span>
              <span className="dashboard-class-cell">
                <small>Students</small>
                <strong>{item.studentsEnrolled}</strong>
              </span>
              <span className="dashboard-class-cell">
                <small>Assignments</small>
                <strong>{item.activeAssignments}</strong>
              </span>
              <span className="dashboard-class-cell">
                <small>Completion</small>
                <strong>{percent(item.completionRate)}</strong>
              </span>
              <span className="dashboard-class-cell">
                <small>Accuracy</small>
                <strong>{percent(item.accuracy)}</strong>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActivityPerformance({
  activities,
}: {
  activities: DashboardActivity[];
}) {
  const sorted = [...activities].sort((left, right) => {
    if (left.accuracy === null)
      return right.accuracy === null
        ? left.label.localeCompare(right.label)
        : 1;
    if (right.accuracy === null) return -1;
    return (
      left.accuracy - right.accuracy || left.label.localeCompare(right.label)
    );
  });
  return (
    <section
      className="dashboard-panel dashboard-activities"
      aria-labelledby="activity-performance-title"
    >
      <div className="dashboard-panel-heading">
        <div>
          <p className="dashboard-overline">Practice families</p>
          <h2 id="activity-performance-title">Technique performance</h2>
        </div>
      </div>
      {sorted.length === 0 ? (
        <div className="dashboard-panel-empty compact">
          <p>No practice blocks published yet.</p>
        </div>
      ) : (
        <ul
          className="dashboard-activity-list"
          aria-label="Accuracy by practice family"
        >
          {sorted.map((item) => (
            <li key={item.activityKey}>
              <div className="dashboard-chart-line">
                <span>{item.label}</span>
                <strong>{percent(item.accuracy)}</strong>
              </div>
              <RateTrack rate={item.accuracy} tone="muted" />
              <span className="dashboard-chart-caption">
                {countLabel(item.problemsCompleted, 'result')} ·{' '}
                {attempts(item.averageAttempts)} avg attempts ·{' '}
                {item.surrenders} surrendered
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AssignmentPerformance({
  assignments,
  classes,
}: {
  assignments: DashboardAssignment[];
  classes: DashboardClass[];
}) {
  const [classFilter, setClassFilter] = useState('all');
  const [visibleCount, setVisibleCount] = useState(8);
  const classNames = useMemo(
    () => new Map(classes.map((item) => [item.classId, item.name])),
    [classes],
  );
  const selectedClass = classes.some((item) => item.classId === classFilter)
    ? classFilter
    : 'all';
  const filtered = assignments.filter(
    (item) => selectedClass === 'all' || item.classId === selectedClass,
  );
  const shown = filtered.slice(0, visibleCount);

  return (
    <section
      className="dashboard-panel dashboard-assignments"
      aria-labelledby="assignment-performance-title"
    >
      <div className="dashboard-panel-heading dashboard-assignment-heading">
        <div>
          <p className="dashboard-overline">Published work</p>
          <h2 id="assignment-performance-title">Assignment performance</h2>
        </div>
        {classes.length > 1 && (
          <label className="dashboard-filter">
            <span>Class</span>
            <select
              value={selectedClass}
              onChange={(event) => {
                setClassFilter(event.target.value);
                setVisibleCount(8);
              }}
            >
              <option value="all">All classes</option>
              {classes.map((item) => (
                <option key={item.classId} value={item.classId}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {filtered.length === 0 ? (
        <div className="dashboard-panel-empty compact">
          <p>
            No published assignments
            {selectedClass === 'all' ? ' yet.' : ' in this class.'}
          </p>
          <span>Open a class to create and publish an assignment.</span>
        </div>
      ) : (
        <>
          <ul className="dashboard-assignment-list">
            {shown.map((item) => (
              <li key={item.assignmentId}>
                <Link
                  className="dashboard-assignment-row"
                  to={`/app/classes/${item.classId}/assignments/${item.assignmentId}`}
                >
                  <span className="dashboard-assignment-name">
                    <strong>{item.title}</strong>
                    <small>
                      {classNames.get(item.classId)} · {item.totalProblemCount}{' '}
                      problems
                    </small>
                  </span>
                  <span className="dashboard-assignment-progress">
                    <span>
                      <small>Completed</small>
                      <strong>
                        {item.studentsCompleted} / {item.studentsEnrolled}
                      </strong>
                    </span>
                    <RateTrack rate={item.completionRate} />
                  </span>
                  <span className="dashboard-assignment-cell">
                    <small>Accuracy</small>
                    <strong>{percent(item.accuracy)}</strong>
                  </span>
                  <span className="dashboard-assignment-cell">
                    <small>Avg attempts</small>
                    <strong>{attempts(item.averageAttempts)}</strong>
                  </span>
                  <span className="dashboard-assignment-cell">
                    <small>Published</small>
                    <strong>{shortDate(item.publishedAt)}</strong>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {visibleCount < filtered.length && (
            <button
              className="dashboard-more"
              type="button"
              onClick={() => setVisibleCount((count) => count + 8)}
            >
              Show more assignments
            </button>
          )}
        </>
      )}
    </section>
  );
}

export function DashboardPage() {
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const workspaceId = workspace?.id ?? null;
  const [revision, setRevision] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({
    workspaceId: '',
    revision: -1,
    dashboard: null,
    error: false,
  });
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    document.title = 'Dashboard · Calcura Classroom';
  }, []);
  useEffect(() => {
    if (!workspaceId) return;
    let current = true;
    void getWorkspaceDashboard(workspaceId).then((result) => {
      if (!current) return;
      setLoadState({
        workspaceId,
        revision,
        dashboard: result.ok ? result.value : null,
        error: !result.ok,
      });
    });
    return () => {
      current = false;
    };
  }, [workspaceId, revision]);

  const current =
    workspaceId === loadState.workspaceId && revision === loadState.revision;
  const loading = Boolean(workspaceId) && !current;
  const dashboard = current ? loadState.dashboard : null;
  const summary = dashboard?.summary;

  return (
    <section className="dashboard-page" aria-labelledby="dashboard-title">
      <header className="dashboard-head">
        <div>
          <p className="dashboard-overline">Workspace overview</p>
          <h1 id="dashboard-title">Dashboard</h1>
          <p className="dashboard-workspace-name">{workspace?.name}</p>
        </div>
        {!formOpen && (
          <button
            className="button button-primary"
            type="button"
            onClick={() => setFormOpen(true)}
          >
            New class
          </button>
        )}
      </header>
      {formOpen && (
        <div className="dashboard-create-form">
          <CreateClassForm
            workspaceId={workspaceId ?? ''}
            onCreated={(classId) => navigate(`/app/classes/${classId}`)}
            onCancel={() => setFormOpen(false)}
          />
        </div>
      )}
      {loading ? (
        <DashboardSkeleton />
      ) : loadState.error || !dashboard || !summary ? (
        <div className="dashboard-error recoverable-state" role="alert">
          <h2>Dashboard unavailable</h2>
          <p>
            We couldn’t load your workspace overview. Your classes and
            assignments are unchanged.
          </p>
          <button
            className="button button-quiet"
            type="button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="dashboard-loaded">
          <dl className="dashboard-kpis" aria-label="Workspace summary">
            <div className="dashboard-kpi">
              <dt>Active classes</dt>
              <dd>{summary.activeClasses}</dd>
              <span>Currently teaching</span>
            </div>
            <div className="dashboard-kpi">
              <dt>Students</dt>
              <dd>{summary.students}</dd>
              <span>Unique active enrollees</span>
            </div>
            <div className="dashboard-kpi">
              <dt>Assignments</dt>
              <dd>{summary.activeAssignments}</dd>
              <span>Published in active classes</span>
            </div>
            <div className="dashboard-kpi">
              <dt>Completion</dt>
              <dd>{percent(summary.completionRate)}</dd>
              <span>
                {summary.studentsCompleted} of{' '}
                {summary.studentAssignmentOpportunities} student assignments
              </span>
            </div>
          </dl>
          {summary.activeClasses === 0 ? (
            <div className="dashboard-first-class">
              <p className="dashboard-overline">Getting started</p>
              <h2>No classes yet</h2>
              <p>
                Create a class to invite students and begin assigning Calcura
                practice.
              </p>
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
            <>
              <div className="dashboard-primary-grid">
                <ClassCompletion classes={dashboard.classes} />
                <OutcomeQuality dashboard={dashboard} />
              </div>
              <div className="dashboard-secondary-grid">
                <ClassOverview classes={dashboard.classes} />
                <ActivityPerformance activities={dashboard.activities} />
              </div>
              <AssignmentPerformance
                assignments={dashboard.assignments}
                classes={dashboard.classes}
              />
              <p className="dashboard-definition">
                Completion is the share of active student-assignment pairs with
                every slot finished. Accuracy is correct results divided by
                completed problems; surrendered problems count as complete, not
                correct.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
