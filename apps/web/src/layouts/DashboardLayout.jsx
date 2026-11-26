/**
 * Dashboard Layout
 * Application layout with sidebar navigation, header, and outlet for internal app pages.
 */
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  LayoutDashboard,
  LogOut,
  Server,
  Settings,
} from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { ROUTES } from '../constants/routes.js';
import { useAuth } from '../hooks/useAuth.js';

export function DashboardLayout() {
  const { user, logout } = useAuth();

  const navItems = [
    { label: 'Dashboard', path: ROUTES.DASHBOARD, icon: LayoutDashboard },
    { label: 'Services', path: ROUTES.SERVICES, icon: Server },
    { label: 'Monitoring', path: ROUTES.MONITORING, icon: Activity },
    { label: 'Incidents', path: ROUTES.INCIDENTS, icon: AlertTriangle },
    { label: 'Analytics', path: ROUTES.ANALYTICS, icon: BarChart3 },
    { label: 'Alerting', path: ROUTES.ALERTING, icon: Bell },
    { label: 'Settings', path: ROUTES.SETTINGS, icon: Settings },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center space-x-2">
          <Activity className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          <span className="font-bold text-lg tracking-tight">APIWatch</span>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/60'
                  }`
                }
              >
                <Icon className="h-4 w-4 mr-3" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="truncate">
            <p className="text-xs font-semibold">{user?.name || 'Demo User'}</p>
            <p className="text-xs text-slate-500 truncate">
              {user?.email || 'demo@apiwatch.local'}
            </p>
          </div>
          <button
            onClick={logout}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default DashboardLayout;
