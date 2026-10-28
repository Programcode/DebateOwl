import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    /** Fill from empty once on mount: a finished result's score, not a live countdown. */
    reveal?: boolean;
  }
>(({ className, value, reveal = false, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn("relative h-3 w-full overflow-hidden rounded-full bg-surface-sunken ring-1 ring-inset ring-border", className)}
    value={value}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn("progress-fill h-full w-full flex-1 rounded-full bg-brand transition-transform duration-300 ease-out-strong", reveal && "progress-reveal")}
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
