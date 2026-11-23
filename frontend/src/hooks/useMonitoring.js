/**
 * useMonitoring Hook
 * Queries real-time system health and check logs.
 */
import { useQuery } from '@tanstack/react-query';
import { monitoringApi } from '../services/monitoring.api.js';

export function useSystemHealth() {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: () => monitoringApi.getSystemHealth(),
    refetchInterval: 15000,
  });
}
