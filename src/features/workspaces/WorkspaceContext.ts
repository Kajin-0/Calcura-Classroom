import { createContext } from 'react';
import type { ClassroomError } from '../../lib/supabase/serviceResult';
import type { WorkspaceSummary } from './workspaceService';

export interface WorkspaceContextValue {
  workspace: WorkspaceSummary | null;
  loading: boolean;
  error: ClassroomError | null;
  retry: () => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(
  null,
);
