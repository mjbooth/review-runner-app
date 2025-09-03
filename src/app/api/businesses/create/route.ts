import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  let userId: string | null = null;

  try {
    const authResult = await auth();
    userId = authResult.userId;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, phone, address, website, googleMapsUrl, placeId } = body;

    // Get the user first
    const user = await prisma.user.findUnique({
      where: { clerkUserId: userId },
      include: { business: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } },
        { status: 404 }
      );
    }

    // If user already has a business, return it
    if (user.business) {
      return NextResponse.json({
        success: true,
        data: user.business,
      });
    }

    // Create new business for the user
    const business = await prisma.business.create({
      data: {
        clerkUserId: userId,
        name: name || `${user.firstName || 'Business'}'s Business`,
        email: user.email,
        phone: phone || null,
        address: address || null,
        website: website || null,
        googleMapsUrl: googleMapsUrl || null,
        googlePlaceId: placeId || null,
        smsCreditsLimit: 100,
        emailCreditsLimit: 500,
        smsCreditsUsed: 0,
        emailCreditsUsed: 0,
        isActive: true,
      },
    });

    // Update user with business ID
    await prisma.user.update({
      where: { id: user.id },
      data: {
        businessId: business.id,
        onboardingStatus: 'IN_PROGRESS',
      },
    });

    logger.info({
      event: 'Business created for new user',
      businessId: business.id,
      userId: user.id,
      clerkUserId: userId,
    });

    return NextResponse.json({
      success: true,
      data: business,
    });
  } catch (error) {
    logger.error({
      event: 'Business creation failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: userId || 'unknown',
    });

    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: 'Failed to create business' } },
      { status: 500 }
    );
  }
}
