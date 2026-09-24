export interface AssignmentActivity {
  key: string;
  contractVersion: 1;
  label: string;
  description: string;
  subject: 'integration';
}

export const assignmentActivities = [
  {
    key: 'integration.basic_trig.v1',
    contractVersion: 1,
    label: 'Basic trigonometric integration',
    description: 'Practice standard trigonometric integration forms.',
    subject: 'integration',
  },
  {
    key: 'integration.u_substitution.v1',
    contractVersion: 1,
    label: 'U-substitution',
    description: 'Practice recognizing and applying substitution.',
    subject: 'integration',
  },
  {
    key: 'integration.log_u_substitution.v1',
    contractVersion: 1,
    label: 'Logarithmic U-substitution',
    description: 'Practice logarithmic forms suited to substitution.',
    subject: 'integration',
  },
  {
    key: 'integration.by_parts.v1',
    contractVersion: 1,
    label: 'Integration by parts',
    description: 'Practice integration by parts across common forms.',
    subject: 'integration',
  },
  {
    key: 'integration.inverse_trig.v1',
    contractVersion: 1,
    label: 'Inverse-trigonometric forms',
    description:
      'Practice integrals that resolve to inverse-trigonometric forms.',
    subject: 'integration',
  },
  {
    key: 'integration.partial_fractions.v1',
    contractVersion: 1,
    label: 'Partial fractions',
    description: 'Practice rational integration using partial fractions.',
    subject: 'integration',
  },
] as const satisfies readonly AssignmentActivity[];

export type AssignmentActivityKey =
  (typeof assignmentActivities)[number]['key'];

export function isAssignmentActivityKey(
  key: string,
): key is AssignmentActivityKey {
  return assignmentActivities.some((activity) => activity.key === key);
}

export function getAssignmentActivity(key: string) {
  return assignmentActivities.find((activity) => activity.key === key);
}
