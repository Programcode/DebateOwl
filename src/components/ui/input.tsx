import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "motion-field flex h-11 w-full rounded-md border-2 border-input bg-card px-3.5 py-2 text-base text-foreground file:border-0 file:bg-transparent file:text-sm file:font-bold file:text-foreground focus-visible:outline-hidden focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-plume-500/20 dark:focus-visible:ring-plume-400/25 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-invalid:border-destructive dark:bg-surface-sunken md:text-[0.9375rem]",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
