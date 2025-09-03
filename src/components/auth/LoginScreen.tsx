'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AuthHeader } from './AuthHeader';

interface LoginScreenProps {
  onSignIn?: (email: string, password: string) => Promise<void>;
  onSignUp?: (name: string, email: string, password: string) => Promise<void>;
  onGoogleSignIn?: () => Promise<void>;
  onForgotPassword?: (email: string) => Promise<void>;
  onResetPassword?: (code: string, newPassword: string) => Promise<void>;
  onEmailVerification?: (code: string) => Promise<void>;
  onBackToLogin?: () => void;
  loading?: boolean;
  error?: string | null;
  success?: string | null;
  defaultTab?: 'signin' | 'signup';
  resetCodeSent?: boolean;
  verificationCodeSent?: boolean;
}

export function LoginScreen({
  onSignIn,
  onSignUp,
  onGoogleSignIn,
  onForgotPassword,
  onResetPassword,
  onEmailVerification,
  onBackToLogin,
  loading,
  error,
  success,
  defaultTab = 'signin',
  resetCodeSent = false,
  verificationCodeSent = false,
}: LoginScreenProps) {
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>(defaultTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showResetCode, setShowResetCode] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationCodeSent && onEmailVerification) {
      await onEmailVerification(verificationCode);
    } else if (showResetCode && onResetPassword) {
      await onResetPassword(resetCode, newPassword);
    } else if (showForgotPassword && onForgotPassword) {
      await onForgotPassword(email);
    } else if (activeTab === 'signin' && onSignIn) {
      await onSignIn(email, password);
    } else if (activeTab === 'signup' && onSignUp) {
      const fullName = `${firstName} ${lastName}`.trim();
      await onSignUp(fullName, email, password);
    }
  };

  const handleGoogleSignIn = async () => {
    if (onGoogleSignIn) {
      await onGoogleSignIn();
    }
  };

  const handleForgotPasswordClick = () => {
    setShowForgotPassword(true);
  };

  const handleBackToLoginClick = () => {
    setShowForgotPassword(false);
    setShowResetCode(false);
    if (onBackToLogin) {
      onBackToLogin();
    }
  };

  // Show reset code form when code is sent
  useEffect(() => {
    if (resetCodeSent) {
      setShowResetCode(true);
    }
  }, [resetCodeSent]);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row relative">
      {/* Auth Header */}
      <AuthHeader />

      {/* Left Side - Login Form */}
      <div className="w-full lg:w-1/2 lg:min-h-screen flex flex-col bg-basewarm-50 relative order-2 lg:order-1">
        {/* Form Container - Top Aligned */}
        <div className="flex-1 flex justify-center px-6 lg:px-12 pt-24 lg:pt-20">
          <div className="w-full max-w-md pt-16">
            {/* Tab Navigation - Hidden during password reset */}
            {!showForgotPassword && !showResetCode && (
              <div className="mb-10">
                <div className="flex w-full border-b border-forgedorange-200">
                  <button
                    onClick={() => setActiveTab('signin')}
                    className={`flex-1 text-center pb-2 text-base font-medium transition-colors focus:outline-none focus:ring-0 ${
                      activeTab === 'signin'
                        ? 'text-forgedorange-500 border-b-2 border-forgedorange-500'
                        : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent'
                    }`}
                  >
                    Log in
                  </button>
                  <button
                    onClick={() => setActiveTab('signup')}
                    className={`flex-1 text-center pb-2 text-base font-medium transition-colors focus:outline-none focus:ring-0 ${
                      activeTab === 'signup'
                        ? 'text-forgedorange-500 border-b-2 border-forgedorange-500'
                        : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent'
                    }`}
                  >
                    Create an account
                  </button>
                </div>
              </div>
            )}

            {/* Forgot Password Header */}
            {showForgotPassword && !showResetCode && (
              <div className="mb-10">
                <h2 className="text-2xl font-bold text-charcoal mb-2">Reset Password</h2>
                <p className="text-sm text-gray-600">
                  Enter your email address and we'll send you a verification code to reset your
                  password.
                </p>
              </div>
            )}

            {/* Reset Code Header */}
            {showResetCode && (
              <div className="mb-10">
                <h2 className="text-2xl font-bold text-charcoal mb-2">Enter Verification Code</h2>
                <p className="text-sm text-gray-600">
                  Please enter the verification code sent to your email and choose a new password.
                </p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Sign Up Fields */}
              {activeTab === 'signup' && !showForgotPassword && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="firstName"
                      className="block text-sm font-semibold text-charcoal mb-1.5"
                    >
                      First Name <span className="text-forgedorange-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="firstName"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      placeholder="First name"
                      className="w-full bg-white border border-gray-300 rounded-md py-2 px-4 text-base text-charcoal placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-transparent transition-colors"
                      required
                      aria-describedby={error ? 'error-message' : undefined}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="lastName"
                      className="block text-sm font-semibold text-charcoal mb-1.5"
                    >
                      Last Name <span className="text-forgedorange-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="lastName"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      placeholder="Last name"
                      className="w-full bg-white border border-gray-300 rounded-md py-2 px-4 text-base text-charcoal placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-transparent transition-colors"
                      required
                      aria-describedby={error ? 'error-message' : undefined}
                    />
                  </div>
                </div>
              )}

              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-charcoal mb-1.5">
                  Email<span className="text-forgedorange-500">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Enter Email"
                  className="w-full bg-white border border-gray-300 rounded-md py-2 px-4 text-base text-charcoal placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-transparent transition-colors"
                  required
                  aria-describedby={error ? 'error-message' : undefined}
                />
              </div>

              {/* Email Verification Code - Show during email verification */}
              {verificationCodeSent && (
                <>
                  <div>
                    <label
                      htmlFor="verificationCode"
                      className="block text-sm font-semibold text-charcoal mb-1.5"
                    >
                      Verification Code <span className="text-forgedorange-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="verificationCode"
                      value={verificationCode}
                      onChange={e => setVerificationCode(e.target.value)}
                      placeholder="Enter verification code"
                      className="w-full bg-white border border-gray-300 rounded-md py-2 px-4 text-base text-charcoal placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-transparent transition-colors"
                      required
                      aria-describedby={error ? 'error-message' : 'verification-help'}
                    />
                    <p id="verification-help" className="mt-1 text-xs text-gray-600">
                      Check your email and enter the verification code to complete your account
                      setup
                    </p>
                  </div>
                </>
              )}

              {/* Reset Code Fields - Show during code verification */}
              {showResetCode && (
                <>
                  <div>
                    <label
                      htmlFor="resetCode"
                      className="block text-sm font-semibold text-charcoal mb-1.5"
                    >
                      Verification Code <span className="text-forgedorange-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="resetCode"
                      value={resetCode}
                      onChange={e => setResetCode(e.target.value)}
                      placeholder="Enter verification code"
                      className="w-full bg-white border border-gray-300 rounded-md py-2 px-4 text-base text-charcoal placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-transparent transition-colors"
                      required
                      aria-describedby={error ? 'error-message' : undefined}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="newPassword"
                      className="block text-sm font-semibold text-charcoal mb-1.5"
                    >
                      New Password <span className="text-forgedorange-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        id="newPassword"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        className="w-full bg-white border border-gray-300 rounded-md py-2 px-4 pr-10 text-base text-charcoal placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-transparent transition-colors"
                        required
                        aria-describedby={error ? 'error-message' : 'password-help'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600"
                        aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                      >
                        {showNewPassword ? (
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L5.636 5.636m4.242 4.242L14.12 14.12m-4.242-4.242L5.636 5.636m8.484 8.484l4.242 4.242M9.878 9.878l4.242 4.242"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                    <p id="password-help" className="mt-1 text-xs text-gray-600">
                      Use at least 8 characters with a mix of letters, numbers, and symbols
                    </p>
                  </div>
                </>
              )}

              {/* Password Field - Show for both signup and signin, but not during password reset or email verification */}
              {(activeTab === 'signup' || activeTab === 'signin') &&
                !showForgotPassword &&
                !showResetCode &&
                !verificationCodeSent && (
                  <div>
                    <label
                      htmlFor="password"
                      className="block text-sm font-semibold text-charcoal mb-1.5"
                    >
                      Password <span className="text-forgedorange-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full bg-white border border-gray-300 rounded-md py-2 px-4 pr-10 text-base text-charcoal placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-transparent transition-colors"
                        required
                        aria-describedby={
                          error
                            ? 'error-message'
                            : activeTab === 'signup'
                              ? 'signup-password-help'
                              : undefined
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L5.636 5.636m4.242 4.242L14.12 14.12m-4.242-4.242L5.636 5.636m8.484 8.484l4.242 4.242M9.878 9.878l4.242 4.242"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                    {/* Password Requirements - Only show on signup tab */}
                    {activeTab === 'signup' && (
                      <p id="signup-password-help" className="mt-1 text-xs text-gray-600">
                        Use at least 8 characters with a mix of letters, numbers, and symbols
                      </p>
                    )}
                    {/* Forgot Password Link - Only show on signin tab */}
                    {activeTab === 'signin' && (
                      <div className="text-right mt-2">
                        <button
                          type="button"
                          onClick={handleForgotPasswordClick}
                          className="text-sm text-forgedorange-500 hover:text-forgedorange-600 font-medium focus:outline-none focus:text-forgedorange-700 focus:underline rounded"
                        >
                          Forgot password?
                        </button>
                      </div>
                    )}
                  </div>
                )}

              {/* Success Message */}
              {success && (
                <div
                  id="success-message"
                  role="alert"
                  className="text-green-600 text-sm bg-green-50 border border-green-200 rounded-md p-3"
                >
                  {success}
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div
                  id="error-message"
                  role="alert"
                  className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-md p-3"
                >
                  {error}
                </div>
              )}

              {/* CAPTCHA Element for Clerk */}
              {activeTab === 'signup' && <div id="clerk-captcha"></div>}

              {/* Primary Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-white border-2 border-forgedorange-500 text-forgedorange-500 font-medium text-base py-2.5 px-7 rounded-md hover:bg-forgedorange-500 hover:text-white focus:outline-none focus:border-forgedorange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    {verificationCodeSent
                      ? 'Verifying...'
                      : showResetCode
                        ? 'Resetting Password...'
                        : showForgotPassword
                          ? 'Sending Code...'
                          : activeTab === 'signin'
                            ? 'Signing In...'
                            : 'Creating Account...'}
                  </div>
                ) : verificationCodeSent ? (
                  'Verify Email'
                ) : showResetCode ? (
                  'Reset Password'
                ) : showForgotPassword ? (
                  'Send Code'
                ) : activeTab === 'signin' ? (
                  'Sign in'
                ) : (
                  'Create Account'
                )}
              </button>
            </form>

            {/* Back to Login Link - Show during password reset or email verification */}
            {(showForgotPassword || showResetCode || verificationCodeSent) && (
              <div className="text-center mt-6">
                <button
                  onClick={handleBackToLoginClick}
                  className="text-sm text-forgedorange-500 hover:text-forgedorange-600 font-medium focus:outline-none focus:text-forgedorange-700 focus:underline rounded"
                >
                  ← Back to Login
                </button>
              </div>
            )}

            {/* Divider - Hide during password reset */}
            {!showForgotPassword && !showResetCode && (
              <div className="flex items-center my-6">
                <div className="flex-1 h-px bg-gray-300"></div>
                <span className="px-6 text-xs font-light text-charcoal">OR</span>
                <div className="flex-1 h-px bg-gray-300"></div>
              </div>
            )}

            {/* Google Sign-in Button - Hide during password reset */}
            {!showForgotPassword && !showResetCode && (
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full bg-white border border-gray-300 text-charcoal font-medium text-base py-2.5 px-7 rounded-md hover:bg-gray-50 focus:outline-none focus:border-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Sign up with Google
              </button>
            )}

            {/* Footer Link - Hide during password reset */}
            {!showForgotPassword && !showResetCode && (
              <div className="text-center mt-8">
                <p className="text-sm font-light text-charcoal">
                  {activeTab === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
                  <button
                    onClick={() => setActiveTab(activeTab === 'signin' ? 'signup' : 'signin')}
                    className="font-bold hover:underline focus:outline-none focus:text-forgedorange-700 focus:underline rounded"
                  >
                    {activeTab === 'signin' ? 'Create One' : 'Sign In'}
                  </button>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Side - Hero Image */}
      <div className="w-full lg:w-1/2 relative overflow-hidden order-1 lg:order-2 min-h-[300px] lg:min-h-screen">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.1)), url('/b17f05c7-e391-4215-94e3-93841b51f6ea.png')`,
          }}
        ></div>
      </div>
    </div>
  );
}
