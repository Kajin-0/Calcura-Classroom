import { useEffect, useLayoutEffect, useRef } from 'react';

/** Visual-only FLIP: stable row IDs and persisted order remain authoritative. */
export function useReorderMotion(order: string) {
  const listRef = useRef<HTMLOListElement>(null);
  const positions = useRef(new Map<string, number>());
  const previousWidth = useRef(0);
  const animations = useRef<Animation[]>([]);

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const cancel = () => {
      if (preference?.matches) {
        animations.current.forEach((animation) => animation.cancel());
      }
    };
    preference?.addEventListener('change', cancel);
    return () => preference?.removeEventListener('change', cancel);
  }, []);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const rows = Array.from(
      list.querySelectorAll<HTMLElement>('[data-slot-id]'),
    );
    // Batch layout reads before animation writes. offsetTop excludes transforms.
    const next = new Map(
      rows.map((row) => [row.dataset.slotId!, row.offsetTop]),
    );
    const width = list.clientWidth;
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    // Do not animate from stale coordinates after a responsive layout change.
    if (!reduced && previousWidth.current === width) {
      const style = getComputedStyle(list);
      const duration =
        parseFloat(style.getPropertyValue('--motion-slow')) || 240;
      const easing =
        style.getPropertyValue('--ease-standard').trim() || 'ease-out';
      animations.current = rows.flatMap((row) => {
        const before = positions.current.get(row.dataset.slotId!);
        const after = next.get(row.dataset.slotId!)!;
        if (before === undefined || before === after || !row.animate) return [];
        const animation = row.animate(
          [
            { transform: `translateY(${before - after}px)` },
            { transform: 'translateY(0)' },
          ],
          { duration, easing },
        );
        animation.id = 'slot-reorder';
        return [animation];
      });
    }
    positions.current = next;
    previousWidth.current = width;
    return () => {
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
    };
  }, [order]);

  return listRef;
}
