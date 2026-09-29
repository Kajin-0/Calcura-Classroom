export type ClassroomErrorCode =
  | 'not_configured'
  | 'not_authorized'
  | 'workspace_not_found'
  | 'class_not_found'
  | 'invalid_class_name'
  | 'invalid_join_code'
  | 'class_archived'
  | 'invalid_assignment_title'
  | 'invalid_due_date'
  | 'invalid_activity_key'
  | 'invalid_assignment_generation_spec'
  | 'invalid_problem_count'
  | 'assignment_not_found'
  | 'invalid_assignment_transition'
  | 'assignment_requires_items'
  | 'assignment_has_results'
  | 'only_drafts_can_be_discarded'
  | 'invalid_assignment_item_order'
  | 'classroom_inactive'
  | 'checkout_in_progress'
  | 'checkout_processing'
  | 'checkout_expired'
  | 'subscription_exists'
  | 'billing_unavailable'
  | 'unexpected';

export interface ClassroomError {
  code: ClassroomErrorCode;
  message: string;
}

export type ServiceResult<T> =
  { ok: true; value: T } | { ok: false; error: ClassroomError };

const userMessages: Record<ClassroomErrorCode, string> = {
  not_configured: 'Classroom data is not configured on this installation.',
  not_authorized: 'You do not have access to this Classroom item.',
  workspace_not_found: 'The requested workspace is unavailable.',
  class_not_found: 'The requested class is unavailable.',
  invalid_class_name: 'Enter a class name between 1 and 120 characters.',
  invalid_join_code: 'That class code is invalid. Check it and try again.',
  class_archived: 'That class is archived and cannot accept new students.',
  invalid_assignment_title:
    'Enter an assignment title between 1 and 160 characters.',
  invalid_due_date: 'Enter a valid due date and time.',
  invalid_activity_key: 'Choose a supported practice activity.',
  invalid_assignment_generation_spec:
    'Choose generation options supported by this practice activity.',
  invalid_problem_count: 'Choose between 1 and 20 problems for each block.',
  assignment_not_found: 'The requested assignment is unavailable.',
  invalid_assignment_transition:
    'This assignment can no longer make that change.',
  assignment_requires_items:
    'Add at least one practice block before publishing.',
  assignment_has_results:
    'This assignment has student results and cannot be deleted. Duplicate it to make changes.',
  only_drafts_can_be_discarded: 'Only draft assignments can be discarded.',
  invalid_assignment_item_order:
    'The practice block order changed. Reload and try again.',
  classroom_inactive:
    'This class is not active and cannot publish assignments.',
  checkout_in_progress:
    'Another checkout is already active for this workspace. Open the plan you previously selected to resume it, or wait for that checkout to expire before changing billing interval.',
  checkout_processing:
    'Your checkout has completed and Stripe is still confirming the subscription. Check plan status again shortly.',
  checkout_expired: 'That checkout has expired. Try opening checkout again.',
  subscription_exists:
    'This workspace already has a Stripe subscription. Use Manage billing to make changes.',
  billing_unavailable: 'Billing is temporarily unavailable. Try again shortly.',
  unexpected: 'We could not complete that request. Try again.',
};

export function mapClassroomError(error: unknown): ClassroomError {
  const providerError =
    typeof error === 'object' && error !== null
      ? (error as { code?: unknown; message?: unknown })
      : {};
  const providerCode =
    typeof providerError.code === 'string' ? providerError.code : '';
  const providerMessage =
    typeof providerError.message === 'string' ? providerError.message : '';
  let code: ClassroomErrorCode = 'unexpected';

  if (providerCode === '42501') {
    code = 'not_authorized';
  } else if (providerCode === 'PGRST116') {
    code = 'class_not_found';
  } else if (providerCode === 'P0001') {
    if (providerMessage === 'invalid_join_code') code = 'invalid_join_code';
    else if (providerMessage === 'class_archived') code = 'class_archived';
    else if (providerMessage === 'not_authorized') code = 'not_authorized';
    else if (providerMessage === 'assignment_requires_items')
      code = 'assignment_requires_items';
    else if (providerMessage === 'assignment_has_results')
      code = 'assignment_has_results';
    else if (providerMessage === 'only_drafts_can_be_discarded')
      code = 'only_drafts_can_be_discarded';
    else if (providerMessage === 'invalid_assignment_item_order')
      code = 'invalid_assignment_item_order';
    else if (providerMessage === 'invalid_assignment_transition')
      code = 'invalid_assignment_transition';
    else if (providerMessage === 'classroom_inactive')
      code = 'classroom_inactive';
  }

  return { code, message: userMessages[code] };
}

export const failure = <T>(code: ClassroomErrorCode): ServiceResult<T> => ({
  ok: false,
  error: { code, message: userMessages[code] },
});
