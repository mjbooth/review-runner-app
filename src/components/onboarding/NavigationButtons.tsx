'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { type StepValidationFunction } from '@/hooks/useOnboarding';

interface NavigationButtonsProps {
  currentStep: number;
  totalSteps: number;
  isLoading: boolean;
  canGoBack: boolean;
  canGoNext: boolean;
  isFirstStep: boolean;
  isLastStep: boolean;
  onPrevious: () => void;
  onNext: (validate?: StepValidationFunction) => Promise<void>;
  onComplete: () => Promise<void>;
  validate?: StepValidationFunction;
  className?: string;
}

export function NavigationButtons({
  currentStep,
  totalSteps,
  isLoading,
  canGoBack,
  canGoNext,
  isFirstStep,
  isLastStep,
  onPrevious,
  onNext,
  onComplete,
  validate,
  className,
}: NavigationButtonsProps) {
  const handleNext = async () => {
    if (isLastStep) {
      await onComplete();
    } else {
      await onNext(validate);
    }
  };

  const getNextButtonText = () => {
    if (isLoading) {
      return isLastStep ? 'Completing...' : 'Processing...';
    }
    return isLastStep ? 'Complete Setup' : 'Next';
  };

  return (
    <div className={cn('bg-gray-50 px-6 py-4 flex items-center justify-between', className)}>
      {/* Previous Button */}
      <button
        type="button"
        onClick={onPrevious}
        disabled={!canGoBack}
        className={cn(
          'inline-flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus:border-gray-500',
          canGoBack
            ? 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
            : 'text-gray-400 cursor-not-allowed'
        )}
        aria-label="Go to previous step"
      >
        <ChevronLeft className="w-4 h-4 mr-2" />
        Previous
      </button>

      {/* Step counter */}
      <div className="flex items-center space-x-2 text-sm text-gray-500">
        <span>
          Step {currentStep + 1} of {totalSteps}
        </span>
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-forgedorange-500" />}
      </div>

      {/* Next/Complete Button */}
      <button
        type="button"
        onClick={handleNext}
        disabled={!canGoNext}
        className={cn(
          'inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md transition-colors focus:outline-none focus:border-forgedorange-700',
          canGoNext
            ? 'text-white bg-forgedorange-500 hover:bg-forgedorange-600 shadow-sm'
            : 'text-gray-400 bg-gray-200 cursor-not-allowed'
        )}
        aria-label={isLastStep ? 'Complete onboarding' : 'Go to next step'}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {getNextButtonText()}
          </>
        ) : (
          <>
            {getNextButtonText()}
            {!isLastStep && <ChevronRight className="w-4 h-4 ml-2" />}
          </>
        )}
      </button>
    </div>
  );
}
