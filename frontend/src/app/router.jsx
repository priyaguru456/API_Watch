/**
 * Centralized Application Router
 * Defines route tree and associates layouts with view components.
 */
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { ROUTES } from '../constants/routes.js';
import { AuthLayout } from '../layouts/AuthLayout.jsx';
import { DashboardLayout } from '../layouts/DashboardLayout.jsx';
import { AlertingPage } from '../pages/Alerting/AlertingPage.jsx';
import { AnalyticsPage } from '../pages/Analytics/AnalyticsPage.jsx';
import { LoginPage } from '../pages/Auth/LoginPage.jsx';
import { RegisterPage } from '../pages/Auth/RegisterPage.jsx';
import { DashboardPage } from '../pages/Dashboard/DashboardPage.jsx';
import { IncidentDetailsPage } from '../pages/Incidents/IncidentDetailsPage.jsx';
import { IncidentsPage } from '../pages/Incidents/IncidentsPage.jsx';
import { MonitoringPage } from '../pages/Monitoring/MonitoringPage.jsx';
import { ServiceDetailsPage } from '../pages/Services/ServiceDetailsPage.jsx';
import { ServicesPage } from '../pages/Services/ServicesPage.jsx';
import { SettingsPage } from '../pages/Settings/SettingsPage.jsx';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to={ROUTES.DASHBOARD} replace />,
  },
  {
    element: <AuthLayout />,
    children: [
      { path: ROUTES.LOGIN, element: <LoginPage /> },
      { path: ROUTES.REGISTER, element: <RegisterPage /> },
    ],
  },
  {
    element: <DashboardLayout />,
    children: [
      { path: ROUTES.DASHBOARD, element: <DashboardPage /> },
      { path: ROUTES.SERVICES, element: <ServicesPage /> },
      { path: ROUTES.SERVICE_DETAILS, element: <ServiceDetailsPage /> },
      { path: ROUTES.MONITORING, element: <MonitoringPage /> },
      { path: ROUTES.INCIDENTS, element: <IncidentsPage /> },
      { path: ROUTES.INCIDENT_DETAILS, element: <IncidentDetailsPage /> },
      { path: ROUTES.ANALYTICS, element: <AnalyticsPage /> },
      { path: ROUTES.ALERTING, element: <AlertingPage /> },
      { path: ROUTES.SETTINGS, element: <SettingsPage /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to={ROUTES.DASHBOARD} replace />,
  },
]);

export default router;
