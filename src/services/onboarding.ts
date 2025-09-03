'use client';

import type { OnboardingStatus } from '@/hooks/useOnboarding';
import { getAuthHeaders } from '@/lib/auth-headers';

// API base URL
const API_BASE = '/api';

export interface OnboardingProfile {
  id: string;
  userId: string;
  businessId?: string;
  status: OnboardingStatus;
  currentStep: number;
  completedSteps: number[];
  businessData?: {
    name?: string;
    address?: string;
    phone?: string;
    website?: string;
    placeId?: string;
    googleMapsUrl?: string;
  };
  customerData?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface OnboardingApiResponse {
  success: boolean;
  data?: OnboardingProfile;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Get onboarding status from API
export async function getOnboardingStatus(): Promise<OnboardingApiResponse> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/users/onboarding`, {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      // If user/business doesn't exist (404), treat as needs onboarding
      if (
        response.status === 404 &&
        (data.error?.message?.includes('No business found') ||
          data.error?.message?.includes('User not found'))
      ) {
        console.log('User/business not found - assuming user needs onboarding');
        return {
          success: true,
          data: {
            id: 'new-user',
            userId: 'new-user',
            businessId: undefined,
            status: 'pending' as OnboardingStatus,
            currentStep: 0,
            completedSteps: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'FETCH_ERROR',
          message: data.error?.message || 'Failed to retrieve onboarding status',
          details: data,
        },
      };
    }

    // Transform API response to OnboardingProfile format
    const responseData = data.data || data; // Handle wrapped response
    const profile: OnboardingProfile = {
      id: responseData.id || 'default-id',
      userId: responseData.userId || responseData.clerkUserId || 'default-user',
      businessId: responseData.businessId,
      status: (responseData.status || responseData.onboardingStatus
        ? (responseData.status || responseData.onboardingStatus).toLowerCase()
        : 'pending') as OnboardingStatus,
      currentStep: responseData.currentStep || responseData.onboardingStep || 0,
      completedSteps: responseData.completedSteps || responseData.onboardingCompletedSteps || [],
      businessData:
        responseData.businessData ||
        (responseData.business
          ? {
              name: responseData.business.name,
              address: responseData.business.address,
              phone: responseData.business.phone,
              website: responseData.business.website,
              placeId: responseData.business.placeId || responseData.business.googlePlaceId,
              googleMapsUrl: responseData.business.googleMapsUrl,
            }
          : undefined),
      createdAt: responseData.createdAt || new Date().toISOString(),
      updatedAt: responseData.updatedAt || new Date().toISOString(),
      completedAt: responseData.completedAt || responseData.onboardingCompletedAt,
    };

    return {
      success: true,
      data: profile,
    };
  } catch (error) {
    console.error('Failed to fetch onboarding status:', error);
    return {
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to retrieve onboarding status',
        details: error,
      },
    };
  }
}

// Update onboarding status via API
export async function updateOnboardingStatus(
  updates: Partial<OnboardingProfile>
): Promise<OnboardingApiResponse> {
  try {
    const headers = await getAuthHeaders();

    // Transform to API format
    const apiUpdates: any = {};
    if (updates.status) apiUpdates.onboardingStatus = updates.status.toUpperCase();
    if (updates.currentStep !== undefined) apiUpdates.onboardingStep = updates.currentStep;
    if (updates.completedSteps) apiUpdates.onboardingCompletedSteps = updates.completedSteps;

    const response = await fetch(`${API_BASE}/users/onboarding`, {
      method: 'PATCH',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(apiUpdates),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: 'UPDATE_ERROR',
          message: data.error || 'Failed to update onboarding status',
          details: data,
        },
      };
    }

    // Transform response back to OnboardingProfile format
    const responseData = data.data || data; // Handle wrapped response
    const profile: OnboardingProfile = {
      id: responseData.id || 'default-id',
      userId: responseData.userId || responseData.clerkUserId || 'default-user',
      businessId: responseData.businessId,
      status: (responseData.status || responseData.onboardingStatus
        ? (responseData.status || responseData.onboardingStatus).toLowerCase()
        : 'pending') as OnboardingStatus,
      currentStep: responseData.currentStep || responseData.onboardingStep || 0,
      completedSteps: responseData.completedSteps || responseData.onboardingCompletedSteps || [],
      businessData:
        responseData.businessData ||
        (responseData.business
          ? {
              name: responseData.business.name,
              address: responseData.business.address,
              phone: responseData.business.phone,
              website: responseData.business.website,
              placeId: responseData.business.placeId || responseData.business.googlePlaceId,
              googleMapsUrl: responseData.business.googleMapsUrl,
            }
          : undefined),
      createdAt: responseData.createdAt || new Date().toISOString(),
      updatedAt: responseData.updatedAt || new Date().toISOString(),
      completedAt: responseData.completedAt || responseData.onboardingCompletedAt,
    };

    return {
      success: true,
      data: profile,
    };
  } catch (error) {
    console.error('Failed to update onboarding status:', error);
    return {
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update onboarding status',
        details: error,
      },
    };
  }
}

// Complete onboarding via API
export async function completeOnboarding(): Promise<OnboardingApiResponse> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/users/onboarding/complete`, {
      method: 'POST',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: 'COMPLETE_ERROR',
          message: data.error || 'Failed to complete onboarding',
          details: data,
        },
      };
    }

    // Transform response
    const responseData = data.data || data; // Handle wrapped response
    const profile: OnboardingProfile = {
      id: responseData.id || 'default-id',
      userId: responseData.userId || responseData.clerkUserId || 'default-user',
      businessId: responseData.businessId,
      status: 'completed',
      currentStep: responseData.currentStep || responseData.onboardingStep || 999,
      completedSteps: responseData.completedSteps || responseData.onboardingCompletedSteps || [],
      businessData:
        responseData.businessData ||
        (responseData.business
          ? {
              name: responseData.business.name,
              address: responseData.business.address,
              phone: responseData.business.phone,
              website: responseData.business.website,
              placeId: responseData.business.placeId || responseData.business.googlePlaceId,
              googleMapsUrl: responseData.business.googleMapsUrl,
            }
          : undefined),
      createdAt: responseData.createdAt || new Date().toISOString(),
      updatedAt: responseData.updatedAt || new Date().toISOString(),
      completedAt:
        responseData.completedAt || responseData.onboardingCompletedAt || new Date().toISOString(),
    };

    return {
      success: true,
      data: profile,
    };
  } catch (error) {
    console.error('Failed to complete onboarding:', error);
    return {
      success: false,
      error: {
        code: 'COMPLETE_ERROR',
        message: 'Failed to complete onboarding',
        details: error,
      },
    };
  }
}

