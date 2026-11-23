/**
 * Service Details Page
 * Displays deep analytics, response time history, and settings for a single service.
 */
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ROUTES } from '../../constants/routes.js';

export function ServiceDetailsPage() {
  const { serviceId } = useParams();

  return (
    <div className="space-y-6">
      <Link to={ROUTES.SERVICES} className="text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Services
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Service Details: {serviceId}</h1>
      <p className="text-sm text-slate-500">Service diagnostic view and uptime distribution.</p>
    </div>
  );
}

export default ServiceDetailsPage;
