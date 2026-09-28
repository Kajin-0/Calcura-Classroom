import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../lib/supabase/client';
import {
  failure,
  mapClassroomError,
  type ServiceResult,
} from '../../lib/supabase/serviceResult';
import type { Database } from '../../types/database.generated';
import type { AssignmentItemSummary } from './assignmentService';

type Client = SupabaseClient<Database>;

export interface AssignmentProblemSlot {
  id: string;
  assignment_item_id: string;
  position: number;
  source_ordinal: number;
  regeneration_seed: string | null;
  locked: boolean;
  slot_spec_version: 1;
  created_at: string;
  updated_at: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);
const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

export function parseAssignmentProblemSlots(
  value: unknown,
): AssignmentProblemSlot[] | null {
  if (!Array.isArray(value)) return null;
  const rows: AssignmentProblemSlot[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    if (
      !isUuid(raw.id) ||
      ids.has(raw.id) ||
      !isUuid(raw.assignment_item_id) ||
      !Number.isInteger(raw.position) ||
      Number(raw.position) < 0 ||
      Number(raw.position) > 19 ||
      !Number.isInteger(raw.source_ordinal) ||
      Number(raw.source_ordinal) < 1 ||
      Number(raw.source_ordinal) > 20 ||
      (raw.regeneration_seed !== null && !isUuid(raw.regeneration_seed)) ||
      typeof raw.locked !== 'boolean' ||
      raw.slot_spec_version !== 1 ||
      !isTimestamp(raw.created_at) ||
      !isTimestamp(raw.updated_at)
    ) {
      return null;
    }
    ids.add(raw.id);
    rows.push({
      id: raw.id,
      assignment_item_id: raw.assignment_item_id,
      position: Number(raw.position),
      source_ordinal: Number(raw.source_ordinal),
      regeneration_seed: raw.regeneration_seed,
      locked: raw.locked,
      slot_spec_version: 1,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
    });
  }
  return rows;
}

export function groupAssignmentProblemSlots(
  rows: AssignmentProblemSlot[],
  items: AssignmentItemSummary[],
): Map<string, AssignmentProblemSlot[]> | null {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const groups = new Map<string, AssignmentProblemSlot[]>();
  for (const row of rows) {
    if (!itemById.has(row.assignment_item_id)) return null;
    const group = groups.get(row.assignment_item_id) ?? [];
    group.push(row);
    groups.set(row.assignment_item_id, group);
  }
  for (const [itemId, group] of groups) {
    const item = itemById.get(itemId);
    if (!item || group.length !== item.problem_count) return null;
    const sorted = [...group].sort(
      (left, right) => left.position - right.position,
    );
    const sourceOrdinals = new Set<number>();
    for (const [index, slot] of sorted.entries()) {
      if (
        slot.position !== index ||
        slot.source_ordinal < 1 ||
        slot.source_ordinal > item.problem_count ||
        sourceOrdinals.has(slot.source_ordinal)
      ) {
        return null;
      }
      sourceOrdinals.add(slot.source_ordinal);
    }
    groups.set(itemId, sorted);
  }
  return groups;
}

const clientOrFailure = (client: Client | null): ServiceResult<Client> =>
  client ? { ok: true, value: client } : failure('not_configured');

const mapFailure = <T>(error: unknown): ServiceResult<T> => ({
  ok: false,
  error: mapClassroomError(error),
});

async function parseRpcRows(
  request: PromiseLike<{ data: unknown; error: unknown }>,
  expectedCount?: number,
): Promise<ServiceResult<AssignmentProblemSlot[]>> {
  try {
    const { data, error } = await request;
    if (error) return mapFailure(error);
    const rows = parseAssignmentProblemSlots(data);
    if (
      rows === null ||
      (expectedCount !== undefined && rows.length !== expectedCount)
    ) {
      return failure('unexpected');
    }
    return { ok: true, value: rows };
  } catch (error) {
    return mapFailure(error);
  }
}

export async function listAssignmentProblemSlots(
  items: AssignmentItemSummary[],
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<AssignmentProblemSlot[]>> {
  const resolved = clientOrFailure(client);
  if (!resolved.ok) return resolved;
  if (items.length === 0) return { ok: true, value: [] };
  try {
    const { data, error } = await resolved.value
      .from('assignment_problem_slots')
      .select(
        'id,assignment_item_id,position,source_ordinal,regeneration_seed,locked,slot_spec_version,created_at,updated_at',
      )
      .in(
        'assignment_item_id',
        items.map((item) => item.id),
      )
      .order('assignment_item_id', { ascending: true })
      .order('position', { ascending: true });
    if (error) return mapFailure(error);
    const rows = parseAssignmentProblemSlots(data);
    if (rows === null || !groupAssignmentProblemSlots(rows, items)) {
      return failure('unexpected');
    }
    return { ok: true, value: rows };
  } catch (error) {
    return mapFailure(error);
  }
}

export async function prepareAssignmentProblemSlots(
  assignmentId: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<AssignmentProblemSlot[]>> {
  const resolved = clientOrFailure(client);
  if (!resolved.ok) return resolved;
  return parseRpcRows(
    resolved.value.rpc('prepare_assignment_problem_slots', {
      p_assignment_id: assignmentId,
    }),
  );
}

export async function regenerateAssignmentProblemSlot(
  slotId: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<AssignmentProblemSlot>> {
  const resolved = clientOrFailure(client);
  if (!resolved.ok) return resolved;
  const result = await parseRpcRows(
    resolved.value.rpc('regenerate_assignment_problem_slot', {
      p_slot_id: slotId,
    }),
    1,
  );
  if (!result.ok) return result;
  const row = result.value[0];
  return row ? { ok: true, value: row } : failure('unexpected');
}

export async function regenerateUnlockedAssignmentProblemSlots(
  assignmentItemId: string,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<AssignmentProblemSlot[]>> {
  const resolved = clientOrFailure(client);
  if (!resolved.ok) return resolved;
  return parseRpcRows(
    resolved.value.rpc('regenerate_unlocked_assignment_problem_slots', {
      p_assignment_item_id: assignmentItemId,
    }),
  );
}

export async function setAssignmentProblemSlotLocked(
  slotId: string,
  locked: boolean,
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<AssignmentProblemSlot>> {
  const resolved = clientOrFailure(client);
  if (!resolved.ok) return resolved;
  const result = await parseRpcRows(
    resolved.value.rpc('set_assignment_problem_slot_locked', {
      p_slot_id: slotId,
      p_locked: locked,
    }),
    1,
  );
  if (!result.ok) return result;
  const row = result.value[0];
  return row ? { ok: true, value: row } : failure('unexpected');
}

export async function reorderAssignmentProblemSlots(
  assignmentItemId: string,
  orderedSlotIds: string[],
  client: Client | null = getSupabaseClient(),
): Promise<ServiceResult<AssignmentProblemSlot[]>> {
  const resolved = clientOrFailure(client);
  if (!resolved.ok) return resolved;
  if (
    orderedSlotIds.some((id) => !isUuid(id)) ||
    new Set(orderedSlotIds).size !== orderedSlotIds.length
  ) {
    return failure('unexpected');
  }
  return parseRpcRows(
    resolved.value.rpc('reorder_assignment_problem_slots', {
      p_assignment_item_id: assignmentItemId,
      p_ordered_slot_ids: orderedSlotIds,
    }),
    orderedSlotIds.length,
  );
}
