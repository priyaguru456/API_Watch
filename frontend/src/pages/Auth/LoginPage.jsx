/**
 * Login Page
 * User sign-in form with email and password fields.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { ROUTES } from '../../constants/routes.js';
import { useAuth } from '../../hooks/useAuth.js';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    login('mock-jwt-token', { id: '1', email, name: email.split('@')[0] });
    navigate(ROUTES.DASHBOARD);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight">Sign In</h2>
        <p className="text-sm text-slate-500 mt-1">Access your APIWatch monitoring dashboard</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="email"
          label="Email Address"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="developer@company.com"
        />
        <Input
          id="password"
          label="Password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        <Button type="submit" variant="primary" className="w-full">
          Sign In
        </Button>
      </form>
      <p className="text-center text-xs text-slate-500">
        Don&apos;t have an account?{' '}
        <Link to={ROUTES.REGISTER} className="text-indigo-600 font-semibold hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}

export default LoginPage;
