/**
 * Alerting Page
 * Notification channels and alert rules configuration.
 */
import { Bell } from 'lucide-react';

export function AlertingPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Alerting & Notifications</h1>
      <p className="text-sm text-slate-500">Configure email alerts, webhook integrations, and paging rules.</p>
      <div className="p-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
        <Bell className="w-10 h-10 text-indigo-500 mx-auto mb-2" />
        <h3 className="text-base font-semibold">Notification channels</h3>
        <p className="text-sm text-slate-500">Add email or webhook endpoints to receive failure notifications.</p>
      </div>
    </div>
  );
}

export default AlertingPage;
