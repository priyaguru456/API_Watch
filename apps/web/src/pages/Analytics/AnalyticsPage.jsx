/**
 * Analytics Page
 * Historical latency percentiles, uptime trends, and SLA reporting charts.
 */
import { BarChart3 } from 'lucide-react';

export function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Performance Analytics</h1>
      <p className="text-sm text-slate-500">
        Analyze p50, p95, p99 latencies and SLA compliance over time.
      </p>
      <div className="p-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
        <BarChart3 className="w-10 h-10 text-indigo-500 mx-auto mb-2" />
        <h3 className="text-base font-semibold">Analytics engine ready</h3>
        <p className="text-sm text-slate-500">
          Metrics will populate as health checks accumulate data.
        </p>
      </div>
    </div>
  );
}

export default AnalyticsPage;
