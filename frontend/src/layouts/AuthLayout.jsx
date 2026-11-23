/**
 * Auth Layout
 * Centered card layout for authentication flows (Login, Register).
 */
import { Activity } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="mb-6 flex items-center space-x-2">
        <Activity className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
        <Link to="/" className="text-2xl font-black tracking-tight">
          APIWatch
        </Link>
      </div>
      <div className="w-full max-w-md bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
        <Outlet />
      </div>
    </div>
  );
}

export default AuthLayout;
