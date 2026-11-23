/**
 * Authentication Context
 * Manages user authentication state, tokens, and session persistence.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import { APP_CONFIG } from '../constants/app.constants.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(APP_CONFIG.TOKEN_STORAGE_KEY);
    if (token) {
      // Setup demo session or fetch user profile
      setUser({ id: 'demo-user', email: 'demo@apiwatch.local', name: 'Demo User' });
    }
    setLoading(false);
  }, []);

  const login = (token, userData) => {
    localStorage.setItem(APP_CONFIG.TOKEN_STORAGE_KEY, token);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem(APP_CONFIG.TOKEN_STORAGE_KEY);
    setUser(null);
  };

  const value = {
    user,
    isAuthenticated: !!user,
    loading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
