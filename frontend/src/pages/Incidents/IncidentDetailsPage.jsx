/**
 * Incident Details Page
 * Shows incident timeline, affected services, and resolution notes.
 */
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ROUTES } from '../../constants/routes.js';

export function IncidentDetailsPage() {
  const { incidentId } = useParams();

  return (
    <div className="space-y-6">
      <Link to={ROUTES.INCIDENTS} className="text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Incidents
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Incident #{incidentId}</h1>
      <p className="text-sm text-slate-500">Incident investigation and activity log.</p>
    </div>
  );
}

export default IncidentDetailsPage;
