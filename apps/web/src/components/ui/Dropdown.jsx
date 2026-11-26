/**
 * Dropdown Component
 * Simple selection dropdown component.
 */
export function Dropdown({ label, value, onChange, options = [], className = '' }) {
  return (
    <div className={className}>
      {label && <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
