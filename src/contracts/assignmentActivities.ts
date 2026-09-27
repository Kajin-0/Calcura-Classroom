export interface AssignmentActivity {
  key: string;
  contractVersion: 1;
  label: string;
  description: string;
  subject: 'integration';
  difficultyProfiles: readonly AssignmentDifficultyProfile[];
}

export type AssignmentDifficultyProfile =
  'auto' | 'beginner' | 'intermediate' | 'advanced';

export type AssignmentVariantPolicy = 'individualized' | 'same_for_all';

export const assignmentDifficultyLabels: Record<
  AssignmentDifficultyProfile,
  string
> = {
  auto: 'Auto',
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const assignmentActivities = [
  {
    key: 'integration.basic_trig.v1',
    contractVersion: 1,
    label: 'Basic trigonometric integration',
    description: 'Practice standard trigonometric integration forms.',
    subject: 'integration',
    difficultyProfiles: ['auto', 'beginner', 'intermediate'],
  },
  {
    key: 'integration.u_substitution.v1',
    contractVersion: 1,
    label: 'U-substitution',
    description: 'Practice recognizing and applying substitution.',
    subject: 'integration',
    difficultyProfiles: ['auto', 'beginner', 'intermediate'],
  },
  {
    key: 'integration.log_u_substitution.v1',
    contractVersion: 1,
    label: 'Logarithmic U-substitution',
    description: 'Practice logarithmic forms suited to substitution.',
    subject: 'integration',
    difficultyProfiles: ['auto', 'intermediate'],
  },
  {
    key: 'integration.by_parts.v1',
    contractVersion: 1,
    label: 'Integration by parts',
    description: 'Practice integration by parts across common forms.',
    subject: 'integration',
    difficultyProfiles: ['auto', 'advanced'],
  },
  {
    key: 'integration.inverse_trig.v1',
    contractVersion: 1,
    label: 'Inverse-trigonometric forms',
    description:
      'Practice integrals that resolve to inverse-trigonometric forms.',
    subject: 'integration',
    difficultyProfiles: ['auto', 'intermediate'],
  },
  {
    key: 'integration.partial_fractions.v1',
    contractVersion: 1,
    label: 'Partial fractions',
    description: 'Practice rational integration using partial fractions.',
    subject: 'integration',
    difficultyProfiles: ['auto', 'intermediate'],
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

export function isSupportedAssignmentDifficulty(
  activityKey: string,
  profile: string,
): profile is AssignmentDifficultyProfile {
  return assignmentActivities.some(
    (activity) =>
      activity.key === activityKey &&
      (
        activity.difficultyProfiles as readonly AssignmentDifficultyProfile[]
      ).includes(profile as AssignmentDifficultyProfile),
  );
}
