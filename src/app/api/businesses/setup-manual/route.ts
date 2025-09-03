import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { ApiSuccessResponse, ApiErrorResponse } from '@/types/api';

// Validation schema for manual business setup
const setupManualSchema = z.object({
  businessName: z.string().min(1).max(100),
  businessEmail: z.string().email(),
  businessPhone: z.string().optional(),
  businessAddress: z.string().min(1),
  businessWebsite: z.string().url().optional(),
  timezone: z.string().default('Europe/London'),
});

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      const response: ApiErrorResponse = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      };
      return NextResponse.json(response, { status: 401 });
    }

    const body = await request.json();
    const data = setupManualSchema.parse(body);

    logger.info('Setting up business manually', {
      businessName: data.businessName,
      userId,
    });

    // Check if business already exists for this user
    const existingBusiness = await prisma.business.findUnique({
      where: { clerkUserId: userId },
      select: { id: true, name: true },
    });

    if (existingBusiness) {
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: 'BUSINESS_EXISTS',
          message: 'Business profile already exists for this user',
        },
      };
      return NextResponse.json(response, { status: 409 });
    }

    // Create business without Google Places data and link to user in a transaction
    const result = await prisma.$transaction(async tx => {
      // Create the business
      const business = await tx.business.create({
        data: {
          clerkUserId: userId,
          name: data.businessName,
          email: data.businessEmail,
          phone: data.businessPhone || null,
          address: data.businessAddress,
          website: data.businessWebsite || null,
          timezone: data.timezone,
          // No Google Places data for manual entry
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          website: true,
          googlePlaceId: true,
          googlePlaceName: true,
          googleReviewUrl: true,
          googleMapsUrl: true,
          googleRating: true,
          googleReviewCount: true,
          timezone: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Update the user record to link to this business (or create if it doesn't exist)
      await tx.user.upsert({
        where: { clerkUserId: userId },
        update: {
          businessId: business.id,
          lastActiveAt: new Date(),
        },
        create: {
          clerkUserId: userId,
          businessId: business.id,
          email: data.businessEmail,
          onboardingStatus: 'IN_PROGRESS',
          onboardingStep: 1,
          onboardingCompletedSteps: [0],
          lastActiveAt: new Date(),
        },
      });

      return business;
    });

    const business = result;

    logger.info('Business created successfully manually', {
      businessId: business.id,
      businessName: business.name,
      userId,
    });

    const response: ApiSuccessResponse<typeof business> = {
      success: true,
      data: business,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.errors,
        },
      };
      return NextResponse.json(response, { status: 400 });
    }

    logger.error('Setup business manually API error', {
      error: error instanceof Error ? error.message : String(error),
      userId: (await auth()).userId,
    });

    const response: ApiErrorResponse = {
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Internal server error' },
    };
    return NextResponse.json(response, { status: 500 });
  }
}
