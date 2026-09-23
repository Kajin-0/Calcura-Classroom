export type WorkspaceType = 'personal' | 'organization';

export type WorkspaceRole = 'owner' | 'admin' | 'educator';

export interface LearningEventV1 {
  eventVersion: 1;
  userId: string;
  classId?: string;
  assignmentId?: string;
  problemId?: string;
  mode?: string;
  skill?: string;
  technique?: string;
  stage?: string;
  outcome: string;
  attemptNumber?: number;
  durationMs?: number;
  hintUsed?: boolean;
  errorClass?: string;
  occurredAt: string;
}
