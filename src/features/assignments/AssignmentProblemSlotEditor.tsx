import { useEffect, useMemo, useRef, useState } from 'react';
import { useReorderMotion } from '../../lib/ui/useReorderMotion';
import { resolveCalcuraPreviewTarget } from './calcuraPreviewTarget';
import type { AssignmentItemSummary } from './assignmentService';
import {
  regenerateAssignmentProblemSlot,
  regenerateUnlockedAssignmentProblemSlots,
  reorderAssignmentProblemSlots,
  setAssignmentProblemSlotLocked,
  type AssignmentProblemSlot,
} from './assignmentProblemSlotService';

interface PreviewIntent {
  version: 1;
  type: 'calcura-classroom-problem-preview-request';
  requestId: string;
  problemOrdinal: number;
  item: {
    id: string;
    position: number;
    activity_contract_version: number;
    activity_key: string;
    problem_count: number;
    generation_spec_version: number;
    difficulty_profile: string;
    variant_policy: string;
    generation_seed: string;
    problem_slots: Array<{
      id: string;
      position: number;
      source_ordinal: number;
      regeneration_seed: string | null;
      locked: boolean;
      slot_spec_version: 1;
    }>;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function previewRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AssignmentProblemSlotEditor({
  item,
  slots,
  onSlotsChange,
}: {
  item: AssignmentItemSummary;
  slots: AssignmentProblemSlot[];
  onSlotsChange: (slots: AssignmentProblemSlot[]) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const activeRequestId = useRef('');
  const previewReadyRef = useRef(false);
  const previewTarget = resolveCalcuraPreviewTarget({
    VITE_CALCURA_APP_URL: import.meta.env.VITE_CALCURA_APP_URL,
    VITE_CALCURA_APP_ORIGIN: import.meta.env.VITE_CALCURA_APP_ORIGIN,
  });
  const origin = previewTarget?.origin ?? null;
  const [selectedSlotId, setSelectedSlotId] = useState(slots[0]?.id ?? '');
  const [previewReady, setPreviewReady] = useState(false);
  const [previewState, setPreviewState] = useState<
    'connecting' | 'rendering' | 'ready' | 'unavailable' | 'error'
  >(origin ? 'connecting' : 'unavailable');
  const [pendingSlotId, setPendingSlotId] = useState<string | null>(null);
  const [bulkPending, setBulkPending] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const sortedSlots = useMemo(
    () => [...slots].sort((left, right) => left.position - right.position),
    [slots],
  );
  const listRef = useReorderMotion(
    sortedSlots.map((slot) => slot.id).join(','),
  );
  const effectiveSelectedSlotId = sortedSlots.some(
    (slot) => slot.id === selectedSlotId,
  )
    ? selectedSlotId
    : (sortedSlots[0]?.id ?? '');
  const selectedIndex = sortedSlots.findIndex(
    (slot) => slot.id === effectiveSelectedSlotId,
  );
  const selectedSlot = selectedIndex >= 0 ? sortedSlots[selectedIndex] : null;
  const previewUrl = previewTarget?.appUrl ?? null;
  const previewIntent = useMemo<PreviewIntent | null>(() => {
    if (
      !selectedSlot ||
      item.generation_spec_version !== 1 ||
      !item.generation_seed ||
      (item.difficulty_profile !== 'auto' &&
        item.difficulty_profile !== 'beginner' &&
        item.difficulty_profile !== 'intermediate' &&
        item.difficulty_profile !== 'advanced') ||
      (item.variant_policy !== 'individualized' &&
        item.variant_policy !== 'same_for_all')
    ) {
      return null;
    }
    return {
      version: 1,
      type: 'calcura-classroom-problem-preview-request',
      requestId: previewRequestId(),
      problemOrdinal: selectedSlot.position + 1,
      item: {
        id: item.id,
        position: item.position,
        activity_contract_version: item.activity_contract_version,
        activity_key: item.activity_key,
        problem_count: item.problem_count,
        generation_spec_version: item.generation_spec_version,
        difficulty_profile: item.difficulty_profile,
        variant_policy: item.variant_policy,
        generation_seed: item.generation_seed,
        problem_slots: sortedSlots.map((slot) => ({
          id: slot.id,
          position: slot.position,
          source_ordinal: slot.source_ordinal,
          regeneration_seed: slot.regeneration_seed,
          locked: slot.locked,
          slot_spec_version: 1,
        })),
      },
    };
  }, [item, selectedSlot, sortedSlots]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (
        !origin ||
        event.origin !== origin ||
        event.source !== iframeRef.current?.contentWindow ||
        !isRecord(event.data) ||
        event.data.version !== 1 ||
        typeof event.data.type !== 'string'
      ) {
        return;
      }
      if (
        event.data.type === 'calcura-classroom-problem-preview-ready' &&
        Object.keys(event.data).length === 2 &&
        Object.prototype.hasOwnProperty.call(event.data, 'version') &&
        Object.prototype.hasOwnProperty.call(event.data, 'type')
      ) {
        previewReadyRef.current = true;
        setPreviewReady(true);
        setPreviewState('rendering');
        return;
      }
      const replyType = event.data.type;
      const requestId = event.data.requestId;
      if (
        requestId === activeRequestId.current &&
        Object.keys(event.data).length === 3 &&
        replyType === 'calcura-classroom-problem-preview-rendered'
      ) {
        setPreviewState('ready');
      } else if (
        requestId === activeRequestId.current &&
        Object.keys(event.data).length === 3 &&
        replyType === 'calcura-classroom-problem-preview-error'
      ) {
        setPreviewState('error');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [origin]);

  useEffect(() => {
    if (!previewReady || !previewIntent || !origin) return;
    activeRequestId.current = previewIntent.requestId;
    iframeRef.current?.contentWindow?.postMessage(previewIntent, origin);
  }, [previewReady, previewIntent, origin]);

  const updateSlot = (updated: AssignmentProblemSlot) => {
    onSlotsChange(
      slots.map((slot) => (slot.id === updated.id ? updated : slot)),
    );
  };

  const regenerate = async (slot: AssignmentProblemSlot) => {
    if (pendingSlotId || bulkPending || slot.locked) return;
    setPendingSlotId(slot.id);
    setFeedback('');
    setFeedbackIsError(false);
    const result = await regenerateAssignmentProblemSlot(slot.id);
    setPendingSlotId(null);
    if (!result.ok) {
      setFeedbackIsError(true);
      setFeedback(result.error.message);
      return;
    }
    setPreviewState('rendering');
    updateSlot(result.value);
    setFeedback(`Problem ${slot.position + 1} regenerated.`);
  };

  const toggleLock = async (slot: AssignmentProblemSlot) => {
    if (pendingSlotId || bulkPending) return;
    setPendingSlotId(slot.id);
    setFeedback('');
    setFeedbackIsError(false);
    const result = await setAssignmentProblemSlotLocked(slot.id, !slot.locked);
    setPendingSlotId(null);
    if (!result.ok) {
      setFeedbackIsError(true);
      setFeedback(result.error.message);
      return;
    }
    updateSlot(result.value);
    setFeedback(
      `Problem ${slot.position + 1} ${slot.locked ? 'unlocked' : 'locked'}.`,
    );
  };

  const moveSlot = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (
      target < 0 ||
      target >= sortedSlots.length ||
      pendingSlotId ||
      bulkPending
    )
      return;
    const reordered = [...sortedSlots];
    const currentSlot = reordered[index];
    const targetSlot = reordered[target];
    if (!currentSlot || !targetSlot) return;
    reordered[index] = targetSlot;
    reordered[target] = currentSlot;
    setPendingSlotId(sortedSlots[index]?.id ?? 'reorder');
    setFeedback('');
    setFeedbackIsError(false);
    const result = await reorderAssignmentProblemSlots(
      item.id,
      reordered.map((slot) => slot.id),
    );
    setPendingSlotId(null);
    if (!result.ok) {
      setFeedbackIsError(true);
      setFeedback(result.error.message);
      return;
    }
    setPreviewState('rendering');
    onSlotsChange(result.value);
    setFeedback('Problem order updated. Generated problems stay the same.');
  };

  const regenerateUnlocked = async () => {
    if (pendingSlotId || bulkPending) return;
    setBulkPending(true);
    setConfirmBulk(false);
    setFeedback('');
    setFeedbackIsError(false);
    const result = await regenerateUnlockedAssignmentProblemSlots(item.id);
    setBulkPending(false);
    if (!result.ok) {
      setFeedbackIsError(true);
      setFeedback(result.error.message);
      return;
    }
    setPreviewState('rendering');
    const seedsById = new Map(result.value.map((slot) => [slot.id, slot]));
    onSlotsChange(slots.map((slot) => seedsById.get(slot.id) ?? slot));
    setFeedback(
      `${result.value.length} unlocked problem${result.value.length === 1 ? '' : 's'} regenerated.`,
    );
  };

  return (
    <section
      className="problem-slot-editor"
      aria-labelledby={`slot-editor-${item.id}`}
    >
      <div className="problem-slot-editor-heading">
        <div>
          <h3 id={`slot-editor-${item.id}`}>Individual problems</h3>
          <p className="muted-copy">
            Select a problem to preview it. Locks protect problems from
            regeneration.
          </p>
        </div>
        <button
          className="inline-link"
          type="button"
          onClick={() => setConfirmBulk(true)}
          disabled={
            bulkPending ||
            pendingSlotId !== null ||
            !sortedSlots.some((slot) => !slot.locked)
          }
        >
          Regenerate unlocked
        </button>
      </div>

      {confirmBulk ? (
        <div
          className="problem-slot-confirm"
          role="group"
          aria-label="Confirm bulk regeneration"
        >
          <p>
            Regenerate every unlocked problem in this block? Locked problems
            will stay unchanged.
          </p>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void regenerateUnlocked()}
          >
            Confirm regeneration
          </button>
          <button
            className="inline-link"
            type="button"
            onClick={() => setConfirmBulk(false)}
          >
            Cancel
          </button>
        </div>
      ) : null}

      <div className="problem-slot-editor-layout">
        <ol
          ref={listRef}
          className="problem-slot-list"
          aria-label="Assignment problem slots"
        >
          {sortedSlots.map((slot, index) => (
            <li
              key={slot.id}
              className="problem-slot-row"
              data-slot-id={slot.id}
              data-selected={slot.id === effectiveSelectedSlotId}
            >
              <button
                className="problem-slot-select"
                type="button"
                aria-pressed={slot.id === effectiveSelectedSlotId}
                aria-label={`Problem ${index + 1}, ${slot.locked ? 'locked' : 'unlocked'}`}
                onClick={() => {
                  setPreviewState('rendering');
                  setSelectedSlotId(slot.id);
                }}
              >
                <span>Problem {index + 1}</span>
                <span
                  className="problem-slot-lock-status"
                  data-locked={slot.locked}
                >
                  {slot.locked ? 'Locked' : 'Unlocked'}
                </span>
              </button>
              <div className="problem-slot-actions">
                <button
                  className="inline-link"
                  type="button"
                  disabled={
                    slot.locked || pendingSlotId !== null || bulkPending
                  }
                  onClick={() => void regenerate(slot)}
                >
                  {pendingSlotId === slot.id ? 'Regenerating…' : 'Regenerate'}
                </button>
                <button
                  className="inline-link"
                  type="button"
                  disabled={pendingSlotId !== null || bulkPending}
                  onClick={() => void toggleLock(slot)}
                >
                  {slot.locked ? 'Unlock' : 'Lock'}
                </button>
                <button
                  className="inline-link"
                  type="button"
                  disabled={
                    index === 0 || pendingSlotId !== null || bulkPending
                  }
                  onClick={() => void moveSlot(index, -1)}
                >
                  Move up
                </button>
                <button
                  className="inline-link"
                  type="button"
                  disabled={
                    index === sortedSlots.length - 1 ||
                    pendingSlotId !== null ||
                    bulkPending
                  }
                  onClick={() => void moveSlot(index, 1)}
                >
                  Move down
                </button>
              </div>
            </li>
          ))}
        </ol>

        <section
          className="problem-slot-preview"
          aria-label="Generated problem preview"
        >
          <h4>Preview · Problem {selectedIndex + 1}</h4>
          <p className="muted-copy">
            {item.variant_policy === 'same_for_all'
              ? 'Exact preview — students receive this problem.'
              : 'Representative preview — students receive individualized variants.'}
          </p>
          {!previewUrl ? (
            <p role="alert">
              Set VITE_CALCURA_APP_URL to enable Calcura preview.
            </p>
          ) : (
            <iframe
              ref={iframeRef}
              title={`Calcura preview for problem ${selectedIndex + 1}`}
              src={previewUrl}
              onLoad={() => {
                const targetOrigin = origin;
                if (!targetOrigin) return;
                setPreviewState('connecting');
                iframeRef.current?.contentWindow?.postMessage(
                  {
                    version: 1,
                    type: 'calcura-classroom-problem-preview-hello',
                  },
                  targetOrigin,
                );
                window.setTimeout(() => {
                  if (!previewReadyRef.current) setPreviewState('unavailable');
                }, 6000);
              }}
              onError={() => setPreviewState('unavailable')}
            />
          )}
          {previewState === 'connecting' || previewState === 'rendering' ? (
            <p role="status">Connecting to Calcura preview…</p>
          ) : previewState === 'unavailable' ? (
            <p role="alert">
              Calcura preview is unavailable. Problem controls remain available.
            </p>
          ) : previewState === 'error' ? (
            <p role="alert">
              Calcura could not generate this preview. Try selecting the problem
              again.
            </p>
          ) : null}
        </section>
      </div>
      {feedback ? (
        <p
          className="problem-slot-feedback"
          role={feedbackIsError ? 'alert' : 'status'}
        >
          {feedback}
        </p>
      ) : null}
    </section>
  );
}
