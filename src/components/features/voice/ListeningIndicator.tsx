/** The one "listening" signal: a steady red dot and a label. The button beside it never pulses. */
export function ListeningIndicator({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" aria-hidden="true" />
      {label}
    </span>
  );
}
