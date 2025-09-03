'use client';

import React from 'react';
import { setMockOnboardingState, resetOnboarding } from '@/services/onboarding';
import { useOnboardingContext } from '@/contexts/OnboardingContext';

/**
 * Development helper component for testing different onboarding states
 * Remove this from production builds
 */
export function OnboardingTestControls() {
  const { refreshOnboardingStatus, profile } = useOnboardingContext();

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const handleSetState = async (state: {
    status?: 'pending' | 'in_progress' | 'completed';
    currentStep?: number;
    completedSteps?: number[];
  }) => {
    setMockOnboardingState(state);
    await refreshOnboardingStatus();
  };

  const handleReset = async () => {
    await resetOnboarding();
    await refreshOnboardingStatus();
  };

  return (
    <div className="fixed bottom-4 left-4 z-50 bg-gray-900 text-white p-4 rounded-lg shadow-lg max-w-sm">
      <div className="text-xs font-mono mb-3">
        <div>🔧 Dev: Onboarding Test Controls</div>
        <div className="text-gray-400">
          Status: {profile?.status || 'loading'} | Step: {profile?.currentStep || 0}
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() =>
              handleSetState({ status: 'pending', currentStep: 0, completedSteps: [] })
            }
            className="px-2 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-xs transition-colors"
          >
            Pending
          </button>
          <button
            onClick={() =>
              handleSetState({ status: 'in_progress', currentStep: 1, completedSteps: [0] })
            }
            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs transition-colors"
          >
            In Progress
          </button>
          <button
            onClick={() =>
              handleSetState({ status: 'completed', currentStep: 4, completedSteps: [0, 1, 2, 3] })
            }
            className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs transition-colors"
          >
            Completed
          </button>
          <button
            onClick={handleReset}
            className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors"
          >
            Reset
          </button>
        </div>

        <div className="border-t border-gray-700 pt-2">
          <div className="text-xs text-gray-400 mb-1">Quick Steps:</div>
          <div className="grid grid-cols-4 gap-1">
            {[0, 1, 2, 3].map(step => (
              <button
                key={step}
                onClick={() =>
                  handleSetState({
                    status: 'in_progress',
                    currentStep: step,
                    completedSteps: Array.from({ length: step }, (_, i) => i),
                  })
                }
                className="px-1 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
              >
                S{step}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
