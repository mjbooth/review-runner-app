'use client';

import React, { useState } from 'react';
import { useSignIn, useSignUp, useUser } from '@clerk/nextjs';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { LoginScreen } from './LoginScreen';

export function ClerkLoginWrapper() {
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setSignUpActive } = useSignUp();
  const { isSignedIn, user } = useUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Determine if this is a sign-up flow based on the URL path
  const isSignUpPage = searchParams.get('tab') === 'signup' || pathname.includes('/sign-up');

  // Redirect if already signed in
  React.useEffect(() => {
    if (isSignedIn && user) {
      router.push('/dashboard');
    }
  }, [isSignedIn, user, router]);

  // Safe setActive helper to avoid "Session already exists" errors
  const safeSetActive = async (sessionId: string, isSignUp = false) => {
    try {
      if (isSignUp) {
        await setSignUpActive({ session: sessionId });
      } else {
        await setActive({ session: sessionId });
      }
    } catch (err: any) {
      // If session already exists, just redirect - don't show error to user
      if (err.message?.includes('session') && err.message?.includes('already')) {
        console.log('Session already active, redirecting...');
        router.push('/dashboard');
        return;
      }
      // Re-throw other errors
      throw err;
    }
  };

  const handleSignIn = async (email: string, password: string) => {
    if (!signInLoaded) return;

    try {
      setLoading(true);
      setError(null);

      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === 'complete') {
        await safeSetActive(result.createdSessionId);
        router.push('/dashboard');
      } else {
        setError('Sign in incomplete. Please try again.');
      }
    } catch (err: any) {
      console.error('Sign in error:', err);
      setError(err.errors?.[0]?.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (name: string, email: string, password: string) => {
    if (!signUpLoaded) return;

    try {
      setLoading(true);
      setError(null);

      const result = await signUp.create({
        emailAddress: email,
        password,
      });

      // Remove debug logs for production

      if (result.status === 'complete') {
        await safeSetActive(result.createdSessionId, true);
        router.push('/dashboard');
      } else if (result.status === 'missing_requirements') {
        // Check if email verification is needed
        const needsEmailVerification = result.unverifiedFields?.includes('email_address');

        if (needsEmailVerification) {
          // Prepare email verification
          await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
          setVerificationSent(true);
          setError(null);
        } else {
          setError('Please complete the verification process.');
        }
      } else {
        console.log('Signup result:', result);
        setError('Sign up incomplete. Please try again.');
      }
    } catch (err: any) {
      console.error('Sign up error:', err);

      // Handle specific error types
      const errorMessage = err.errors?.[0]?.message;

      if (errorMessage?.includes('online data breach')) {
        setError(
          'This password has been found in a data breach. Please choose a stronger, unique password for your security.'
        );
      } else if (errorMessage?.includes('not strong enough')) {
        setError(
          'Password is not strong enough. Please use at least 8 characters with a mix of letters, numbers, and symbols.'
        );
      } else {
        setError(errorMessage || 'Failed to create account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!signInLoaded) return;

    try {
      setLoading(true);
      setError(null);

      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/auth/callback',
        redirectUrlComplete: isSignUpPage ? '/onboarding' : '/dashboard',
      });
    } catch (err: any) {
      console.error('Google sign in error:', err);
      setError(err.errors?.[0]?.message || 'Failed to sign in with Google.');
      setLoading(false);
    }
  };

  const handleForgotPassword = async (email: string) => {
    if (!signInLoaded) return;

    try {
      setLoading(true);
      setError(null);

      await signIn.create({
        identifier: email,
      });

      const firstFactor = signIn.supportedFirstFactors?.find(
        factor => factor.strategy === 'reset_password_email_code'
      );

      if (firstFactor) {
        await signIn.prepareFirstFactor({
          strategy: 'reset_password_email_code',
          emailAddressId: firstFactor.emailAddressId,
        });

        setResetSent(true);
        setError(null);
      } else {
        setError('Password reset is not available for this account.');
      }
    } catch (err: any) {
      console.error('Password reset error:', err);
      setError(
        err.errors?.[0]?.message ||
          'Failed to send password reset code. Please check the email address.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setVerificationSent(false);
    setResetSent(false);
    setError(null);
  };

  const handleEmailVerification = async (code: string) => {
    if (!signUpLoaded) return;

    try {
      setLoading(true);
      setError(null);

      const result = await signUp.attemptEmailAddressVerification({
        code,
      });

      if (result.status === 'complete') {
        await safeSetActive(result.createdSessionId, true);
        router.push('/dashboard');
      } else {
        setError('Verification incomplete. Please try again.');
      }
    } catch (err: any) {
      console.error('Email verification error:', err);
      const errorMessage = err.errors?.[0]?.message;

      if (errorMessage?.includes('code')) {
        setError('Invalid verification code. Please check the code from your email and try again.');
      } else {
        setError(errorMessage || 'Failed to verify email. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (code: string, newPassword: string) => {
    if (!signInLoaded) return;

    try {
      setLoading(true);
      setError(null);

      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password: newPassword,
      });

      if (result.status === 'complete') {
        await safeSetActive(result.createdSessionId);
        router.push('/dashboard');
      } else {
        setError('Password reset incomplete. Please try again.');
      }
    } catch (err: any) {
      console.error('Reset password error:', err);

      // Handle specific error types
      const errorMessage = err.errors?.[0]?.message;

      if (errorMessage?.includes('online data breach')) {
        setError(
          'This password has been found in a data breach. Please choose a stronger, unique password for your security.'
        );
      } else if (errorMessage?.includes('not strong enough')) {
        setError(
          'Password is not strong enough. Please use at least 8 characters with a mix of letters, numbers, and symbols.'
        );
      } else if (errorMessage?.includes('password')) {
        setError(errorMessage);
      } else if (errorMessage?.includes('code')) {
        setError('Invalid verification code. Please check the code from your email and try again.');
      } else {
        setError(errorMessage || 'Failed to reset password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Update error/success messages for different flows
  const displayError = resetSent || verificationSent ? null : error;

  const displaySuccess = resetSent
    ? 'Password reset code sent! Please check your email and enter the code below.'
    : verificationSent
      ? 'Verification code sent! Please check your email and enter the code below to complete your signup.'
      : null;

  return (
    <LoginScreen
      onSignIn={handleSignIn}
      onSignUp={handleSignUp}
      onGoogleSignIn={handleGoogleSignIn}
      onForgotPassword={handleForgotPassword}
      onResetPassword={handleResetPassword}
      onEmailVerification={handleEmailVerification}
      onBackToLogin={handleBackToLogin}
      loading={loading}
      error={displayError}
      success={displaySuccess}
      defaultTab={isSignUpPage ? 'signup' : 'signin'}
      resetCodeSent={resetSent}
      verificationCodeSent={verificationSent}
    />
  );
}
