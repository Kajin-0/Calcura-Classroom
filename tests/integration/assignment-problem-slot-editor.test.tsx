import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AssignmentProblemSlotEditor } from '../../src/features/assignments/AssignmentProblemSlotEditor';
import type { AssignmentItemSummary } from '../../src/features/assignments/assignmentService';
import {
  regenerateAssignmentProblemSlot,
  regenerateUnlockedAssignmentProblemSlots,
  reorderAssignmentProblemSlots,
  setAssignmentProblemSlotLocked,
  type AssignmentProblemSlot,
} from '../../src/features/assignments/assignmentProblemSlotService';

vi.mock('../../src/features/assignments/assignmentProblemSlotService', () => ({
  regenerateAssignmentProblemSlot: vi.fn(),
  regenerateUnlockedAssignmentProblemSlots: vi.fn(),
  reorderAssignmentProblemSlots: vi.fn(),
  setAssignmentProblemSlotLocked: vi.fn(),
}));

const item: AssignmentItemSummary = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  assignment_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  position: 0,
  activity_contract_version: 1,
  activity_key: 'integration.u_substitution.v1',
  problem_count: 3,
  generation_spec_version: 1,
  difficulty_profile: 'auto',
  variant_policy: 'individualized',
  generation_seed: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  created_at: '2026-09-28T10:00:00Z',
  updated_at: '2026-09-28T10:00:00Z',
};

const initialSlots: AssignmentProblemSlot[] = [1, 2, 3].map((ordinal) => ({
  id: `${ordinal}${ordinal}${ordinal}${ordinal}${ordinal}${ordinal}${ordinal}${ordinal}-0000-4000-8000-00000000000${ordinal}`,
  assignment_item_id: item.id,
  position: ordinal - 1,
  source_ordinal: ordinal,
  regeneration_seed: null,
  locked: false,
  slot_spec_version: 1,
  created_at: '2026-09-28T10:00:00Z',
  updated_at: '2026-09-28T10:00:00Z',
}));

function Harness({
  variantPolicy = 'individualized',
}: {
  variantPolicy?: string;
}) {
  const [slots, setSlots] = useState(initialSlots);
  return (
    <AssignmentProblemSlotEditor
      item={{
        ...item,
        variant_policy: variantPolicy as 'individualized' | 'same_for_all',
      }}
      slots={slots}
      onSlotsChange={setSlots}
    />
  );
}

describe('assignment problem slot editor', () => {
  it('selects a preview slot and labels individualized output as representative', () => {
    render(<Harness />);
    expect(screen.getByText(/Representative preview/)).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Problem 2, unlocked' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Preview · Problem 2' }),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Set VITE_CALCURA_APP_ORIGIN to enable Calcura preview.',
      ),
    ).toBeVisible();
  });

  it('labels same-for-all previews exact', () => {
    render(<Harness variantPolicy="same_for_all" />);
    expect(
      screen.getByText('Exact preview — students receive this problem.'),
    ).toBeVisible();
  });

  it('regenerates, locks/unlocks, reorders and confirms bulk regeneration', async () => {
    vi.mocked(regenerateAssignmentProblemSlot).mockImplementation(
      async (id) => {
        const slot = initialSlots.find((candidate) => candidate.id === id)!;
        return {
          ok: true,
          value: {
            ...slot,
            regeneration_seed: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          },
        };
      },
    );
    vi.mocked(setAssignmentProblemSlotLocked).mockImplementation(
      async (id, locked) => {
        const slot = initialSlots.find((candidate) => candidate.id === id)!;
        return { ok: true, value: { ...slot, locked } };
      },
    );
    vi.mocked(reorderAssignmentProblemSlots).mockImplementation(
      async (_itemId, ids) => ({
        ok: true,
        value: ids.map((id, position) => ({
          ...initialSlots.find((slot) => slot.id === id)!,
          position,
        })),
      }),
    );
    vi.mocked(regenerateUnlockedAssignmentProblemSlots).mockResolvedValue({
      ok: true,
      value: initialSlots.map((slot) => ({
        ...slot,
        regeneration_seed: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      })),
    });

    render(<Harness />);
    const firstSlotRow = screen.getAllByRole('listitem')[0]!;
    fireEvent.click(
      within(firstSlotRow).getByRole('button', { name: 'Regenerate' }),
    );
    expect(await screen.findByText('Problem 1 regenerated.')).toBeVisible();
    expect(regenerateAssignmentProblemSlot).toHaveBeenCalledWith(
      initialSlots[0]!.id,
    );

    fireEvent.click(within(firstSlotRow).getByRole('button', { name: 'Lock' }));
    expect(await screen.findByText('Problem 1 locked.')).toBeVisible();
    expect(
      within(firstSlotRow).getByRole('button', { name: 'Regenerate' }),
    ).toBeDisabled();
    fireEvent.click(
      within(firstSlotRow).getByRole('button', { name: 'Unlock' }),
    );
    expect(await screen.findByText('Problem 1 unlocked.')).toBeVisible();

    fireEvent.click(
      within(firstSlotRow).getByRole('button', { name: 'Move down' }),
    );
    expect(reorderAssignmentProblemSlots).toHaveBeenCalledWith(item.id, [
      initialSlots[1]!.id,
      initialSlots[0]!.id,
      initialSlots[2]!.id,
    ]);
    expect(
      await screen.findByText(
        'Problem order updated. Generated problems stay the same.',
      ),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: 'Regenerate unlocked' }),
    );
    expect(screen.getByText(/Regenerate every unlocked problem/)).toBeVisible();
    expect(regenerateUnlockedAssignmentProblemSlots).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm regeneration' }),
    );
    expect(
      await screen.findByText(/unlocked problems regenerated/),
    ).toBeVisible();
    expect(regenerateUnlockedAssignmentProblemSlots).toHaveBeenCalledWith(
      item.id,
    );
  });
});
