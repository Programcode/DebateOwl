import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Icon-only header control with a label that shows on hover and keyboard focus, not just as a title. */
export function HeaderTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
