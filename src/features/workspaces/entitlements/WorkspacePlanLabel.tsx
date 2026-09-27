import { ENTITLEMENT_PLAN_LABELS } from './entitlementTypes';
import { useWorkspaceEntitlement } from './useWorkspaceEntitlement';

export function WorkspacePlanLabel() {
  const { entitlement, loading, error } = useWorkspaceEntitlement();

  if (loading) {
    return (
      <span className="workspace-plan-label" role="status">
        Plan loading
      </span>
    );
  }
  if (error || !entitlement) {
    return (
      <span className="workspace-plan-label" role="status">
        Plan unavailable
      </span>
    );
  }

  return (
    <span className="workspace-plan-label">
      Plan · {ENTITLEMENT_PLAN_LABELS[entitlement.plan]}
    </span>
  );
}
