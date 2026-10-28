/* eslint-disable react-refresh/only-export-components */
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// The face, ledge, hover, press, focus and disabled looks live in index.css (.btn and .btn-*), so a
// link styled with buttonVariants() presses exactly like a button.
const buttonVariants = cva(
  "btn pointer-coarse:min-h-11 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "btn-primary",
        accent: "btn-accent",
        success: "btn-success",
        destructive: "btn-destructive",
        outline: "btn-outline",
        secondary: "btn-secondary",
        ghost: "btn-ghost",
        link: "btn-link",
      },
      size: {
        default: "h-11 px-5 text-base",
        sm: "h-9 rounded-md px-3.5 text-[0.9375rem] [--btn-ledge:3px] pointer-coarse:min-w-11",
        lg: "h-12 px-6 text-[1.0625rem] [--btn-ledge:5px]",
        icon: "h-10 w-10 rounded-md [--btn-ledge:3px] pointer-coarse:min-w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Swaps the label for bouncing dots at the same width and marks the button busy. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        data-loading={loading ? "" : undefined}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && !asChild ? (
          <>
            {/* The label stays in the accessibility tree and holds the width; the dots sit on top. */}
            <span className="inline-flex items-center gap-2 opacity-0">{children}</span>
            <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
              <ThinkingDots />
            </span>
          </>
        ) : children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

/** Three dots bouncing on a stagger: the loading mark inside buttons and inline status rows. */
function ThinkingDots({ className }: { className?: string }) {
  return (
    <span className={cn("thinking-dots", className)} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export { Button, buttonVariants, ThinkingDots };
