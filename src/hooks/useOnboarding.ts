'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export type OnboardingStatus = 'pending' | 'in_progress' | 'completed';

export interface OnboardingStep {
  id: string;
  title: string;
  description?: string;
  isComplete: boolean;
}

export type StepValidationFunction = () => Promise<boolean> | boolean;

export interface UseOnboardingOptions {
  initialStep?: number;
  initialCompletedSteps?: number[];
}

export interface UseOnboardingReturn {
  isOpen: boolean;
  currentStep: number;
  totalSteps: number;
  onboardingStatus: OnboardingStatus;
  steps: OnboardingStep[];
  completedSteps: number[];
  isLoading: boolean;
  canGoBack: boolean;
  canGoNext: boolean;
  isFirstStep: boolean;
  isLastStep: boolean;
  goToNextStep: (validate?: StepValidationFunction) => Promise<void>;
  goToPreviousStep: () => void;
  goToStep: (stepIndex: number) => void;
  completeCurrentStep: () => void;
  completeOnboarding: () => Promise<void>;
  setLoading: (loading: boolean) => void;
}

// Default onboarding steps (5 total steps: 0-4)
const defaultSteps: OnboardingStep[] = [
  {
    id: 'business-setup',
    title: 'Connect Business',
    description: 'Set up your business information',
    isComplete: false,
  },
  {
    id: 'add-customer',
    title: 'Add Customer',
    description: 'Add your first customer to the system',
    isComplete: false,
  },
  {
    id: 'pick-template',
    title: 'Pick Template',
    description: 'Choose a review request template',
    isComplete: false,
  },
  {
    id: 'review-message',
    title: 'Review Message',
    description: 'Customize your review request message',
    isComplete: false,
  },
  {
    id: 'send-schedule',
    title: 'Send & Schedule',
    description: 'Send or schedule your review request',
    isComplete: false,
  },
];

// SessionStorage key for persistence
const ONBOARDING_STORAGE_KEY = 'reviewrunner-onboarding-state';

// Helper functions for sessionStorage
const getStoredOnboardingState = () => {
  if (typeof window === 'undefined') return null;

  try {
    const stored = sessionStorage.getItem(ONBOARDING_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const setStoredOnboardingState = (state: {
  currentStep: number;
  completedSteps: number[];
  onboardingStatus: OnboardingStatus;
}) => {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
};

const clearStoredOnboardingState = () => {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.removeItem(ONBOARDING_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
};

export function useOnboarding(
  initialStatus?: OnboardingStatus,
  options?: UseOnboardingOptions
): UseOnboardingReturn {
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus>(
    initialStatus || 'pending'
  );
  const [currentStep, setCurrentStep] = useState(options?.initialStep || 0);
  const [steps, setSteps] = useState<OnboardingStep[]>(defaultSteps);
  const [completedSteps, setCompletedSteps] = useState<number[]>(
    options?.initialCompletedSteps || []
  );
  const [isLoading, setIsLoading] = useState(false);
  const completionInProgressRef = useRef(false);

  // Initialize from sessionStorage or options (only run once)
  useEffect(() => {
    const stored = getStoredOnboardingState();
    if (stored && !options) {
      // Only use stored data if no options provided
      setCurrentStep(stored.currentStep);
      setCompletedSteps(stored.completedSteps);
      setOnboardingStatus(stored.onboardingStatus);
    } else if (options) {
      // Use provided options if available
      if (options?.initialStep !== undefined) {
        setCurrentStep(options.initialStep);
      }
      if (options?.initialCompletedSteps !== undefined) {
        setCompletedSteps(options.initialCompletedSteps);
      }
    }
  }, []); // Empty dependency array to run only once

  // Persist to sessionStorage whenever state changes
  useEffect(() => {
    if (onboardingStatus !== 'completed') {
      setStoredOnboardingState({
        currentStep,
        completedSteps,
        onboardingStatus,
      });
    } else {
      clearStoredOnboardingState();
    }
  }, [currentStep, completedSteps, onboardingStatus]);

  // Determine if modal should be open
  const isOpen = onboardingStatus !== 'completed';
  const totalSteps = steps.length;

  // Navigation state
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;
  const canGoBack = !isFirstStep && !isLoading;
  const canGoNext = !isLoading;

  const goToNextStep = useCallback(
    async (validate?: StepValidationFunction) => {
      if (isLoading || currentStep >= totalSteps - 1) return;

      try {
        setIsLoading(true);

        // Run validation if provided
        if (validate) {
          const isValid = await validate();
          if (!isValid) {
            return;
          }
        }

        // Mark current step as completed
        setSteps(prevSteps =>
          prevSteps.map((step, index) =>
            index === currentStep ? { ...step, isComplete: true } : step
          )
        );
        setCompletedSteps(prev => (prev.includes(currentStep) ? prev : [...prev, currentStep]));

        // Move to next step
        setCurrentStep(currentStep + 1);

        if (onboardingStatus === 'pending') {
          setOnboardingStatus('in_progress');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [currentStep, totalSteps, onboardingStatus, isLoading]
  );

  const goToPreviousStep = useCallback(() => {
    if (canGoBack) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep, canGoBack]);

  const goToStep = useCallback(
    (stepIndex: number) => {
      if (stepIndex >= 0 && stepIndex < totalSteps && !isLoading) {
        setCurrentStep(stepIndex);
      }
    },
    [totalSteps, isLoading]
  );

  const completeCurrentStep = useCallback(() => {
    setSteps(prevSteps =>
      prevSteps.map((step, index) => (index === currentStep ? { ...step, isComplete: true } : step))
    );
    setCompletedSteps(prev => (prev.includes(currentStep) ? prev : [...prev, currentStep]));
  }, [currentStep]);

  const completeOnboarding = useCallback(async () => {
    try {
      setIsLoading(true);

      // Mark all steps as completed
      setSteps(prevSteps => prevSteps.map(step => ({ ...step, isComplete: true })));
      setCompletedSteps(Array.from({ length: totalSteps }, (_, i) => i));

      // Here you would typically make an API call to update the business onboarding status
      // await api.updateBusinessOnboardingStatus('completed');

      setOnboardingStatus('completed');
      clearStoredOnboardingState();
    } finally {
      setIsLoading(false);
    }
  }, [totalSteps]);

  const setLoading = useCallback((loading: boolean) => {
    setIsLoading(loading);
  }, []);

  // Check if all steps are complete
  useEffect(() => {
    // Prevent infinite loops by checking if completion is already in progress
    if (completionInProgressRef.current) return;

    const allStepsComplete = steps.every(step => step.isComplete);
    if (allStepsComplete && currentStep === totalSteps - 1 && onboardingStatus === 'in_progress') {
      completionInProgressRef.current = true;

      // Call completeOnboarding directly without dependency to avoid infinite loop
      (async () => {
        try {
          setIsLoading(true);

          setOnboardingStatus('completed');
          clearStoredOnboardingState();
        } finally {
          setIsLoading(false);
          completionInProgressRef.current = false;
        }
      })();
    }
  }, [steps, currentStep, totalSteps, onboardingStatus]);

  return {
    isOpen,
    currentStep,
    totalSteps,
    onboardingStatus,
    steps,
    completedSteps,
    isLoading,
    canGoBack,
    canGoNext,
    isFirstStep,
    isLastStep,
    goToNextStep,
    goToPreviousStep,
    goToStep,
    completeCurrentStep,
    completeOnboarding,
    setLoading,
  };
}
