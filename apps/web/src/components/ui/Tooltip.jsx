/**
 * Tooltip Component
 * Simple hover tooltip wrapper.
 */
export function Tooltip({ text, children }) {
  return (
    <div className="relative group inline-block">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 px-2 py-1 text-xs text-white bg-slate-900 rounded shadow-md whitespace-nowrap">
        {text}
      </div>
    </div>
  );
}
