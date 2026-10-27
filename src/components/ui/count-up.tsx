import { useCountUp } from '@/hooks/use-count-up';

/**
 * A number that ticks up from 0 when it first appears. Screen readers get the final value
 * straight away; the ticking digits are hidden from them. Give the parent `tabular-nums`
 * so the digits keep their width while they count.
 */
export function CountUp({ value, durationMs }: { value: number; durationMs?: number }) {
  const shown = useCountUp(value, durationMs);
  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{value}</span>
    </>
  );
}
