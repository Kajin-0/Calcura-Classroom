import { describe, expect, it } from 'vitest';
import {
  assignmentActivities,
  getAssignmentActivity,
  isAssignmentActivityKey,
} from '../../src/contracts/assignmentActivities';

describe('versioned assignment activity contract', () => {
  it('publishes exactly the six supported V1 activity keys', () => {
    expect(assignmentActivities.map((activity) => activity.key)).toEqual([
      'integration.basic_trig.v1',
      'integration.u_substitution.v1',
      'integration.log_u_substitution.v1',
      'integration.by_parts.v1',
      'integration.inverse_trig.v1',
      'integration.partial_fractions.v1',
    ]);
  });

  it('keeps the keys unique and contract-versioned', () => {
    const keys = assignmentActivities.map((activity) => activity.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(
      assignmentActivities.every((activity) => activity.contractVersion === 1),
    ).toBe(true);
    expect(
      assignmentActivities.every(
        (activity) => activity.subject === 'integration',
      ),
    ).toBe(true);
  });

  it('exposes teacher-facing labels without persisting Calcura taxonomy IDs', () => {
    expect(assignmentActivities.map((activity) => activity.label)).toEqual([
      'Basic trigonometric integration',
      'U-substitution',
      'Logarithmic U-substitution',
      'Integration by parts',
      'Inverse-trigonometric forms',
      'Partial fractions',
    ]);
    expect(
      getAssignmentActivity('integration.partial_fractions.v1')?.label,
    ).toBe('Partial fractions');
    expect(isAssignmentActivityKey('integration.partial_fractions.v1')).toBe(
      true,
    );
    expect(isAssignmentActivityKey('partialFractions.distinctLinear')).toBe(
      false,
    );
  });
});
