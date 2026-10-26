import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex w-full touch-none select-none items-center", className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2.5 w-full grow overflow-hidden rounded-full bg-surface-sunken ring-1 ring-inset ring-border">
      <SliderPrimitive.Range className="absolute h-full rounded-full bg-brand" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-6 w-6 cursor-grab rounded-full border-[3px] border-brand bg-white shadow-[0_2px_0_var(--do-primary-ledge)] transition-transform duration-150 ease-overshoot hover:scale-110 active:scale-95 active:cursor-grabbing focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
