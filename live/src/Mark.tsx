/** The permanent Sportron mark. Shown on every page, for every organization. */
export function Mark({ corner }: { corner?: boolean }) {
  return (
    <span className={`mark${corner ? ' mark-corner' : ''}`} aria-label="Sportron">
      <i aria-hidden="true" />
      Sportron
    </span>
  );
}
