'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { CustomerManagementPage } from '../../components/dashboard/customers/CustomerManagementPage';
import { useOnboardingContext, useOnboardingBlocker } from '@/contexts/OnboardingContext';
import { DashboardOnboardingModal } from '@/components/dashboard/DashboardOnboardingModal';
import { DashboardOverlay, LoadingOverlay } from '@/components/dashboard/DashboardOverlay';
import { OnboardingTestControls } from '@/components/dev/OnboardingTestControls';
import { cn } from '@/lib/utils';
import { addAuthHeaders } from '@/lib/auth-headers';

// Dashboard Overview Component
export default function DashboardPage() {
  // Use real Clerk authentication
  const { isLoaded, user } = useUser();

  // Onboarding context
  const {
    profile: onboardingProfile,
    isLoading: onboardingLoading,
    error: onboardingError,
    needsOnboarding,
    isOnboardingModalOpen,
    setOnboardingModalOpen,
    completeOnboardingFlow,
  } = useOnboardingContext();

  const { shouldBlockInteractions } = useOnboardingBlocker();

  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalRequests: 0,
    emailsSent: 0,
    smsSent: 0,
    clickRate: 0,
    deliveryRate: 0,
  });
  const [recentRequests, setRecentRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Track if we should skip dashboard loading due to onboarding
  const shouldSkipDashboardLoad = needsOnboarding && isOnboardingModalOpen;

  // Use same-origin API calls (no separate backend for MVP)
  const API_BASE = '';

  const fetchDashboardStats = useCallback(async () => {
    // Skip API calls if onboarding is active
    if (shouldSkipDashboardLoad) {
      console.log('Skipping dashboard stats fetch - onboarding active');
      return;
    }

    try {
      // Fetch real data from multiple endpoints
      const [customersResponse, reviewRequestsResponse] = await Promise.all([
        fetch(`${API_BASE}/api/customers`, {
          method: 'GET',
          headers: addAuthHeaders(),
        }),
        fetch(`${API_BASE}/api/review-requests`, {
          method: 'GET',
          headers: addAuthHeaders(),
        }),
      ]);

      const customersData = await customersResponse.json();
      const reviewRequestsData = await reviewRequestsResponse.json();

      // Check for HTTP errors first
      if (!customersResponse.ok || !reviewRequestsResponse.ok) {
        let errorMessage = 'Dashboard API error: ';
        if (!customersResponse.ok) {
          errorMessage += `Customers API (${customersResponse.status}): ${customersData.error?.message || customersResponse.statusText}`;
        }
        if (!reviewRequestsResponse.ok) {
          if (!customersResponse.ok) errorMessage += ', ';
          errorMessage += `Review Requests API (${reviewRequestsResponse.status}): ${reviewRequestsData.error?.message || reviewRequestsResponse.statusText}`;
        }
        throw new Error(errorMessage);
      }

      // Check for business logic errors
      if (!customersData.success || !reviewRequestsData.success) {
        let errorMessage = 'Dashboard API error: ';
        if (!customersData.success) {
          errorMessage += `Customers: ${customersData.error?.message || 'Unknown error'}`;
        }
        if (!reviewRequestsData.success) {
          if (!customersData.success) errorMessage += ', ';
          errorMessage += `Review Requests: ${reviewRequestsData.error?.message || 'Unknown error'}`;
        }
        throw new Error(errorMessage);
      }

      // Both APIs succeeded, process the data
      const customers = customersData.data;
      const requests = reviewRequestsData.data;

      // Calculate real statistics
      const totalCustomers = customers.length;
      const totalRequests = requests.length;
      const emailRequests = requests.filter((r: any) => r.channel === 'EMAIL');
      const smsRequests = requests.filter((r: any) => r.channel === 'SMS');
      const clickedRequests = requests.filter((r: any) => r.clickedAt);
      const deliveredRequests = requests.filter((r: any) => r.deliveredAt || r.sentAt);

      const clickRate = totalRequests > 0 ? (clickedRequests.length / totalRequests) * 100 : 0;
      const deliveryRate = totalRequests > 0 ? (deliveredRequests.length / totalRequests) * 100 : 0;

      setStats({
        totalCustomers,
        totalRequests,
        emailsSent: emailRequests.length,
        smsSent: smsRequests.length,
        clickRate: Math.round(clickRate * 10) / 10,
        deliveryRate: Math.round(deliveryRate * 10) / 10,
      });

      // Set recent requests (last 10)
      setRecentRequests(requests.slice(-10).reverse());
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error, {
        hint: 'Ensure the Next.js application is running on http://localhost:3000 and API routes are accessible. Check authentication and business setup status.',
      });
      setStats({
        totalCustomers: 0,
        totalRequests: 0,
        emailsSent: 0,
        smsSent: 0,
        clickRate: 0,
        deliveryRate: 0,
      });
      setLoading(false);
    }
  }, [shouldSkipDashboardLoad, API_BASE]);

  useEffect(() => {
    // Only fetch dashboard stats if onboarding is complete or not needed
    if (!shouldSkipDashboardLoad && !onboardingLoading) {
      fetchDashboardStats();
    }
  }, [shouldSkipDashboardLoad, onboardingLoading, fetchDashboardStats]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SENT':
      case 'DELIVERED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'CLICKED':
      case 'COMPLETED':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'QUEUED':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'FAILED':
      case 'BOUNCED':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'OPTED_OUT':
        return 'bg-gray-50 text-gray-700 border-gray-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Handle onboarding completion
  const handleOnboardingComplete = async () => {
    console.log('Onboarding completed, refreshing dashboard...');

    // Complete the onboarding flow in the backend
    const success = await completeOnboardingFlow();

    if (success) {
      // Onboarding context will automatically close modal and update needsOnboarding
      // Refresh dashboard data now that onboarding is complete
      setTimeout(() => {
        fetchDashboardStats();
      }, 1000);
    } else {
      // If completion failed, still close the modal but show an error
      console.error('Failed to complete onboarding, but closing modal anyway');
      setOnboardingModalOpen(false);
    }
  };

  // Show loading state while checking user auth
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // Redirect to sign in if no user
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Please sign in</h1>
          <Link href="/auth/sign-in" className="btn-primary">
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  // Show loading overlay while checking onboarding status
  if (onboardingLoading) {
    return (
      <div className="relative">
        <CustomerManagementPage />
        <LoadingOverlay />
      </div>
    );
  }

  // Show error state if onboarding check failed
  if (onboardingError && !onboardingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Setup Error</h1>
          <p className="text-gray-600 mb-6">
            We couldn't load your account setup status. Please try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-forgedorange-500 text-white rounded-lg hover:bg-forgedorange-600 transition-colors"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Main Dashboard Content */}
      <div
        className={cn(
          'transition-all duration-300',
          shouldBlockInteractions && 'pointer-events-none select-none'
        )}
      >
        <CustomerManagementPage />
      </div>

      {/* Dashboard Overlay when onboarding is active */}
      {shouldBlockInteractions && (
        <DashboardOverlay
          isVisible={true}
          onboardingStep={onboardingProfile?.currentStep || 0}
          totalSteps={4}
        />
      )}

      {/* Onboarding Modal */}
      <DashboardOnboardingModal
        isOpen={isOnboardingModalOpen}
        onComplete={handleOnboardingComplete}
      />

      {/* Development Test Controls */}
      <OnboardingTestControls />
    </div>
  );
}
