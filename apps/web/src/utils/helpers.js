/**
 * Helper Utilities
 * General-purpose helper functions for class merging and string manipulation.
 */
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind and conditional CSS classes cleanly
 * @param  {...any} inputs
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
