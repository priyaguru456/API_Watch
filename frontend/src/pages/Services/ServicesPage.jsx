/**
 * Services Page
 * Lists all monitored HTTP/API targets with status and latency overview.
 */
import { Plus, Server } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Button } from '../../components/ui/Button.jsx';

export function ServicesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monitored Services</h1>
          <p className="text-sm text-slate-500">Configure and track endpoints, response expectations, and uptime.</p>
        </div>
        <Button variant="primary">
          <Plus className="w-4 h-4 mr-2" /> Add Service
        </Button>
      </div>

      <EmptyState
        title="No services monitored yet"
        description="Add your first HTTP/REST API endpoint to start collecting availability and latency metrics."
        action={
          <Button variant="primary" size="sm">
            <Plus className="w-4 h-4 mr-2" /> Add First Service
          </Button>
        }
      />
    </div>
  );
}

export default ServicesPage;
