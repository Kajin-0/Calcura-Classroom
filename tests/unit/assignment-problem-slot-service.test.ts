import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  groupAssignmentProblemSlots,
  parseAssignmentProblemSlots,
  prepareAssignmentProblemSlots,
  regenerateAssignmentProblemSlot,
  reorderAssignmentProblemSlots,
} from '../../src/features/assignments/assignmentProblemSlotService';
import type { AssignmentItemSummary } from '../../src/features/assignments/assignmentService';
import type { Database } from '../../src/types/database.generated';

const item: AssignmentItemSummary = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  assignment_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  position: 0,
  activity_contract_version: 1,
  activity_key: 'integration.u_substitution.v1',
  problem_count: 2,
  generation_spec_version: 1,
  difficulty_profile: 'auto',
  variant_policy: 'individualized',
  generation_seed: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  created_at: '2026-09-28T10:00:00Z',
  updated_at: '2026-09-28T10:00:00Z',
};

const slots = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    assignment_item_id: item.id,
    position: 0,
    source_ordinal: 1,
    regeneration_seed: null,
    locked: false,
    slot_spec_version: 1,
    created_at: '2026-09-28T10:00:00Z',
    updated_at: '2026-09-28T10:00:00Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    assignment_item_id: item.id,
    position: 1,
    source_ordinal: 2,
    regeneration_seed: '33333333-3333-4333-8333-333333333333',
    locked: true,
    slot_spec_version: 1,
    created_at: '2026-09-28T10:00:00Z',
    updated_at: '2026-09-28T10:00:00Z',
  },
];

const clientMock = (rpc: ReturnType<typeof vi.fn>) =>
  ({ rpc }) as unknown as SupabaseClient<Database>;

describe('assignment problem slot service', () => {
  it('parses bounded slot rows and sorts/group-validates complete item overlays', () => {
    const parsed = parseAssignmentProblemSlots(slots);
    expect(parsed).toHaveLength(2);
    expect(groupAssignmentProblemSlots([...parsed!].reverse(), [item])).toEqual(
      new Map([[item.id, parsed]]),
    );
    expect(groupAssignmentProblemSlots(parsed!.slice(0, 1), [item])).toBeNull();
    expect(
      groupAssignmentProblemSlots(parsed!, [{ ...item, problem_count: 3 }]),
    ).toBeNull();
    expect(groupAssignmentProblemSlots([], [item])).toEqual(new Map());
  });

  it('rejects malformed IDs, duplicate IDs, position gaps and unsupported versions', () => {
    expect(
      parseAssignmentProblemSlots([{ ...slots[0], id: 'not-a-uuid' }]),
    ).toBeNull();
    expect(parseAssignmentProblemSlots([slots[0], slots[0]])).toBeNull();
    const gap = parseAssignmentProblemSlots([
      slots[0]!,
      { ...slots[1]!, position: 4 },
    ]);
    expect(gap).not.toBeNull();
    expect(groupAssignmentProblemSlots(gap!, [item])).toBeNull();
    expect(
      parseAssignmentProblemSlots([
        slots[0],
        { ...slots[1], slot_spec_version: 2 },
      ]),
    ).toBeNull();
  });

  it('calls narrow preparation and regeneration RPCs and rejects malformed responses', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: slots, error: null });
    const client = clientMock(rpc);
    await expect(
      prepareAssignmentProblemSlots(item.assignment_id, client),
    ).resolves.toMatchObject({
      ok: true,
      value: slots,
    });
    expect(rpc).toHaveBeenCalledWith('prepare_assignment_problem_slots', {
      p_assignment_id: item.assignment_id,
    });

    rpc.mockResolvedValueOnce({ data: [slots[1]], error: null });
    await expect(
      regenerateAssignmentProblemSlot(slots[1]!.id, client),
    ).resolves.toMatchObject({
      ok: true,
      value: slots[1],
    });

    rpc.mockResolvedValueOnce({ data: [slots[0]], error: null });
    await expect(
      reorderAssignmentProblemSlots(
        item.id,
        [slots[0]!.id, slots[0]!.id],
        client,
      ),
    ).resolves.toMatchObject({ ok: false });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
