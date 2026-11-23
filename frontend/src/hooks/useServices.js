/**
 * useServices Hook
 * Provides queries and mutations for monitored services using TanStack Query.
 */
import { useQuery } from '@tanstack/react-query';
import { servicesApi } from '../services/services.api.js';

export function useServices(params = {}) {
  return useQuery({
    queryKey: ['services', params],
    queryFn: () => servicesApi.getAll(params),
    staleTime: 30000,
  });
}
