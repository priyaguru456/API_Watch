/**
 * useAuth Hook
 * Accesses authentication context and user session state.
 */
import { useAuthContext } from '../context/AuthContext.jsx';

export function useAuth() {
  return useAuthContext();
}
