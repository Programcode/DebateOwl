import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper to ensure we always have an array, filtering out non-array truthy values (objects/strings)
export const safeArray = <T>(data: T[] | undefined | null | unknown): T[] => {
  if (Array.isArray(data)) return data as T[];
  return [];
};
