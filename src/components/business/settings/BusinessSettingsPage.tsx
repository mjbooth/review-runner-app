'use client';

import React, { useState, useEffect } from 'react';
import { BusinessProfileSection } from './BusinessProfileSection';
import { ReviewRequestSettingsSection } from './ReviewRequestSettingsSection';
import { DataSyncPanel } from './DataSyncPanel';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

interface BusinessData {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  timezone?: string;
  googlePlaceId?: string;
  googlePlaceName?: string;
  googleReviewUrl?: string;
  googleMapsUrl?: string;
  googleRating?: number;
  googleReviewCount?: number;
  googleTypes?: string[];
  googlePhoneNumber?: string;
  googleWebsite?: string;
  googlePhotos?: any;
  lastSyncedAt?: string;
  smsCreditsUsed?: number;
  smsCreditsLimit?: number;
  emailCreditsUsed?: number;
  emailCreditsLimit?: number;
  settings?: {
    businessHours: Record<string, { open: string; close: string; enabled: boolean }>;
    defaultChannel: 'EMAIL' | 'SMS';
    followUpSettings: {
      enabled: boolean;
      delayDays: number[];
      maxAttempts: number;
    };
  };
}

export function BusinessSettingsPage() {
  const [businessData, setBusinessData] = useState<BusinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Fetch business data on component mount
  useEffect(() => {
    fetchBusinessData();
  }, []);

  const fetchBusinessData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/businesses/current');
      if (!response.ok) {
        throw new Error('Failed to fetch business data');
      }

      const result = await response.json();
      if (result.success && result.data) {
        setBusinessData(result.data);
        setLastSyncTime(result.data.lastSyncedAt ? new Date(result.data.lastSyncedAt) : null);
      } else {
        throw new Error(result.error?.message || 'Failed to load business data');
      }
    } catch (err) {
      console.error('Error fetching business data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load business settings');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshGoogleData = async () => {
    try {
      setSyncing(true);
      setSyncError(null);

      const response = await fetch('/api/businesses/refresh-google-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to refresh Google data');
      }

      const result = await response.json();
      if (result.success) {
        // Refresh the business data
        await fetchBusinessData();
        setLastSyncTime(new Date());
      } else {
        throw new Error(result.error?.message || 'Failed to refresh Google data');
      }
    } catch (err) {
      console.error('Error refreshing Google data:', err);
      setSyncError(err instanceof Error ? err.message : 'Failed to refresh Google data');
    } finally {
      setSyncing(false);
    }
  };

  const handleSettingsUpdate = async (newSettings: Partial<BusinessData['settings']>) => {
    try {
      // This would typically make an API call to update settings
      // For now, we'll just update the local state
      if (businessData) {
        setBusinessData({
          ...businessData,
          settings: {
            ...businessData.settings,
            ...newSettings,
          },
        });
      }
    } catch (err) {
      console.error('Error updating settings:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center mr-4">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-800">Error Loading Settings</h3>
                <p className="text-red-600">{error}</p>
                <button
                  onClick={fetchBusinessData}
                  className="mt-3 text-sm text-red-700 underline hover:text-red-800"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!businessData) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Business Data Found</h2>
            <p className="text-gray-600 mb-4">Please complete your business setup first.</p>
            <button
              onClick={() => (window.location.href = '/onboarding')}
              className="px-4 py-2 bg-forgedorange-600 text-white rounded-lg hover:bg-forgedorange-700 transition-colors"
            >
              Complete Setup
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-charcoal">Business Settings</h1>
                <p className="text-gray-600 mt-2">
                  Manage your business profile and review request settings
                </p>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center space-x-4">
                <DataSyncPanel
                  lastSyncTime={lastSyncTime}
                  syncing={syncing}
                  syncError={syncError}
                  onRefresh={handleRefreshGoogleData}
                />
              </div>
            </div>
          </div>

          {/* Settings Sections */}
          <div className="space-y-8">
            {/* Section 1: Business Profile */}
            <BusinessProfileSection businessData={businessData} />

            {/* Section 2: Review Request Settings */}
            <ReviewRequestSettingsSection
              settings={businessData.settings}
              onUpdate={handleSettingsUpdate}
            />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
