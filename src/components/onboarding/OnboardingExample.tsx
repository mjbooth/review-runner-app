'use client';

import React, { useState } from 'react';
import { OnboardingModal } from './OnboardingModal';
import { BusinessSearchStep } from './BusinessSearchStep';
import { useOnboarding, type StepValidationFunction } from '@/hooks/useOnboarding';

/**
 * Example usage of the OnboardingModal component
 * This would typically be used in your main dashboard layout
 */
export function OnboardingExample() {
  // Example form state for validation
  const [selectedBusiness, setSelectedBusiness] = useState<{
    name: string;
    address: string;
    placeId?: string;
    googleMapsUrl?: string;
  } | null>(null);
  const [customerName, setCustomerName] = useState('');

  // In a real app, you would get the initial status from the user/business data
  const {
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
    completeOnboarding,
  } = useOnboarding('pending'); // or 'in_progress' if partially completed

  // Example validation function for each step
  const validateCurrentStep: StepValidationFunction = async () => {
    switch (currentStep) {
      case 0: // Business Setup
        if (!selectedBusiness) {
          alert('Please select your business from the search results or enter a Google Maps URL');
          return false;
        }
        // Simulate async validation (API call)
        await new Promise(resolve => setTimeout(resolve, 1000));
        return true;

      case 1: // Add Customer
        if (!customerName.trim()) {
          alert('Please enter a customer name');
          return false;
        }
        return true;

      case 2: // First Review
        // Could validate that review was actually sent
        return true;

      default:
        return true;
    }
  };

  return (
    <OnboardingModal
      isOpen={isOpen}
      onboardingStatus={onboardingStatus}
      currentStep={currentStep}
      totalSteps={totalSteps}
      steps={steps}
      completedSteps={completedSteps}
      isLoading={isLoading}
      canGoBack={canGoBack}
      canGoNext={canGoNext}
      isFirstStep={isFirstStep}
      isLastStep={isLastStep}
      onNextStep={goToNextStep}
      onPreviousStep={goToPreviousStep}
      onCompleteOnboarding={completeOnboarding}
      stepValidation={validateCurrentStep}
    >
      {/* Step-specific content would go here */}
      {currentStep === 0 && (
        <BusinessSearchStep onBusinessSelect={setSelectedBusiness} initialSearchMethod="search" />
      )}

      {currentStep === 1 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-charcoal">Add Your First Customer</h3>
          <p className="text-gray-600">
            Let's add your first customer to the system so you can start requesting reviews.
          </p>

          {/* Customer Name Form */}
          <div className="mt-6">
            <label
              htmlFor="customerName"
              className="block text-sm font-semibold text-charcoal mb-2"
            >
              Customer Name <span className="text-forgedorange-500">*</span>
            </label>
            <input
              type="text"
              id="customerName"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Enter customer name"
              className="w-full bg-white border border-gray-300 rounded-md py-2 px-4 text-base text-charcoal placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-forgedorange-500 focus:border-transparent transition-colors"
              required
            />
          </div>

          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-blue-700">
              You can add customers manually or import them from a CSV file.
            </p>
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-charcoal">Send Your First Review Request</h3>
          <p className="text-gray-600">
            Now let's send your first review request to see the system in action.
          </p>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-sm text-green-700">
              You can customize the message template and send via SMS or email.
            </p>
          </div>
        </div>
      )}

      {currentStep === 3 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-charcoal">Setup Complete!</h3>
          <p className="text-gray-600">
            Congratulations! You've completed the onboarding process and are ready to start
            collecting reviews.
          </p>
          <div className="bg-forgedorange-50 rounded-lg p-4">
            <p className="text-sm text-forgedorange-700">
              You can now start managing customers, sending review requests, and tracking your
              analytics.
            </p>
          </div>
        </div>
      )}
    </OnboardingModal>
  );
}
