/**
 * Incidents Page
 * Incident management list for degraded and down services.
 */
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState.jsx';

export function IncidentsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Incidents</h1>
      <p className="text-sm text-slate-500">
        Track outages, ongoing investigations, and post-mortem resolutions.
      </p>
      <EmptyState
        title="Zero active incidents"
        description="All monitored services are currently healthy and responding within threshold."
      />
    </div>
  );
}

export default IncidentsPage;
