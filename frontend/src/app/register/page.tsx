'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Zap, Loader2, Check, X, ArrowRight, BarChart3, Shield, Users } from 'lucide-react';
import { useAuthStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const businessTypes = [
  { value: 'food', label: 'Restaurant / Cafe / Food Service' },
  { value: 'retail', label: 'Retail Store' },
  { value: 'salon', label: 'Salon / Spa / Services' },
  { value: 'other', label: 'Other' },
];

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
}

const checkPasswordStrength = (password: string): PasswordStrength => {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: 'Weak', color: 'bg-destructive' };
  if (score <= 4) return { score, label: 'Medium', color: 'bg-amber-500' };
  return { score, label: 'Strong', color: 'bg-emerald-500' };
};

export default function RegisterPage() {
  const router = useRouter();
  const { register, isAuthenticated, isLoading, error, clearError } = useAuthStore(
    useShallow(s => ({ register: s.register, isAuthenticated: s.isAuthenticated, isLoading: s.isLoading, error: s.error, clearError: s.clearError }))
  );

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    organizationName: '',
    businessType: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState(false);

  const passwordStrength = checkPasswordStrength(formData.password);

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    return () => clearError();
  }, [clearError]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setFormError('');

    if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
      setFormError('Please fill in all required fields');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setFormError('Password must be at least 8 characters');
      return;
    }

    if (!formData.organizationName) {
      setFormError('Please enter your business name');
      return;
    }

    if (!formData.businessType) {
      setFormError('Please select your business type');
      return;
    }

    try {
      await register(formData);
      setSuccess(true);
    } catch (err: any) {
      setFormError(err.message || 'Registration failed. Please try again.');
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Registration Successful
          </h1>
          <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
            We've sent a verification email to <strong className="text-foreground">{formData.email}</strong>.
            Please check your inbox and click the link to verify your account.
          </p>
          <Button onClick={() => router.push('/login')} className="w-full cursor-pointer">
            Go to Login
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-[45%] bg-gray-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/20 via-transparent to-violet-600/10" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <Link href="/" className="flex items-center gap-2.5 cursor-pointer">
            <div className="w-9 h-9 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-white">ProperPOS</span>
          </Link>

          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-bold text-white leading-tight tracking-tight">
                Start growing your<br />business today
              </h2>
              <p className="mt-4 text-gray-400 text-base leading-relaxed max-w-md">
                Get up and running in minutes. No credit card required for your 14-day free trial.
              </p>
            </div>

            <div className="space-y-4">
              {[
                { icon: Shield, text: 'Enterprise-grade security & encryption' },
                { icon: Users, text: 'Unlimited staff accounts on Pro plan' },
                { icon: BarChart3, text: 'Real-time analytics & reporting' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center">
                    <Icon className="w-4 h-4 text-indigo-400" />
                  </div>
                  <span className="text-sm text-gray-300">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <p className="text-sm text-gray-300 leading-relaxed">
              "Setting up ProperPOS was incredibly easy. We were processing orders within an hour of signing up."
            </p>
            <div className="mt-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">MR</span>
              </div>
              <div>
                <p className="text-xs font-medium text-white">Michael Rodriguez</p>
                <p className="text-[11px] text-gray-500">Manager, Fashion Forward</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Register Form */}
      <div className="flex-1 flex items-center justify-center bg-background px-4 py-12 overflow-y-auto">
        <div className="w-full max-w-sm">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8">
            <Link href="/" className="inline-flex items-center gap-2.5 cursor-pointer">
              <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
                <Zap className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold text-foreground">ProperPOS</span>
            </Link>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              Create your account
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Start your free 14-day trial. No credit card required.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {(error || formError) && (
              <div className="p-3.5 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {error || formError}
              </div>
            )}

            {/* Name Row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  First name
                </label>
                <Input
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  placeholder="John"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Last name
                </label>
                <Input
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  placeholder="Doe"
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Email address
              </label>
              <Input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@example.com"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Password
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Create a strong password"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {formData.password && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${passwordStrength.color} transition-all duration-300`}
                      style={{ width: `${(passwordStrength.score / 6) * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground">{passwordStrength.label}</span>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Confirm password
              </label>
              <Input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm your password"
                required
              />
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <p className="mt-1.5 text-xs text-destructive flex items-center gap-1">
                  <X className="w-3 h-3" /> Passwords do not match
                </p>
              )}
            </div>

            {/* Business Name */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Business name
              </label>
              <Input
                name="organizationName"
                value={formData.organizationName}
                onChange={handleChange}
                placeholder="Your Business Name"
                required
              />
            </div>

            {/* Business Type */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Business type
              </label>
              <select
                name="businessType"
                value={formData.businessType}
                onChange={handleChange}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background cursor-pointer"
                required
              >
                <option value="">Select your business type</option>
                {businessTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Terms */}
            <div className="flex items-start gap-2 pt-1">
              <input
                id="terms"
                type="checkbox"
                className="mt-0.5 w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                required
              />
              <label htmlFor="terms" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                I agree to the{' '}
                <Link href="/terms" className="text-primary hover:text-primary/80 transition-colors">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-primary hover:text-primary/80 transition-colors">
                  Privacy Policy
                </Link>
              </label>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full cursor-pointer"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Create account
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-primary hover:text-primary/80 transition-colors cursor-pointer">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
