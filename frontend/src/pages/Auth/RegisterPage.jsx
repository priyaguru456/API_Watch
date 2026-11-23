/**
 * Register Page
 * User account registration form.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { ROUTES } from '../../constants/routes.js';
import { useAuth } from '../../hooks/useAuth.js';

export function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    login('mock-jwt-token', { id: '1', email, name });
    navigate(ROUTES.DASHBOARD);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight">Create Account</h2>
        <p className="text-sm text-slate-500 mt-1">Start monitoring your APIs in seconds</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="name"
          label="Full Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Doe"
        />
        <Input
          id="email"
          label="Email Address"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@company.com"
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
          Get Started Free
        </Button>
      </form>
      <p className="text-center text-xs text-slate-500">
        Already have an account?{' '}
        <Link to={ROUTES.LOGIN} className="text-indigo-600 font-semibold hover:underline">
          Sign In
        </Link>
      </p>
    </div>
  );
}

export default RegisterPage;
