'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { OnboardingStatus } from '@/hooks/useOnboarding';
import {
  getOnboardingStatus,
  updateOnboardingStatus,
  completeOnboarding,
  needsOnboarding,
  type OnboardingProfile,
} from '@/services/onboarding';

interface OnboardingContextValue {
  // Onboarding state
  profile: OnboardingProfile | null;
  isLoading: boolean;
  error: string | null;
  needsOnboarding: boolean;

  // Actions
  refreshOnboardingStatus: () => Promise<void>;
  updateOnboarding: (updates: Partial<OnboardingProfile>) => Promise<boolean>;
  completeOnboardingFlow: () => Promise<boolean>;

  // UI state
  isOnboardingModalOpen: boolean;
  setOnboardingModalOpen: (open: boolean) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

interface OnboardingProviderProps {
  children: React.ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const { user, isLoaded: userLoaded } = useUser();

  // Onboarding state
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use ref to track loading state for rate limiting without causing re-renders
  const isLoadingRef = useRef(false);

  // UI state
  const [isOnboardingModalOpen, setOnboardingModalOpen] = useState(false);

  // Derived state
  const needsOnboardingFlow = needsOnboarding(profile);

  // Update onboarding status
  const updateOnboarding = useCallback(
    async (updates: Partial<OnboardingProfile>): Promise<boolean> => {
      if (!profile) return false;

      try {
        const response = await updateOnboardingStatus(updates);

        if (response.success && response.data) {
          setProfile(response.data);

          // Close modal if onboarding is completed
          if (response.data.status === 'completed') {
            setOnboardingModalOpen(false);
          }

          return true;
        } else {
          setError(response.error?.message || 'Failed to update onboarding');
          return false;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        setError(errorMessage);
        return false;
      }
    },
    [profile]
  );

  // Complete onboarding flow
  const completeOnboardingFlow = useCallback(async (): Promise<boolean> => {
    try {
      const response = await completeOnboarding();

      if (response.success && response.data) {
        setProfile(response.data);
        setOnboardingModalOpen(false);
        return true;
      } else {
        setError(response.error?.message || 'Failed to complete onboarding');
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(errorMessage);
      return false;
    }
  }, []);

  // Manual refresh function
  const refreshOnboardingStatus = useCallback(async () => {
    console.log('Manual refresh requested');
    if (!userLoaded || !user) return;

    // Reset loading state and re-run the same logic as in useEffect
    isLoadingRef.current = false;

    const fetchOnboardingStatus = async () => {
      console.log('Manual fetchOnboardingStatus called');

      if (isLoadingRef.current) {
        console.log('Already loading, skipping manual fetch');
        return;
      }

      console.log('Starting manual onboarding status fetch...');
      isLoadingRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const response = await getOnboardingStatus();
        console.log('Manual onboarding status response:', response);

        if (response.success && response.data) {
          setProfile(response.data);
          const shouldShowOnboarding = needsOnboarding(response.data);
          setOnboardingModalOpen(shouldShowOnboarding);
        } else {
          setError(response.error?.message || 'Failed to load onboarding status');
          setProfile(null);
          setOnboardingModalOpen(false);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        setError(errorMessage);
        setProfile(null);
        setOnboardingModalOpen(false);
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    };

    await fetchOnboardingStatus();
  }, [userLoaded, user]);

  // Manual modal control (for testing or edge cases)
  const handleSetOnboardingModalOpen = useCallback(
    (open: boolean) => {
      // Only allow manual opening if onboarding is actually needed
      if (open && !needsOnboardingFlow) {
        console.warn('Cannot open onboarding modal - user has already completed onboarding');
        return;
      }

      setOnboardingModalOpen(open);
    },
    [needsOnboardingFlow]
  );

  // Automatic onboarding check on page load
  useEffect(() => {
    console.log('OnboardingContext useEffect triggered:', {
      userLoaded,
      hasUser: !!user,
      userId: user?.id,
    });

    if (!userLoaded) {
      console.log('User not loaded yet, waiting...');
      return;
    }

    if (!user) {
      console.log('No user found, skipping onboarding check');
      return;
    }

    // Define fetch function locally to avoid stale closures
    const fetchOnboardingStatus = async () => {
      console.log('fetchOnboardingStatus called:', {
        userLoaded,
        hasUser: !!user,
        isLoadingRef: isLoadingRef.current,
      });

      if (!userLoaded || !user) {
        console.log('User not ready, setting loading to false');
        setIsLoading(false);
        return;
      }

      // Rate limiting protection - don't fetch if already loading
      if (isLoadingRef.current) {
        console.log('Already loading, skipping fetch');
        return;
      }

      console.log('Starting onboarding status fetch...');
      isLoadingRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        console.log('Calling getOnboardingStatus API...');
        const response = await getOnboardingStatus();
        console.log('Onboarding status response:', response);

        if (response.success && response.data) {
          console.log('Setting profile:', response.data);
          setProfile(response.data);

          // Auto-open onboarding modal if needed
          const shouldShowOnboarding = needsOnboarding(response.data);
          console.log('Should show onboarding modal:', shouldShowOnboarding);
          setOnboardingModalOpen(shouldShowOnboarding);
        } else {
          console.error('Onboarding status fetch failed:', response.error);
          setError(response.error?.message || 'Failed to load onboarding status');
          setProfile(null);
          setOnboardingModalOpen(false);
        }
      } catch (error) {
        console.error('Exception in fetchOnboardingStatus:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        setError(errorMessage);
        setProfile(null);
        setOnboardingModalOpen(false);
      } finally {
        console.log('fetchOnboardingStatus complete, setting loading to false');
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    };

    console.log('Starting onboarding status fetch with delay...');
    const timer = setTimeout(() => {
      console.log('Timer fired, calling fetchOnboardingStatus...');
      fetchOnboardingStatus();
    }, 100); // Small delay to prevent immediate multiple calls

    return () => {
      console.log('Cleaning up onboarding timer');
      clearTimeout(timer);
    };
  }, [userLoaded, user?.id]);

  // Clear error after some time
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 10000); // Clear after 10 seconds
      return () => clearTimeout(timer);
    }
  }, [error]);

  const contextValue: OnboardingContextValue = {
    // Onboarding state
    profile,
    isLoading,
    error,
    needsOnboarding: needsOnboardingFlow,

    // Actions
    refreshOnboardingStatus,
    updateOnboarding,
    completeOnboardingFlow,

    // UI state
    isOnboardingModalOpen,
    setOnboardingModalOpen: handleSetOnboardingModalOpen,
  };

  return <OnboardingContext.Provider value={contextValue}>{children}</OnboardingContext.Provider>;
}

// Hook to use onboarding context
export function useOnboardingContext(): OnboardingContextValue {
  const context = useContext(OnboardingContext);

  if (context === undefined) {
    throw new Error('useOnboardingContext must be used within an OnboardingProvider');
  }

  return context;
}

// Hook to check if onboarding should block interactions
export function useOnboardingBlocker() {
  const { needsOnboarding, isOnboardingModalOpen } = useOnboardingContext();

  return {
    shouldBlockInteractions: needsOnboarding && isOnboardingModalOpen,
    needsOnboarding,
    isOnboardingModalOpen,
  };
}
