/**
 * Badge Component
 * Status indicators and color tags for services and incidents.
 */
import { cn } from '../../utils/helpers.js';

export function Badge({
  children,
  variant = 'default',
  className = '',
}) {
  const variants = {
    default: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
    success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
    warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    info: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
