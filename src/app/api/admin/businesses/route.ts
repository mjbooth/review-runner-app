import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

// Developer access check - you can customize this based on your auth strategy
function isDeveloperUser(userId: string, email?: string): boolean {
  // For now, allow in development environment
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  // In production, check for developer email domain or role
  if (email?.endsWith('@reviewrunner.dev') || email?.endsWith('@reviewrunner.com')) {
    return true;
  }

  // TODO: Add Clerk metadata check for developer role
  // const user = await clerkClient.users.getUser(userId);
  // return user.publicMetadata?.role === 'developer';

  return false;
}

export async function GET(_request: NextRequest) {
  try {
    // In development, bypass auth for testing
    let userId = 'dev-user';
    let isDeveloper = true;

    if (process.env.NODE_ENV !== 'development') {
      const authResult = await auth();
      userId = authResult.userId || '';

      if (!userId) {
        return NextResponse.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
          { status: 401 }
        );
      }

      // Check if user has developer access
      // TODO: Get user email from Clerk for production checks
      isDeveloper = isDeveloperUser(userId, 'dev@example.com');
    }

    if (!isDeveloper) {
      logger.warn({ userId, event: 'Unauthorized admin access attempt' });
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Developer access required' } },
        { status: 403 }
      );
    }

    // Fetch all businesses with key metrics for the switcher
    const businesses = await prisma.business.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
        smsCreditsUsed: true,
        smsCreditsLimit: true,
        emailCreditsUsed: true,
        emailCreditsLimit: true,
        _count: {
          select: {
            customers: { where: { isActive: true } },
            reviewRequests: { where: { isActive: true } },
            suppressions: { where: { isActive: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Transform for frontend consumption
    const businessList = businesses.map(business => ({
      id: business.id,
      name: business.name,
      email: business.email,
      isActive: business.isActive,
      createdAt: business.createdAt,
      metrics: {
        customers: business._count.customers,
        reviewRequests: business._count.reviewRequests,
        suppressions: business._count.suppressions,
        smsUsage: `${business.smsCreditsUsed}/${business.smsCreditsLimit}`,
        emailUsage: `${business.emailCreditsUsed}/${business.emailCreditsLimit}`,
      },
      status: business.isActive ? 'Active' : 'Inactive',
    }));

    logger.info({
      event: 'Admin businesses fetched',
      userId,
      businessCount: businesses.length,
    });

    return NextResponse.json({
      success: true,
      data: businessList,
    });
  } catch (error) {
    logger.error({ event: 'Error fetching admin businesses', error });
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch businesses' },
      },
      { status: 500 }
    );
  }
}
