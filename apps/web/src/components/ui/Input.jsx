/**
 * Input Component
 * Reusable form text input field with error state styling.
 */
import { cn } from '../../utils/helpers.js';

export function Input({ label, error, id, className = '', ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          'w-full px-3 py-2 border rounded-lg shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-offset-1 transition-colors',
          'bg-white text-slate-900 border-slate-300 focus:border-indigo-500 focus:ring-indigo-500',
          'dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700',
          error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
