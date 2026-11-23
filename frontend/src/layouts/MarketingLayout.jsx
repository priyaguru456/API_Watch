/**
 * Marketing Layout
 * Public landing layout with navigation header and footer.
 */
import { Activity } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';
import { ROUTES } from '../constants/routes.js';

export function MarketingLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Activity className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          <span className="font-bold text-xl tracking-tight">APIWatch</span>
        </div>
        <div className="flex items-center space-x-4">
          <Link to={ROUTES.LOGIN} className="text-sm font-medium hover:text-indigo-600">
            Sign In
          </Link>
          <Link
            to={ROUTES.REGISTER}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            Get Started
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} APIWatch Platform. All rights reserved.
      </footer>
    </div>
  );
}

export default MarketingLayout;
