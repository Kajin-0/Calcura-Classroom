import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import type {
  ClassroomError,
  ServiceResult,
} from '../../lib/supabase/serviceResult';
import { mapClassroomError } from '../../lib/supabase/serviceResult';
import {
  ensurePersonalWorkspace,
  type WorkspaceSummary,
} from './workspaceService';
import { WorkspaceContext } from './WorkspaceContext';

function requestPersonalWorkspace(): Promise<ServiceResult<WorkspaceSummary>> {
  return ensurePersonalWorkspace().catch((error: unknown) => ({
    ok: false,
    error: mapClassroomError(error),
  }));
}

export function WorkspaceProvider() {
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ClassroomError | null>(null);
  const requestRef = useRef<Promise<ServiceResult<WorkspaceSummary>> | null>(
    null,
  );
  const activeRef = useRef(false);

  const load = useCallback((force = false) => {
    if (force || !requestRef.current) {
      requestRef.current = requestPersonalWorkspace();
    }
    const request = requestRef.current;
    setLoading(true);
    setError(null);
    void request.then((result) => {
      if (!activeRef.current || requestRef.current !== request) return;
      if (result.ok) {
        setWorkspace(result.value);
        setError(null);
      } else {
        setWorkspace(null);
        setError(result.error);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    activeRef.current = true;
    const request = requestRef.current ?? requestPersonalWorkspace();
    requestRef.current = request;
    void request.then((result) => {
      if (!activeRef.current || requestRef.current !== request) return;
      if (result.ok) {
        setWorkspace(result.value);
        setError(null);
      } else {
        setWorkspace(null);
        setError(result.error);
      }
      setLoading(false);
    });
    return () => {
      activeRef.current = false;
    };
  }, []);

  const value = useMemo(
    () => ({ workspace, loading, error, retry: () => load(true) }),
    [workspace, loading, error, load],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      <Outlet />
    </WorkspaceContext.Provider>
  );
}
