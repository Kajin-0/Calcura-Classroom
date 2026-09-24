export type ClassroomErrorCode =
  | 'not_configured'
  | 'not_authorized'
  | 'workspace_not_found'
  | 'class_not_found'
  | 'invalid_class_name'
  | 'invalid_join_code'
  | 'class_archived'
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
  }

  return { code, message: userMessages[code] };
}

export const failure = <T>(code: ClassroomErrorCode): ServiceResult<T> => ({
  ok: false,
  error: { code, message: userMessages[code] },
});
