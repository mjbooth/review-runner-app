'use client';

import React from 'react';
import { Loader2, Settings } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

interface DashboardOverlayProps {
  isVisible: boolean;
  onboardingStep?: number;
  totalSteps?: number;
  className?: string;
}

export function DashboardOverlay({
  isVisible,
  onboardingStep = 0,
  totalSteps = 4,
  className,
}: DashboardOverlayProps) {
  if (!isVisible) return null;

  const stepNames = [
    'Setting up your business profile',
    'Adding your first customer',
    'Creating your first review request',
    'Finalizing your setup',
  ];

  const currentStepName = stepNames[onboardingStep] || 'Setting up your account';
  const progressPercentage = totalSteps > 0 ? Math.round((onboardingStep / totalSteps) * 100) : 0;

  return (
    <div
      className={cn(
        'absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm',
        'transition-all duration-300 ease-in-out',
        className
      )}
    >
      <div className="text-center space-y-6 max-w-md px-6">
        {/* Icon */}
        <div className="flex items-center justify-center">
          <div className="relative">
            <div className="w-16 h-16 bg-forgedorange-100 rounded-full flex items-center justify-center">
              <Settings
                className="w-8 h-8 text-forgedorange-600 animate-spin"
                style={{ animationDuration: '3s' }}
              />
            </div>
            <div className="absolute -inset-2 rounded-full border-2 border-forgedorange-200 animate-pulse" />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-charcoal">Setting up your account...</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            We're helping you get everything configured to start collecting reviews from your
            customers.
          </p>
        </div>

        {/* Progress */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700 font-medium">{currentStepName}</span>
            <span className="text-gray-500">{progressPercentage}%</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-forgedorange-500 to-forgedorange-600 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center space-x-2">
            {Array.from({ length: totalSteps }, (_, index) => (
              <div
                key={index}
                className={cn(
                  'w-2 h-2 rounded-full transition-colors duration-300',
                  index <= onboardingStep ? 'bg-forgedorange-500' : 'bg-gray-300'
                )}
              />
            ))}
          </div>
        </div>

        {/* Loading indicator */}
        <div className="flex items-center justify-center space-x-2 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Please wait while we complete your setup</span>
        </div>

        {/* Hint */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-700 text-sm">
            <strong>Almost there!</strong> This setup will only take a couple of minutes and you'll
            be ready to start requesting reviews.
          </p>
        </div>
      </div>
    </div>
  );
}

// Simpler loading overlay for initial status check
interface LoadingOverlayProps {
  className?: string;
}

export function LoadingOverlay({ className }: LoadingOverlayProps) {
  return (
    <div
      className={cn(
        'absolute inset-0 z-10 flex items-center justify-center bg-white/90',
        'transition-opacity duration-300',
        className
      )}
    >
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-4 border-forgedorange-200 border-t-forgedorange-500 rounded-full animate-spin" />
        <p className="text-gray-600 text-sm font-medium">Checking your setup status...</p>
      </div>
    </div>
  );
}
