/**
 * Hook for managing setup/onboarding status
 *
 * This hook:
 * 1. Checks cached status first (session storage)
 * 2. Only makes API call on initial login or when cache expires
 * 3. Provides methods to refresh when needed
 */

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import {
  type SetupStatus,
  getCachedSetupStatus,
  cacheSetupStatus,
  clearSetupStatusCache,
} from '@/lib/auth-setup-check';

interface UseSetupStatusReturn {
  setupStatus: SetupStatus | null;
  isLoading: boolean;
  error: string | null;
  refreshSetupStatus: () => Promise<void>;
  clearCache: () => void;
}

export function useSetupStatus(): UseSetupStatusReturn {
  const { isLoaded: userLoaded, user } = useUser();
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasChecked, setHasChecked] = useState(false);

  const checkSetupStatus = useCallback(async () => {
    if (!userLoaded || !user) {
      setIsLoading(false);
      return;
    }

    try {
      // Check cache first
      const cached = getCachedSetupStatus();
      if (cached) {
        setSetupStatus(cached);
        setIsLoading(false);
        return;
      }

      // Only make API call if no valid cache
      setIsLoading(true);
      const response = await fetch('/api/auth/setup-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to check setup status');
      }

      const data = await response.json();
      if (data.success && data.data) {
        setSetupStatus(data.data);
        cacheSetupStatus(data.data);
      } else {
        // Default to complete if API fails
        const defaultStatus: SetupStatus = {
          isComplete: true,
          hasBusinessProfile: true,
          hasCustomers: false,
          hasReviewRequests: false,
          hasBillingSetup: false,
        };
        setSetupStatus(defaultStatus);
        cacheSetupStatus(defaultStatus);
      }
    } catch (err) {
      console.error('Setup status check failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');

      // Set default complete status on error to avoid blocking
      const defaultStatus: SetupStatus = {
        isComplete: true,
        hasBusinessProfile: true,
        hasCustomers: false,
        hasReviewRequests: false,
        hasBillingSetup: false,
      };
      setSetupStatus(defaultStatus);
    } finally {
      setIsLoading(false);
      setHasChecked(true);
    }
  }, [userLoaded, user]);

  // Check on mount (only once per session)
  useEffect(() => {
    if (!hasChecked && userLoaded) {
      checkSetupStatus();
    }
  }, [userLoaded, hasChecked, checkSetupStatus]);

  const refreshSetupStatus = useCallback(async () => {
    clearSetupStatusCache();
    setHasChecked(false);
    await checkSetupStatus();
  }, [checkSetupStatus]);

  const clearCache = useCallback(() => {
    clearSetupStatusCache();
    setSetupStatus(null);
    setHasChecked(false);
  }, []);

  return {
    setupStatus,
    isLoading,
    error,
    refreshSetupStatus,
    clearCache,
  };
}
