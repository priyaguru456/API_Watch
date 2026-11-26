/**
 * Monitoring Page
 * Live polling logs, health check streams, and response status inspects.
 */
import { Activity } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState.jsx';

export function MonitoringPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Real-Time Monitoring</h1>
      <p className="text-sm text-slate-500">
        Live stream of automated ping checks and response status codes.
      </p>
      <EmptyState
        title="No checks recorded"
        description="Health checks will appear here as monitors run on their scheduled intervals."
      />
    </div>
  );
}

export default MonitoringPage;
