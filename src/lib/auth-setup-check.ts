/**
 * Authentication and Setup Check Utility
 *
 * This module handles checking user/business setup status at login time
 * and caching it for the session to avoid repeated API calls.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export interface SetupStatus {
  isComplete: boolean;
  hasBusinessProfile: boolean;
  hasCustomers: boolean;
  hasReviewRequests: boolean;
  hasBillingSetup: boolean;
  businessName?: string;
  businessId?: string;
}

/**
 * Check setup status for a business (called once at login)
 * Results should be stored in session/cookie to avoid repeated checks
 */
export async function checkBusinessSetupStatus(businessId: string): Promise<SetupStatus> {
  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        isActive: true,
        settings: true,
        _count: {
          select: {
            customers: true,
            reviewRequests: true,
          },
        },
      },
    });

    if (!business) {
      return {
        isComplete: false,
        hasBusinessProfile: false,
        hasCustomers: false,
        hasReviewRequests: false,
        hasBillingSetup: false,
      };
    }

    // Determine setup completion based on business data
    const hasCustomers = business._count.customers > 0;
    const hasReviewRequests = business._count.reviewRequests > 0;
    const hasSettings = business.settings && Object.keys(business.settings as object).length > 0;

    // For MVP, consider setup complete if business exists and is active
    const isComplete = business.isActive && (hasCustomers || hasSettings);

    return {
      isComplete,
      hasBusinessProfile: true,
      hasCustomers,
      hasReviewRequests,
      hasBillingSetup: false, // Billing not implemented in MVP
      businessName: business.name,
      businessId: business.id,
    };
  } catch (error) {
    logger.error('Failed to check business setup status', { businessId, error });

    // Return safe defaults on error
    return {
      isComplete: true, // Don't block users on error
      hasBusinessProfile: true,
      hasCustomers: false,
      hasReviewRequests: false,
      hasBillingSetup: false,
      businessId,
    };
  }
}

/**
 * Cache setup status in session storage (client-side)
 */
export function cacheSetupStatus(status: SetupStatus): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(
      'setup-status',
      JSON.stringify({
        ...status,
        cachedAt: new Date().toISOString(),
      })
    );
  }
}

/**
 * Get cached setup status from session storage
 */
export function getCachedSetupStatus(): SetupStatus | null {
  if (typeof window === 'undefined') return null;

  const cached = sessionStorage.getItem('setup-status');
  if (!cached) return null;

  try {
    const data = JSON.parse(cached);

    // Check if cache is older than 1 hour
    const cachedAt = new Date(data.cachedAt);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

    if (cachedAt < hourAgo) {
      sessionStorage.removeItem('setup-status');
      return null;
    }

    return data;
  } catch {
    sessionStorage.removeItem('setup-status');
    return null;
  }
}

/**
 * Clear cached setup status (on logout or when data changes)
 */
export function clearSetupStatusCache(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('setup-status');
  }
}
