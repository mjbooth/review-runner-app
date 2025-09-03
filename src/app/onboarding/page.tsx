'use client';

import { useState, useEffect } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { BusinessSetupForm } from '../../components/onboarding/BusinessSetupForm';
import { GooglePlaceConnection } from '../../components/onboarding/GooglePlaceConnection';
import { OnboardingComplete } from '../../components/onboarding/OnboardingComplete';

type OnboardingStep = 'business-setup' | 'google-place' | 'complete';

export default function OnboardingPage() {
  const { user, isLoaded: userLoaded } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('business-setup');
  const [businessData, setBusinessData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (userLoaded && !user) {
      router.push('/auth/sign-in');
    } else if (userLoaded && user) {
      setIsLoading(false);
      checkExistingBusiness();
    }
  }, [user, userLoaded, router]);

  const checkExistingBusiness = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/businesses/current', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data.googlePlaceId) {
          // Business is fully set up, redirect to dashboard
          router.push('/dashboard');
          return;
        } else if (result.success) {
          // Business exists but no Google Place connected
          setBusinessData(result.data);
          setCurrentStep('google-place');
        }
      }
    } catch (error) {
      console.error('Error checking existing business:', error);
    }
  };

  const handleBusinessSetupComplete = (business: any) => {
    setBusinessData(business);
    setCurrentStep('google-place');
  };

  const handleGooglePlaceComplete = (business: any) => {
    setBusinessData(business);
    setCurrentStep('complete');
  };

  const handleOnboardingComplete = () => {
    router.push('/dashboard');
  };

  if (!userLoaded || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to sign-in
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100">
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Progress indicator */}
          <div className="mb-12">
            <div className="flex items-center justify-center space-x-4">
              <div
                className={`flex items-center ${
                  currentStep === 'business-setup'
                    ? 'text-primary-600'
                    : currentStep === 'google-place' || currentStep === 'complete'
                      ? 'text-green-600'
                      : 'text-gray-400'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${
                    currentStep === 'business-setup'
                      ? 'border-primary-600 bg-primary-50'
                      : currentStep === 'google-place' || currentStep === 'complete'
                        ? 'border-green-600 bg-green-50'
                        : 'border-gray-300'
                  }`}
                >
                  {currentStep === 'google-place' || currentStep === 'complete' ? (
                    <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <span className="text-sm font-medium">1</span>
                  )}
                </div>
                <span className="ml-2 text-sm font-medium">Business Setup</span>
              </div>

              <div
                className={`w-16 h-0.5 ${
                  currentStep === 'google-place' || currentStep === 'complete'
                    ? 'bg-green-600'
                    : 'bg-gray-300'
                }`}
              ></div>

              <div
                className={`flex items-center ${
                  currentStep === 'google-place'
                    ? 'text-primary-600'
                    : currentStep === 'complete'
                      ? 'text-green-600'
                      : 'text-gray-400'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${
                    currentStep === 'google-place'
                      ? 'border-primary-600 bg-primary-50'
                      : currentStep === 'complete'
                        ? 'border-green-600 bg-green-50'
                        : 'border-gray-300'
                  }`}
                >
                  {currentStep === 'complete' ? (
                    <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <span className="text-sm font-medium">2</span>
                  )}
                </div>
                <span className="ml-2 text-sm font-medium">Connect Business</span>
              </div>

              <div
                className={`w-16 h-0.5 ${
                  currentStep === 'complete' ? 'bg-green-600' : 'bg-gray-300'
                }`}
              ></div>

              <div
                className={`flex items-center ${
                  currentStep === 'complete' ? 'text-primary-600' : 'text-gray-400'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${
                    currentStep === 'complete'
                      ? 'border-primary-600 bg-primary-50'
                      : 'border-gray-300'
                  }`}
                >
                  <span className="text-sm font-medium">3</span>
                </div>
                <span className="ml-2 text-sm font-medium">Get Started</span>
              </div>
            </div>
          </div>

          {/* Step content */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            {currentStep === 'business-setup' && (
              <BusinessSetupForm user={user} onComplete={handleBusinessSetupComplete} />
            )}

            {currentStep === 'google-place' && (
              <GooglePlaceConnection
                businessData={businessData}
                onComplete={handleGooglePlaceComplete}
                onSkip={handleGooglePlaceComplete}
              />
            )}

            {currentStep === 'complete' && (
              <OnboardingComplete
                businessData={businessData}
                onComplete={handleOnboardingComplete}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
