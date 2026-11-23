/**
 * Settings Page
 * Organization, API keys, and platform settings.
 */
import { Settings } from 'lucide-react';

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <p className="text-sm text-slate-500">Manage account credentials, API tokens, and platform preferences.</p>
      <div className="p-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
        <Settings className="w-10 h-10 text-slate-400 mx-auto mb-2" />
        <h3 className="text-base font-semibold">Account & API Settings</h3>
        <p className="text-sm text-slate-500">Platform preferences and security controls.</p>
      </div>
    </div>
  );
}

export default SettingsPage;
