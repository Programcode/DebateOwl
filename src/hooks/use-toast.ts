import type { ReactNode } from "react";
import { toast as sonner } from "sonner";

type SonnerOptions = NonNullable<Parameters<typeof sonner>[1]>;

export interface ToastOptions {
  title?: ReactNode;
  description?: ReactNode;
  variant?: "default" | "destructive" | "success";
  action?: SonnerOptions["action"];
}

/**
 * Adapter over sonner that keeps the `{ title, description, variant }` call
 * shape used across the app. Replaces the previous hand-rolled toast reducer
 * and its Radix primitives.
 */
export function toast({ title, description, variant, action }: ToastOptions) {
  const render = variant === "destructive"
    ? sonner.error
    : variant === "success"
      ? sonner.success
      : sonner;
  return render(title ?? "", { description, action });
}

export function useToast() {
  return { toast };
}
