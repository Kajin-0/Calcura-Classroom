/** Static placeholders keep loading calm and announce one useful status. */
export function LoadingState({ label }: { label: string }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <p>{label}</p>
      <div className="loading-state-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
