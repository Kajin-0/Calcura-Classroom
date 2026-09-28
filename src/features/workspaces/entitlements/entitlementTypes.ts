export const ENTITLEMENT_PLANS = [
  'teacher_free',
  'pro',
  'team',
  'school',
  'institution',
] as const;

export type EntitlementPlan = (typeof ENTITLEMENT_PLANS)[number];

export const WORKSPACE_CAPABILITIES = [
  'basic_classroom',
  'basic_assignments',
  'basic_analytics',
  'advanced_analytics',
  'advanced_assignment_editing',
  'result_export',
  'larger_class_limits',
  'multiple_teacher_workspace',
  'school_admin',
  'institution_integrations',
] as const;

export type WorkspaceCapability = (typeof WORKSPACE_CAPABILITIES)[number];
export type EntitlementStatus = 'active' | 'trialing';
export type EntitlementSource = 'default' | 'manual' | 'stripe' | 'institution';

export interface WorkspaceEntitlement {
  workspaceId: string;
  plan: EntitlementPlan;
  status: EntitlementStatus;
  source: EntitlementSource;
  effectiveAt: string;
  expiresAt: string | null;
  capabilities: WorkspaceCapability[];
}

export const ENTITLEMENT_PLAN_LABELS: Record<EntitlementPlan, string> = {
  teacher_free: 'Teacher Free',
  pro: 'Pro',
  team: 'Team',
  school: 'School',
  institution: 'Institution',
};
