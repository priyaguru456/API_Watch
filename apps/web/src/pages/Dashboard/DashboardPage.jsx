/**
 * Dashboard Page
 * Main observability dashboard displaying health summary, monitored service cards, and quick actions.
 */
import { Activity, AlertTriangle, ArrowUpRight, CheckCircle2, Clock, Server } from 'lucide-react';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { useSystemHealth } from '../../hooks/useMonitoring.js';

export function DashboardPage() {
  const { data: health, isLoading } = useSystemHealth();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Overview</h1>
          <p className="text-sm text-slate-500">
            Real-time status of your APIs, endpoints, and scheduled monitors.
          </p>
        </div>
        <Button variant="primary">
          <Activity className="w-4 h-4 mr-2" /> Add Monitor
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase">System Status</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold">
              {isLoading ? 'Checking...' : health?.data?.status || 'Online'}
            </span>
            <Badge variant="success">All Systems Go</Badge>
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase">
              Monitored Services
            </span>
            <Server className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold">12</span>
            <span className="text-xs text-slate-500">Active</span>
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase">
              Avg Response Time
            </span>
            <Clock className="w-4 h-4 text-sky-500" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold">142 ms</span>
            <span className="text-xs text-emerald-600 font-medium">↓ 12ms</span>
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase">Active Incidents</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold">0</span>
            <Badge variant="default">Resolved</Badge>
          </div>
        </div>
      </div>

      {/* Backend API Connection Status Banner */}
      <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/50 dark:bg-indigo-950/20 dark:border-indigo-900 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <div>
            <h4 className="text-sm font-semibold text-indigo-950 dark:text-indigo-200">
              API Connection: {health?.message || 'Connecting to backend...'}
            </h4>
            <p className="text-xs text-indigo-700 dark:text-indigo-400">
              {health?.timestamp
                ? `Last verified: ${new Date(health.timestamp).toLocaleTimeString()}`
                : 'Waiting for response from /api/v1/health'}
            </p>
          </div>
        </div>
        <a
          href="http://localhost:5000/api/v1/health"
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 flex items-center hover:underline"
        >
          View Health Endpoint <ArrowUpRight className="w-3 h-3 ml-1" />
        </a>
      </div>
    </div>
  );
}

export default DashboardPage;
