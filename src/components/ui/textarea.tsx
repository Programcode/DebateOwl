import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "motion-field flex min-h-[88px] w-full rounded-md border-2 border-input bg-card px-3.5 py-2.5 text-base leading-relaxed text-foreground focus-visible:outline-hidden focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-plume-500/20 dark:focus-visible:ring-plume-400/25 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-invalid:border-destructive dark:bg-surface-sunken md:text-[0.9375rem]",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