// Reset onboarding via API (development)
export async function resetOnboarding(): Promise<OnboardingApiResponse> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/users/onboarding/reset`, {
      method: 'POST',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: 'RESET_ERROR',
          message: data.error || 'Failed to reset onboarding',
          details: data,
        },
      };
    }

    // Transform response
    const profile: OnboardingProfile = {
      id: data.id || 'default-id',
      userId: data.clerkUserId || 'default-user',
      businessId: data.businessId || 'default-business',
      status: 'pending',
      currentStep: 0,
      completedSteps: [],
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      completedAt: null,
    };

    return {
      success: true,
      data: profile,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'RESET_ERROR',
        message: 'Failed to reset onboarding',
        details: error,
      },
    };
  }
}

// Utility function to check if user needs onboarding
export function needsOnboarding(profile?: OnboardingProfile | null): boolean {
  if (!profile) return true;
  return profile.status !== 'completed';
}

// Update user profile during onboarding
export async function updateUserProfile(updates: {
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE}/users/profile`, {
      method: 'PATCH',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const data = await response.json();
      return {
        success: false,
        error: data.error || 'Failed to update user profile',
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to update user profile:', error);
    return {
      success: false,
      error: 'Failed to update user profile',
    };
  }
}

// Development helper function to set specific onboarding states
// This now makes an API call instead of using localStorage
export async function setMockOnboardingState(state: {
  status?: OnboardingStatus;
  currentStep?: number;
  completedSteps?: number[];
}): Promise<void> {
  try {
    await updateOnboardingStatus(state);
    console.log('Onboarding state updated via API:', state);
  } catch (error) {
    console.error('Failed to update onboarding state:', error);
  }
}
