import { type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

/**
 * Simple business context extracted directly from Clerk authentication
 * Direct user authentication for business context
 */
export interface BusinessContext {
  businessId: string;
}

/**
 * Get business context from authenticated Clerk user
 * Secure authentication context for proper multi-tenancy
 */
export async function getBusinessContext(request?: NextRequest): Promise<BusinessContext> {
  // Get current authenticated user
  const { userId } = await auth();
  if (!userId) {
    throw new Error('UNAUTHORIZED: Not authenticated');
  }

  // Get user first, then their business
  const user = await prisma.user.findUnique({
    where: { clerkUserId: userId },
    include: { business: { select: { id: true, isActive: true } } },
  });

  if (!user) {
    throw new Error(
      'USER_NOT_FOUND: User not found - may need to be created via webhook or profile endpoint'
    );
  }

  if (!user.business || !user.businessId) {
    throw new Error(
      'BUSINESS_NOT_FOUND: No business found for this user. Please complete onboarding.'
    );
  }

  const business = user.business;

  if (!business.isActive) {
    throw new Error('BUSINESS_INACTIVE: Business is not active');
  }

  return {
    businessId: business.id,
  };
}
