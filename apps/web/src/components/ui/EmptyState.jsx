/**
 * EmptyState Component
 * Displays empty list placeholders with an action prompt.
 */
export function EmptyState({
  title = 'No data available',
  description = 'Get started by creating your first item.',
  action,
}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
      <h4 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">{title}</h4>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{description}</p>
      {action}
    </div>
  );
}
