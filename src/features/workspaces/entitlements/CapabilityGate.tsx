import type { ReactNode } from 'react';
import type { WorkspaceCapability } from './entitlementTypes';
import { useWorkspaceEntitlement } from './useWorkspaceEntitlement';

interface CapabilityGateProps {
  capability: WorkspaceCapability;
  label: string;
  children: ReactNode;
}

/** Presentation only: restricted mutations must still enforce capability in SQL/RPC. */
export function CapabilityGate({
  capability,
  label,
  children,
}: CapabilityGateProps) {
  const { entitlement, loading, error, retry } = useWorkspaceEntitlement();

  if (loading) {
    return (
      <p className="muted-copy" role="status">
        Checking workspace access…
      </p>
    );
  }
  if (error || !entitlement) {
    return (
      <div className="capability-locked" role="alert">
        <strong>{label}</strong>
        <span>Workspace access could not be verified.</span>
        <button className="text-button" type="button" onClick={retry}>
          Retry
        </button>
      </div>
    );
  }
  if (entitlement.capabilities.includes(capability)) return children;

  return (
    <section className="capability-locked" aria-label={label}>
      <strong>{label}</strong>
      <span>Not included in this workspace plan.</span>
    </section>
  );
}
