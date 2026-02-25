'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Zap, Loader2, ArrowLeft, Mail } from 'lucide-react';
import { useAuthStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ForgotPasswordPage() {
  const { forgotPassword, isLoading, error, clearError } = useAuthStore(
    useShallow(s => ({ forgotPassword: s.forgotPassword, isLoading: s.isLoading, error: s.error, clearError: s.clearError }))
  );

  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setFormError('');
    clearError();

    if (!email) {
      setFormError('Please enter your email address');
      return;
    }

    try {
      await forgotPassword(email);
      setSuccess(true);
    } catch (err: any) {
      setFormError(err.message || 'Failed to send reset email. Please try again.');
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Check your email
          </h1>
          <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
            We've sent password reset instructions to <strong className="text-foreground">{email}</strong>.
            Please check your inbox and follow the link to reset your password.
          </p>
          <div className="space-y-3">
            <Button onClick={() => setSuccess(false)} variant="outline" className="w-full cursor-pointer">
              Try another email
            </Button>
            <Link href="/login">
              <Button variant="ghost" className="w-full cursor-pointer">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to login
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 cursor-pointer">
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-foreground">ProperPOS</span>
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Forgot your password?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No worries, we'll send you reset instructions.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {(error || formError) && (
            <div className="p-3.5 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
              {error || formError}
            </div>
          )}

          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Email address
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
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
                Sending...
              </>
            ) : (
              'Send reset link'
            )}
          </Button>
        </form>

        {/* Back to Login */}
        <div className="mt-8 text-center">
          <Link
            href="/login"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
