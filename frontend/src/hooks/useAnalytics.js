/**
 * useAnalytics Hook
 * Queries overview analytics metrics and uptime trends.
 */
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../services/analytics.api.js';

export function useAnalyticsOverview() {
  return useQuery({
    queryKey: ['analytics-overview'],
    queryFn: () => analyticsApi.getOverviewMetrics(),
    staleTime: 60000,
  });
}
