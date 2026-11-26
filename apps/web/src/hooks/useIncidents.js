/**
 * useIncidents Hook
 * Queries active and resolved incident lists.
 */
import { useQuery } from '@tanstack/react-query';
import { incidentsApi } from '../services/incidents.api.js';

export function useIncidents(params = {}) {
  return useQuery({
    queryKey: ['incidents', params],
    queryFn: () => incidentsApi.getAll(params),
    staleTime: 15000,
  });
}
