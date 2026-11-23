/**
 * Skeleton Component
 * Loading placeholder skeleton with pulsing animation.
 */
import { cn } from '../../utils/helpers.js';

export function Skeleton({ className = '' }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-slate-200 dark:bg-slate-800', className)} />
  );
}
