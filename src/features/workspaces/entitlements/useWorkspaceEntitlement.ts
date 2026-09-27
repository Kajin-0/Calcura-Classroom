import { useCallback, useEffect, useState } from 'react';
import type { ClassroomError } from '../../../lib/supabase/serviceResult';
import { mapClassroomError } from '../../../lib/supabase/serviceResult';
import { useWorkspace } from '../useWorkspace';
import { getWorkspaceEntitlement } from './entitlementService';
import type { WorkspaceEntitlement } from './entitlementTypes';

interface EntitlementLoadState {
  workspaceId: string | null;
  requestVersion: number;
  entitlement: WorkspaceEntitlement | null;
  error: ClassroomError | null;
}

export interface WorkspaceEntitlementState {
  workspaceId: string | null;
  loading: boolean;
  entitlement: WorkspaceEntitlement | null;
  error: ClassroomError | null;
  retry: () => void;
}

export function useWorkspaceEntitlement(
  workspaceIdOverride?: string,
): WorkspaceEntitlementState {
  const { workspace } = useWorkspace();
  const requestedWorkspaceId = workspaceIdOverride ?? workspace?.id ?? null;
  const workspaceId = requestedWorkspaceId?.trim() || null;
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState<EntitlementLoadState>({
    workspaceId: null,
    requestVersion: -1,
    entitlement: null,
    error: null,
  });

  useEffect(() => {
    let current = true;
    if (!workspaceId) return;
    void getWorkspaceEntitlement(workspaceId)
      .then((result) => {
        if (!current) return;
        setState(
          result.ok
            ? {
                workspaceId,
                requestVersion,
                entitlement: result.value,
                error: null,
              }
            : {
                workspaceId,
                requestVersion,
                entitlement: null,
                error: result.error,
              },
        );
      })
      .catch((error: unknown) => {
        if (!current) return;
        setState({
          workspaceId,
          requestVersion,
          entitlement: null,
          error: mapClassroomError(error),
        });
      });

    return () => {
      current = false;
    };
  }, [workspaceId, requestVersion]);

  const retry = useCallback(
    () => setRequestVersion((version) => version + 1),
    [],
  );
  const stateMatchesRequest =
    workspaceId !== null &&
    state.workspaceId === workspaceId &&
    state.requestVersion === requestVersion;

  return {
    workspaceId,
    loading: workspaceId !== null && !stateMatchesRequest,
    entitlement: stateMatchesRequest ? state.entitlement : null,
    error:
      workspaceId === null
        ? {
            code: 'workspace_not_found',
            message: 'The requested workspace is unavailable.',
          }
        : stateMatchesRequest
          ? state.error
          : null,
    retry,
  };
}
