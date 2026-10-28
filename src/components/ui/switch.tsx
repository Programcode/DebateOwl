import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer group relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 data-[state=checked]:bg-brand data-[state=unchecked]:bg-ink-400 dark:data-[state=unchecked]:bg-ink-600 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-0.5 pointer-coarse:after:inset-y-[-10px]",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none flex h-5.5 w-5.5 items-center justify-center rounded-full bg-white text-brand shadow-[0_2px_3px_rgb(0_0_0/0.2)] ring-0 transition-transform duration-300 ease-overshoot data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
      )}
    >
      {/* On is never colour alone: the thumb carries a check. */}
      <Check className="h-3 w-3 opacity-0 transition-opacity duration-150 group-data-[state=checked]:opacity-100" strokeWidth={4} aria-hidden="true" />
    </SwitchPrimitives.Thumb>
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
